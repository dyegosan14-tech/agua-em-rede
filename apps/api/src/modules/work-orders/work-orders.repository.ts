import type { ListWorkOrdersQuery, WorkOrderDto } from '@aer/contracts';
import { workOrderEvents, workOrders, type Executor } from '@aer/database';
import type { DataOrigin, WorkOrderEventType, WorkOrderPriority, WorkOrderStatus } from '@aer/domain';
import { and, count, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';

export type WorkOrderRow = typeof workOrders.$inferSelect;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export function toWorkOrderDto(row: WorkOrderRow): WorkOrderDto {
  return {
    id: row.id,
    number: row.number,
    alertId: row.alertId,
    sectorId: row.sectorId,
    assetId: row.assetId,
    deviceId: row.deviceId,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    assignedTo: row.assignedTo,
    createdBy: row.createdBy,
    dueAt: row.dueAt?.toISOString() ?? null,
    assignedAt: row.assignedAt?.toISOString() ?? null,
    inspectionStartedAt: row.inspectionStartedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancellationReason: row.cancellationReason,
    diagnosis: row.diagnosis,
    inspectionNotes: row.inspectionNotes,
    repairNotes: row.repairNotes,
    repairedAt: row.repairedAt?.toISOString() ?? null,
    estimatedVolumeM3: row.estimatedVolumeM3 !== null ? Number(row.estimatedVolumeM3) : null,
    version: row.version,
    origin: row.origin,
    simulationRunId: row.simulationRunId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listWorkOrders(
  db: Executor,
  organizationId: string,
  query: ListWorkOrdersQuery,
): Promise<{ rows: WorkOrderRow[]; total: number }> {
  const conditions: (SQL | undefined)[] = [
    eq(workOrders.organizationId, organizationId),
    isNull(workOrders.archivedAt),
    query.status ? eq(workOrders.status, query.status) : undefined,
    query.priority ? eq(workOrders.priority, query.priority) : undefined,
    query.assignedTo ? eq(workOrders.assignedTo, query.assignedTo) : undefined,
    query.sectorId ? eq(workOrders.sectorId, query.sectorId) : undefined,
    query.search
      ? or(
          ilike(workOrders.title, `%${escapeLike(query.search)}%`),
          sql`CAST(${workOrders.number} AS TEXT) ILIKE ${`%${escapeLike(query.search)}%`}`,
        )
      : undefined,
  ];
  const where = and(...conditions);

  const [rows, totals] = await Promise.all([
    db.select().from(workOrders).where(where).orderBy(desc(workOrders.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ total: count() }).from(workOrders).where(where),
  ]);

  return { rows, total: totals[0]?.total ?? 0 };
}

export async function findWorkOrder(db: Executor, organizationId: string, workOrderId: string): Promise<WorkOrderRow | null> {
  const [row] = await db
    .select()
    .from(workOrders)
    .where(and(eq(workOrders.id, workOrderId), eq(workOrders.organizationId, organizationId), isNull(workOrders.archivedAt)))
    .limit(1);
  return row ?? null;
}

export async function insertWorkOrder(
  db: Executor,
  values: {
    organizationId: string;
    alertId?: string | null;
    sectorId?: string | null;
    assetId?: string | null;
    deviceId?: string | null;
    title: string;
    description?: string | null;
    priority: WorkOrderPriority;
    status: WorkOrderStatus;
    assignedTo?: string | null;
    assignedAt?: Date | null;
    createdBy: string;
    dueAt?: Date | null;
    origin?: DataOrigin;
    simulationRunId?: string | null;
  },
): Promise<WorkOrderRow> {
  const [row] = await db.insert(workOrders).values(values).returning();
  if (!row) throw new Error('Falha ao criar ordem de serviço');
  return row;
}

export async function updateWorkOrder(
  db: Executor,
  organizationId: string,
  workOrderId: string,
  changes: Partial<Omit<WorkOrderRow, 'id' | 'organizationId' | 'number' | 'createdAt' | 'updatedAt'>>,
): Promise<WorkOrderRow | null> {
  const [row] = await db
    .update(workOrders)
    .set({ ...changes, version: sql`${workOrders.version} + 1`, updatedAt: sql`now()` })
    .where(and(eq(workOrders.id, workOrderId), eq(workOrders.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export async function insertWorkOrderEvent(
  db: Executor,
  values: {
    organizationId: string;
    workOrderId: string;
    eventType: WorkOrderEventType;
    fromStatus?: WorkOrderStatus | null;
    toStatus?: WorkOrderStatus | null;
    actorUserId?: string | null;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(workOrderEvents).values(values);
}
