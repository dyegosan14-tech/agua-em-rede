import type { JobsOptions } from 'bullmq';

export const MAINTENANCE_QUEUE = 'maintenance';

/**
 * Política padrão de execução:
 *  - até 5 tentativas com backoff exponencial (5 s, 10 s, 20 s, 40 s);
 *  - jobs que esgotam as tentativas ficam retidos no Redis por 7 dias (até 1000) para diagnóstico;
 *  - jobs concluídos são descartados rapidamente.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 3_600, count: 100 },
  removeOnFail: { age: 7 * 24 * 3_600, count: 1_000 },
};
