import type { ListAuditLogsQuery } from '@aer/contracts';
import { auditLogs, users, type Executor } from '@aer/database';
import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';

export interface AuditLogRow {
  id: string;
  action: string;
  actorUserId: string | null;
  actorName: string | null;
  entityType: string | null;
  entityId: string | null;
  requestId: string | null;
  ip: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  /** Timestamp com precisão de microssegundos (o Date do JS perde precisão): usado só no cursor. */
  createdAtCursor: string;
}

const CURSOR_TS = sql<string>`to_char(${auditLogs.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** Cursor = "<timestamp µs>|<uuid>". Paginação por chave: estável mesmo com inserções concorrentes. */
export function encodeCursor(row: Pick<AuditLogRow, 'createdAtCursor' | 'id'>): string {
  return Buffer.from(`${row.createdAtCursor}|${row.id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!createdAt || !id || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(createdAt) || !/^[0-9a-f-]{36}$/.test(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export async function listAuditLogs(
  db: Executor,
  organizationId: string,
  query: ListAuditLogsQuery,
  cursor: { createdAt: string; id: string } | null,
): Promise<AuditLogRow[]> {
  const conditions: (SQL | undefined)[] = [
    eq(auditLogs.organizationId, organizationId),
    query.action ? eq(auditLogs.action, query.action) : undefined,
    query.entityType ? eq(auditLogs.entityType, query.entityType) : undefined,
    query.from ? gte(auditLogs.createdAt, new Date(query.from)) : undefined,
    query.to ? lte(auditLogs.createdAt, new Date(query.to)) : undefined,
    cursor
      ? sql`(${auditLogs.createdAt}, ${auditLogs.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
      : undefined,
  ];

  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorUserId: auditLogs.actorUserId,
      actorName: users.name,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      requestId: auditLogs.requestId,
      ip: auditLogs.ip,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      createdAtCursor: CURSOR_TS,
    })
    .from(auditLogs)
    .leftJoin(users, and(eq(users.id, auditLogs.actorUserId), eq(users.organizationId, auditLogs.organizationId)))
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(query.limit + 1);
}
