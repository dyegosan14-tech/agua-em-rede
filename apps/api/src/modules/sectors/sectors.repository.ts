import type { ListSectorsQuery, SectorDto } from '@aer/contracts';
import { sectors, type Executor, type SupplyScheduleEntry } from '@aer/database';
import { and, asc, count, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';

export type SectorRow = typeof sectors.$inferSelect;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export function toSectorDto(row: SectorRow): SectorDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    geometry: row.geometry,
    supplySchedule: row.supplySchedule ?? [],
    isFictional: row.isFictional,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listSectors(
  db: Executor,
  organizationId: string,
  query: ListSectorsQuery,
): Promise<{ rows: SectorRow[]; total: number }> {
  const conditions: (SQL | undefined)[] = [
    eq(sectors.organizationId, organizationId),
    isNull(sectors.archivedAt),
    query.search
      ? or(ilike(sectors.name, `%${escapeLike(query.search)}%`), ilike(sectors.code, `%${escapeLike(query.search)}%`))
      : undefined,
  ];
  const where = and(...conditions);

  const [rows, totals] = await Promise.all([
    db.select().from(sectors).where(where).orderBy(asc(sectors.name), asc(sectors.id)).limit(query.limit).offset(query.offset),
    db.select({ total: count() }).from(sectors).where(where),
  ]);

  return { rows, total: totals[0]?.total ?? 0 };
}

export async function findSector(db: Executor, organizationId: string, sectorId: string): Promise<SectorRow | null> {
  const [row] = await db
    .select()
    .from(sectors)
    .where(and(eq(sectors.id, sectorId), eq(sectors.organizationId, organizationId), isNull(sectors.archivedAt)))
    .limit(1);
  return row ?? null;
}

export async function insertSector(
  db: Executor,
  values: {
    organizationId: string;
    code: string;
    name: string;
    description?: string | null;
    supplySchedule?: SupplyScheduleEntry[];
    isFictional?: boolean;
  },
): Promise<SectorRow> {
  const [row] = await db.insert(sectors).values(values).returning();
  if (!row) throw new Error('Falha ao criar o setor');
  return row;
}

export async function updateSector(
  db: Executor,
  organizationId: string,
  sectorId: string,
  changes: {
    name?: string;
    description?: string | null;
    supplySchedule?: SupplyScheduleEntry[];
  },
): Promise<SectorRow | null> {
  const [row] = await db
    .update(sectors)
    .set({ ...changes, updatedAt: sql`now()` })
    .where(and(eq(sectors.id, sectorId), eq(sectors.organizationId, organizationId), isNull(sectors.archivedAt)))
    .returning();
  return row ?? null;
}
