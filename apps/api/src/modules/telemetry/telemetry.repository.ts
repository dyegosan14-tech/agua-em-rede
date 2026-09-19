import type { ListMeasurementsQuery, MeasurementDto, SimulationRunDto } from '@aer/contracts';
import { measurements, simulationRuns, type Executor } from '@aer/database';
import type { DataOrigin, MeasurementQuality, Metric, SimulationScenario, SimulationStatus } from '@aer/domain';
import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';

export type MeasurementRow = typeof measurements.$inferSelect;
export type SimulationRunRow = typeof simulationRuns.$inferSelect;

export function toMeasurementDto(row: MeasurementRow): MeasurementDto {
  return {
    id: row.id,
    deviceId: row.deviceId,
    sectorId: row.sectorId,
    externalEventId: row.externalEventId,
    metric: row.metric,
    value: row.value,
    unit: row.unit,
    quality: row.quality,
    qualityFlags: row.qualityFlags,
    measuredAt: row.measuredAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    origin: row.origin,
    simulationRunId: row.simulationRunId,
  };
}

export function toSimulationRunDto(row: SimulationRunRow): SimulationRunDto {
  return {
    id: row.id,
    scenario: row.scenario,
    seed: row.seed,
    status: row.status,
    sectorId: row.sectorId,
    measurementsGenerated: row.measurementsGenerated,
    error: row.error,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function insertMeasurements(
  db: Executor,
  rows: {
    organizationId: string;
    deviceId: string;
    sectorId: string | null;
    externalEventId: string;
    metric: Metric;
    value: number;
    unit: string;
    quality: MeasurementQuality;
    qualityFlags: string[];
    measuredAt: Date;
    origin: DataOrigin;
    simulationRunId: string | null;
  }[],
): Promise<MeasurementRow[]> {
  if (rows.length === 0) return [];
  return db.insert(measurements).values(rows).returning();
}

export async function listMeasurements(
  db: Executor,
  organizationId: string,
  query: ListMeasurementsQuery,
): Promise<{ rows: MeasurementRow[]; total: number }> {
  const conditions: (SQL | undefined)[] = [
    eq(measurements.organizationId, organizationId),
    query.deviceId ? eq(measurements.deviceId, query.deviceId) : undefined,
    query.sectorId ? eq(measurements.sectorId, query.sectorId) : undefined,
    query.metric ? eq(measurements.metric, query.metric) : undefined,
    query.from ? gte(measurements.measuredAt, new Date(query.from)) : undefined,
    query.to ? lte(measurements.measuredAt, new Date(query.to)) : undefined,
  ];
  const where = and(...conditions);

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(measurements)
      .where(where)
      .orderBy(desc(measurements.measuredAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(measurements).where(where),
  ]);

  return { rows, total: totals[0]?.total ?? 0 };
}

export async function createSimulationRun(
  db: Executor,
  values: {
    organizationId: string;
    scenario: SimulationScenario;
    seed: number;
    status: SimulationStatus;
    sectorId: string | null;
    createdBy: string;
  },
): Promise<SimulationRunRow> {
  const [row] = await db.insert(simulationRuns).values(values).returning();
  if (!row) throw new Error('Falha ao criar execução de simulação');
  return row;
}

export async function updateSimulationRun(
  db: Executor,
  organizationId: string,
  runId: string,
  changes: {
    status?: SimulationStatus;
    measurementsGenerated?: number;
    error?: string | null;
    startedAt?: Date;
    finishedAt?: Date;
  },
): Promise<SimulationRunRow | null> {
  const [row] = await db
    .update(simulationRuns)
    .set(changes)
    .where(and(eq(simulationRuns.id, runId), eq(simulationRuns.organizationId, organizationId)))
    .returning();
  return row ?? null;
}
