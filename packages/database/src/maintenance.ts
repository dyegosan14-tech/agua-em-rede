import { and, isNotNull, lt, or } from 'drizzle-orm';
import type { Executor } from './client';
import { sessions } from './schema';

/**
 * Remove sessões expiradas ou revogadas há mais de `retentionDays`. Sessões não são histórico
 * operacional (os eventos de login/logout permanecem na trilha de auditoria, que é append-only).
 * Idempotente: pode ser executado repetidamente e por mais de uma instância.
 */
export async function purgeStaleSessions(db: Executor, options: { now: Date; retentionDays: number }): Promise<number> {
  const cutoff = new Date(options.now.getTime() - options.retentionDays * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, cutoff), and(isNotNull(sessions.revokedAt), lt(sessions.revokedAt, cutoff))))
    .returning({ id: sessions.id });
  return deleted.length;
}
