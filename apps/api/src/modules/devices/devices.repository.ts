import type { DeviceCredentialDto, DeviceDto, ListDevicesQuery } from '@aer/contracts';
import { deviceCredentials, devices, type Executor } from '@aer/database';
import type { ActiveStatus, DeviceKind, Metric } from '@aer/domain';
import { and, asc, count, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';


export type DeviceRow = typeof devices.$inferSelect;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export function toDeviceDto(row: DeviceRow): DeviceDto {
  return {
    id: row.id,
    sectorId: row.sectorId,
    assetId: row.assetId,
    code: row.code,
    name: row.name,
    kind: row.kind,
    metrics: row.metrics,
    location: row.location,
    rangePressureMin: row.rangePressureMin,
    rangePressureMax: row.rangePressureMax,
    rangeFlowMin: row.rangeFlowMin,
    rangeFlowMax: row.rangeFlowMax,
    expectedIntervalSeconds: row.expectedIntervalSeconds,
    status: row.status,
    lastMeasurementAt: row.lastMeasurementAt?.toISOString() ?? null,
    lastReceivedAt: row.lastReceivedAt?.toISOString() ?? null,
    isFictional: row.isFictional,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDevices(
  db: Executor,
  organizationId: string,
  query: ListDevicesQuery,
): Promise<{ rows: DeviceRow[]; total: number }> {
  const conditions: (SQL | undefined)[] = [
    eq(devices.organizationId, organizationId),
    isNull(devices.archivedAt),
    query.sectorId ? eq(devices.sectorId, query.sectorId) : undefined,
    query.kind ? eq(devices.kind, query.kind) : undefined,
    query.status ? eq(devices.status, query.status) : undefined,
    query.search
      ? or(ilike(devices.name, `%${escapeLike(query.search)}%`), ilike(devices.code, `%${escapeLike(query.search)}%`))
      : undefined,
  ];
  const where = and(...conditions);

  const [rows, totals] = await Promise.all([
    db.select().from(devices).where(where).orderBy(asc(devices.name), asc(devices.id)).limit(query.limit).offset(query.offset),
    db.select({ total: count() }).from(devices).where(where),
  ]);

  return { rows, total: totals[0]?.total ?? 0 };
}

export async function findDevice(db: Executor, organizationId: string, deviceId: string): Promise<DeviceRow | null> {
  const [row] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.organizationId, organizationId), isNull(devices.archivedAt)))
    .limit(1);
  return row ?? null;
}

export async function insertDevice(
  db: Executor,
  values: {
    organizationId: string;
    sectorId?: string | null;
    assetId?: string | null;
    code: string;
    name: string;
    kind: DeviceKind;
    metrics: Metric[];
    rangePressureMin?: number | null;
    rangePressureMax?: number | null;
    rangeFlowMin?: number | null;
    rangeFlowMax?: number | null;
    expectedIntervalSeconds?: number;
    status?: ActiveStatus;
    isFictional?: boolean;
  },
): Promise<DeviceRow> {
  const [row] = await db.insert(devices).values(values).returning();
  if (!row) throw new Error('Falha ao cadastrar o dispositivo');
  return row;
}

export async function updateDevice(
  db: Executor,
  organizationId: string,
  deviceId: string,
  changes: {
    name?: string;
    sectorId?: string | null;
    assetId?: string | null;
    status?: ActiveStatus;
    rangePressureMin?: number | null;
    rangePressureMax?: number | null;
    rangeFlowMin?: number | null;
    rangeFlowMax?: number | null;
    expectedIntervalSeconds?: number;
  },
): Promise<DeviceRow | null> {
  const [row] = await db
    .update(devices)
    .set({ ...changes, updatedAt: sql`now()` })
    .where(and(eq(devices.id, deviceId), eq(devices.organizationId, organizationId), isNull(devices.archivedAt)))
    .returning();
  return row ?? null;
}

export async function insertDeviceCredential(
  db: Executor,
  values: {
    organizationId: string;
    deviceId: string;
    secretHash: string;
    label?: string | null;
    createdBy?: string | null;
  },
): Promise<DeviceCredentialDto> {
  const [row] = await db.insert(deviceCredentials).values(values).returning();
  if (!row) throw new Error('Falha ao registrar credencial do dispositivo');
  return {
    id: row.id,
    deviceId: row.deviceId,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

export async function listDeviceCredentials(
  db: Executor,
  organizationId: string,
  deviceId: string,
): Promise<DeviceCredentialDto[]> {
  const rows = await db
    .select()
    .from(deviceCredentials)
    .where(and(eq(deviceCredentials.organizationId, organizationId), eq(deviceCredentials.deviceId, deviceId)))
    .orderBy(desc(deviceCredentials.createdAt));

  return rows.map((r) => ({
    id: r.id,
    deviceId: r.deviceId,
    label: r.label,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt?.toISOString() ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function revokeDeviceCredential(
  db: Executor,
  organizationId: string,
  deviceId: string,
  credentialId: string,
): Promise<boolean> {
  const [row] = await db
    .update(deviceCredentials)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(deviceCredentials.id, credentialId),
        eq(deviceCredentials.deviceId, deviceId),
        eq(deviceCredentials.organizationId, organizationId),
        isNull(deviceCredentials.revokedAt),
      ),
    )
    .returning();
  return Boolean(row);
}

export async function findDeviceBySecretHash(
  db: Executor,
  secretHash: string,
): Promise<{ device: DeviceRow; credentialId: string } | null> {
  const [cred] = await db
    .select()
    .from(deviceCredentials)
    .where(and(eq(deviceCredentials.secretHash, secretHash), isNull(deviceCredentials.revokedAt)))
    .limit(1);

  if (!cred) return null;

  // Atualiza lastUsedAt da credencial
  await db.update(deviceCredentials).set({ lastUsedAt: sql`now()` }).where(eq(deviceCredentials.id, cred.id));

  const [dev] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.id, cred.deviceId), isNull(devices.archivedAt)))
    .limit(1);

  if (!dev || dev.status !== 'ACTIVE') return null;

  return { device: dev, credentialId: cred.id };
}
