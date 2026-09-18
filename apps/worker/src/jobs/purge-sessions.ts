import { purgeStaleSessions, type Db } from '@aer/database';
import type { Logger } from 'pino';
import { z } from 'zod';

export const PURGE_SESSIONS_JOB = 'purge-stale-sessions';

export const purgeSessionsPayloadSchema = z.object({
  /** Sessões expiradas/revogadas há mais que isso são removidas. */
  retentionDays: z.number().int().min(1).max(365).default(30),
});

export interface JobDeps {
  db: Db;
  clock: () => Date;
  logger: Logger;
}

/**
 * Remove sessões vencidas. Idempotente por natureza (DELETE com critério temporal): reexecutar após
 * uma falha, ou executar em duas instâncias ao mesmo tempo, não causa dano nem perde dados.
 */
export async function purgeSessionsJob(deps: JobDeps, rawPayload: unknown): Promise<{ removed: number }> {
  const payload = purgeSessionsPayloadSchema.parse(rawPayload);
  const removed = await purgeStaleSessions(deps.db, { now: deps.clock(), retentionDays: payload.retentionDays });
  deps.logger.info({ removed, retentionDays: payload.retentionDays }, 'sessões antigas removidas');
  return { removed };
}
