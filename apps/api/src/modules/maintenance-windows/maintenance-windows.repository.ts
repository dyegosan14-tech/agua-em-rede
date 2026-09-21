import type { ListMaintenanceWindowsQuery, MaintenanceWindowDto } from '@aer/contracts';
import { maintenanceWindows, type Executor } from '@aer/database';
import { and, count, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';

export type MaintenanceWindowRow = typeof maintenanceWindows.$inferSelect;

export function toMaintenanceWindowDto(row: MaintenanceWindowRow): MaintenanceWindowDto {
  return {
    id: row.id,
    sectorId: row.sectorId,
    deviceId: row.deviceId,
    reason: row.reason,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listMaintenanceWindows(
  db: Executor,
  organizationId: string,
  query: ListMaintenanceWindowsQuery,
): Promise<{ rows: MaintenanceWindowRow[]; total: number }> {
  const conditions: (SQL | undefined)[] = [
    eq(maintenanceWindows.organizationId, organizationId),
    isNull(maintenanceWindows.archivedAt),
    query.sectorId ? eq(maintenanceWindows.sectorId, query.sectorId) : undefined,
    query.deviceId ? eq(maintenanceWindows.deviceId, query.deviceId) : undefined,
  ];

  if (query.activeAt) {
    const at = new Date(query.activeAt);
    conditions.push(
      sql`${maintenanceWindows.startsAt} <= ${at} AND ${maintenanceWindows.endsAt} >= ${at} AND ${maintenanceWindows.cancelledAt} IS NULL`,
    );
  }

  const where = and(...conditions);

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(maintenanceWindows)
      .where(where)
      .orderBy(desc(maintenanceWindows.startsAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(maintenanceWindows).where(where),
  ]);

  return { rows, total: totals[0]?.total ?? 0 };
}

export async function insertMaintenanceWindow(
  db: Executor,
  values: {
    organizationId: string;
    sectorId?: string | null;
    deviceId?: string | null;
    reason: string;
    startsAt: Date;
    endsAt: Date;
    createdBy: string;
  },
): Promise<MaintenanceWindowRow> {
  const [row] = await db.insert(maintenanceWindows).values(values).returning();
  if (!row) throw new Error('Falha ao agendar janela de manutenção');
  return row;
}

export async function cancelMaintenanceWindow(
  db: Executor,
  organizationId: string,
  id: string,
): Promise<boolean> {
  const [row] = await db
    .update(maintenanceWindows)
    .set({ cancelledAt: sql`now()` })
    .where(
      and(
        eq(maintenanceWindows.id, id),
        eq(maintenanceWindows.organizationId, organizationId),
        isNull(maintenanceWindows.cancelledAt),
      ),
    )
    .returning();
  return Boolean(row);
}
