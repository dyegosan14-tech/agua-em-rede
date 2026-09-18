import { auditLogs, type Db, type Executor } from '@aer/database';
import type { RequestMeta } from '../../lib/request-meta';

export type AuditAction =
  | 'auth.login.succeeded'
  | 'auth.login.failed'
  | 'auth.logout'
  | 'auth.password.changed'
  | 'user.created'
  | 'user.updated'
  | 'user.password.reset'
  | 'user.sessions.revoked';

export interface AuditEntry {
  organizationId: string | null;
  actorUserId: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  meta: RequestMeta;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_KEY = /pass(word)?|secret|token|cookie|authorization|credential|hash/i;
const MAX_DEPTH = 5;

/** Remove valores sensíveis antes de persistir metadados na trilha de auditoria. */
export function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeMetadata(item, depth + 1));
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeMetadata(item, depth + 1),
      ]),
    );
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

/**
 * Trilha de auditoria append-only (o banco bloqueia UPDATE/DELETE). Ações relevantes chamam `record`
 * passando a transação da própria operação, de modo que fato e registro são atômicos.
 */
export class AuditService {
  constructor(private readonly db: Db) {}

  async record(entry: AuditEntry, executor: Executor = this.db): Promise<void> {
    await executor.insert(auditLogs).values({
      organizationId: entry.organizationId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      requestId: entry.meta.requestId,
      ip: entry.meta.ip,
      userAgent: entry.meta.userAgent,
      metadata: sanitizeMetadata(entry.metadata ?? {}) as Record<string, unknown>,
    });
  }
}
