import type { AlertDto, ListAlertsQuery } from '@aer/contracts';
import { alertEvents, alerts, detectionRules, type Executor } from '@aer/database';
import type { AlertEventType, AlertStatus, DataOrigin, RuleKind, Severity } from '@aer/domain';
import { and, count, desc, eq, sql, type SQL } from 'drizzle-orm';

export type AlertRow = typeof alerts.$inferSelect;

export function toAlertDto(row: AlertRow): AlertDto {
  return {
    id: row.id,
    ruleId: row.ruleId,
    sectorId: row.sectorId,
    deviceId: row.deviceId,
    dedupKey: row.dedupKey,
    status: row.status,
    severity: row.severity,
    title: row.title,
    priorityScore: row.priorityScore,
    evidence: row.evidence,
    occurrences: row.occurrences,
    firstDetectedAt: row.firstDetectedAt.toISOString(),
    lastDetectedAt: row.lastDetectedAt.toISOString(),
    recoveryObservedAt: row.recoveryObservedAt?.toISOString() ?? null,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: row.acknowledgedBy,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedBy: row.resolvedBy,
    dismissedAt: row.dismissedAt?.toISOString() ?? null,
    dismissedBy: row.dismissedBy,
    dismissalReason: row.dismissalReason,
    origin: row.origin,
    simulationRunId: row.simulationRunId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAlerts(
  db: Executor,
  organizationId: string,
  query: ListAlertsQuery,
): Promise<{ rows: AlertRow[]; total: number }> {
  const conditions: (SQL | undefined)[] = [
    eq(alerts.organizationId, organizationId),
    query.status ? eq(alerts.status, query.status) : undefined,
    query.severity ? eq(alerts.severity, query.severity) : undefined,
    query.sectorId ? eq(alerts.sectorId, query.sectorId) : undefined,
    query.deviceId ? eq(alerts.deviceId, query.deviceId) : undefined,
    query.origin ? eq(alerts.origin, query.origin) : undefined,
  ];
  const where = and(...conditions);

  const [rows, totals] = await Promise.all([
    db.select().from(alerts).where(where).orderBy(desc(alerts.lastDetectedAt)).limit(query.limit).offset(query.offset),
    db.select({ total: count() }).from(alerts).where(where),
  ]);

  return { rows, total: totals[0]?.total ?? 0 };
}

export async function findAlert(db: Executor, organizationId: string, alertId: string): Promise<AlertRow | null> {
  const [row] = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.id, alertId), eq(alerts.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function findAlertByDedupKey(
  db: Executor,
  organizationId: string,
  dedupKey: string,
): Promise<AlertRow | null> {
  const [row] = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.organizationId, organizationId), eq(alerts.dedupKey, dedupKey)))
    .limit(1);
  return row ?? null;
}

export async function getOrCreateDefaultRule(
  db: Executor,
  organizationId: string,
  kind: RuleKind = 'FLOW_UP_PRESSURE_DOWN',
  severity: Severity = 'HIGH',
): Promise<string> {
  const [existing] = await db
    .select({ id: detectionRules.id })
    .from(detectionRules)
    .where(and(eq(detectionRules.organizationId, organizationId), eq(detectionRules.kind, kind)))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(detectionRules)
    .values({
      organizationId,
      name: `Regra Padrão: ${kind}`,
      kind,
      scopeType: 'ORGANIZATION',
      params: {},
      windowSeconds: 3600,
      minDurationSeconds: 900,
      minCoverageRatio: '0.800',
      severity,
      isEnabled: true,
    })
    .returning({ id: detectionRules.id });

  if (!created) throw new Error('Falha ao criar regra padrão');
  return created.id;
}

export async function insertAlert(
  db: Executor,
  values: {
    organizationId: string;
    ruleId: string;
    sectorId?: string | null;
    deviceId?: string | null;
    dedupKey: string;
    status: AlertStatus;
    severity: Severity;
    title: string;
    priorityScore: number;
    evidence: Record<string, unknown>;
    occurrences: number;
    firstDetectedAt: Date;
    lastDetectedAt: Date;
    origin: DataOrigin;
    simulationRunId?: string | null;
  },
): Promise<AlertRow> {
  const [row] = await db.insert(alerts).values(values).returning();
  if (!row) throw new Error('Falha ao criar alerta');
  return row;
}

export async function updateAlert(
  db: Executor,
  organizationId: string,
  alertId: string,
  changes: Partial<Omit<AlertRow, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>>,
): Promise<AlertRow | null> {
  const [row] = await db
    .update(alerts)
    .set({ ...changes, updatedAt: sql`now()` })
    .where(and(eq(alerts.id, alertId), eq(alerts.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export async function insertAlertEvent(
  db: Executor,
  values: {
    organizationId: string;
    alertId: string;
    eventType: AlertEventType;
    fromStatus?: AlertStatus | null;
    toStatus?: AlertStatus | null;
    actorUserId?: string | null;
    note?: string | null;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(alertEvents).values(values);
}
