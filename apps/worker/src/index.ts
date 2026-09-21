import { ConfigError, loadDotEnvIfPresent, loadWorkerConfig } from '@aer/config';
import { createDb, createPool } from '@aer/database';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { pino, stdSerializers, stdTimeFunctions } from 'pino';
import { CHECK_NO_COMMUNICATION_JOB } from './jobs/check-no-communication';
import { PURGE_SESSIONS_JOB } from './jobs/purge-sessions';
import { createProcessor } from './processor';
import { DEFAULT_JOB_OPTIONS, MAINTENANCE_QUEUE } from './queues';

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  let config;
  try {
    config = loadWorkerConfig();
  } catch (error) {
    process.stderr.write(`${error instanceof ConfigError ? error.message : String(error)}\n`);
    process.exit(1);
  }

  const logger = pino({
    level: config.logLevel,
    base: { service: 'aer-worker' },
    timestamp: stdTimeFunctions.isoTime,
    redact: { paths: ['*.password', '*.secret', '*.token', '*.authorization', '*.cookie'], censor: '[REDACTED]' },
    serializers: { err: stdSerializers.err },
    ...(config.isProduction ? {} : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } }),
  });

  const pool = createPool({
    url: config.database.url,
    max: config.database.poolMax,
    applicationName: 'aer-worker',
    onError: (err) => logger.error({ err }, 'erro em conexão ociosa do pool do PostgreSQL'),
  });
  const db = createDb(pool);

  // BullMQ exige maxRetriesPerRequest = null nas conexões de Worker (comandos bloqueantes).
  const connection = new Redis(config.redis.url, { maxRetriesPerRequest: null });
  connection.on('error', (err) => logger.warn({ err }, 'Redis indisponível'));

  const queue = new Queue(MAINTENANCE_QUEUE, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
  // Agendamento idempotente: subir N workers não cria N agendamentos (o id do scheduler é a chave).
  await queue.upsertJobScheduler(
    PURGE_SESSIONS_JOB,
    { every: 60 * 60 * 1000 },
    { name: PURGE_SESSIONS_JOB, data: { retentionDays: 30 } },
  );

  // Vigilância periódica de perda de sinal de sensores a cada 5 minutos
  await queue.upsertJobScheduler(
    CHECK_NO_COMMUNICATION_JOB,
    { every: 5 * 60 * 1000 },
    { name: CHECK_NO_COMMUNICATION_JOB, data: {} },
  );

  const processor = createProcessor({ db, logger, clock: () => new Date() });
  const worker = new Worker(MAINTENANCE_QUEUE, (job) => processor(job), { connection, concurrency: 2 });

  worker.on('completed', (job) => logger.info({ jobId: job.id, job: job.name }, 'job concluído'));
  worker.on('failed', (job, err) =>
    logger.error(
      { jobId: job?.id, job: job?.name, attemptsMade: job?.attemptsMade, maxAttempts: job?.opts.attempts, err },
      // Após a última tentativa o job permanece na lista de falhos do BullMQ (removeOnFail) para diagnóstico.
      'job falhou',
    ),
  );
  worker.on('error', (err) => logger.error({ err }, 'erro no worker'));

  logger.info({ queue: MAINTENANCE_QUEUE }, 'worker iniciado');

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'encerrando');
    const force = setTimeout(() => process.exit(1), 30_000);
    force.unref();
    try {
      await worker.close(); // aguarda os jobs em andamento terminarem
      await queue.close();
      connection.disconnect();
      await pool.end();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'falha no encerramento');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  process.stderr.write(`Falha ao iniciar o worker: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exit(1);
});
