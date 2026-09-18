import { ConfigError, loadApiConfig, loadDotEnvIfPresent } from '@aer/config';
import { createDb, createPasswordHasher, createPool } from '@aer/database';
import { buildApp } from './app';
import { createLogger } from './lib/logger';
import { MemoryRateLimiter, RedisRateLimiter, type RateLimiter } from './lib/rate-limiter';
import { createRedis } from './lib/redis';

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  let config;
  try {
    config = loadApiConfig();
  } catch (error) {
    // Falha de configuração na inicialização: mensagem clara (sem valores secretos) e saída imediata.
    process.stderr.write(`${error instanceof ConfigError ? error.message : String(error)}\n`);
    process.exit(1);
  }

  const logger = createLogger(config);
  const pool = createPool({
    url: config.database.url,
    max: config.database.poolMax,
    applicationName: 'aer-api',
    onError: (err) => logger.error({ err }, 'erro em conexão ociosa do pool do PostgreSQL'),
  });
  const db = createDb(pool);

  const redis = createRedis(config.redis.url, logger);
  const memoryLimiter = new MemoryRateLimiter();
  const rateLimiter: RateLimiter =
    config.rateLimit.store === 'redis'
      ? new RedisRateLimiter(redis, memoryLimiter, (err) => logger.warn({ err }, 'rate limit degradado para memória local (Redis indisponível)'))
      : memoryLimiter;

  const passwords = createPasswordHasher({ memoryKib: config.auth.argon2.memoryKib, timeCost: config.auth.argon2.timeCost });
  const app = await buildApp({ config, pool, db, redis, rateLimiter, passwords, logger });

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'encerrando');
    const force = setTimeout(() => process.exit(1), 15_000);
    force.unref();
    try {
      await app.close(); // para de aceitar conexões e espera as requisições em andamento
      redis.disconnect();
      await pool.end();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'falha no encerramento');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: config.api.host, port: config.api.port });
}

main().catch((error: unknown) => {
  process.stderr.write(`Falha ao iniciar a API: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exit(1);
});
