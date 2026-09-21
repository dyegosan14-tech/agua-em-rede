import type { DetectionRuleDto, ListDetectionRulesQuery } from '@aer/contracts';
import { detectionRules, type Executor } from '@aer/database';
import type { RuleKind, RuleScope, Severity } from '@aer/domain';
import { and, count, desc, eq, isNull, type SQL } from 'drizzle-orm';

export type DetectionRuleRow = typeof detectionRules.$inferSelect;

export function toDetectionRuleDto(row: DetectionRuleRow): DetectionRuleDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    scopeType: row.scopeType,
    sectorId: row.sectorId,
    deviceId: row.deviceId,
    params: row.params,
    windowSeconds: row.windowSeconds,
    minDurationSeconds: row.minDurationSeconds,
    minCoverageRatio: Number(row.minCoverageRatio),
    severity: row.severity,
    suppressionSeconds: row.suppressionSeconds,
    recoverySeconds: row.recoverySeconds,
    respectSupplySchedule: row.respectSupplySchedule,
    respectMaintenance: row.respectMaintenance,
    isEnabled: row.isEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDetectionRules(
  db: Executor,
  organizationId: string,
  query: ListDetectionRulesQuery,
): Promise<{ rows: DetectionRuleRow[]; total: number }> {
  const conditions: (SQL | undefined)[] = [
    eq(detectionRules.organizationId, organizationId),
    isNull(detectionRules.archivedAt),
    query.kind ? eq(detectionRules.kind, query.kind) : undefined,
    query.scopeType ? eq(detectionRules.scopeType, query.scopeType) : undefined,
    query.sectorId ? eq(detectionRules.sectorId, query.sectorId) : undefined,
    query.deviceId ? eq(detectionRules.deviceId, query.deviceId) : undefined,
  ];

  const where = and(...conditions);

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(detectionRules)
      .where(where)
      .orderBy(desc(detectionRules.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(detectionRules).where(where),
  ]);

  return { rows, total: totals[0]?.total ?? 0 };
}

export async function insertDetectionRule(
  db: Executor,
  values: {
    organizationId: string;
    name: string;
    description?: string | null;
    kind: RuleKind;
    scopeType: RuleScope;
    sectorId?: string | null;
    deviceId?: string | null;
    params?: Record<string, unknown>;
    windowSeconds: number;
    minDurationSeconds: number;
    minCoverageRatio: string;
    severity: Severity;
    suppressionSeconds?: number;
    recoverySeconds?: number;
    respectSupplySchedule?: boolean;
    respectMaintenance?: boolean;
    isEnabled?: boolean;
    createdBy: string;
  },
): Promise<DetectionRuleRow> {
  const [row] = await db.insert(detectionRules).values(values).returning();
  if (!row) throw new Error('Falha ao cadastrar regra de detecção');
  return row;
}
