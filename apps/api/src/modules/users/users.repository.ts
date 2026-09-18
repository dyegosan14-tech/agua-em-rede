import type { ListUsersQuery } from '@aer/contracts';
import type { Role } from '@aer/domain';
import { users, type Executor } from '@aer/database';
import { and, asc, count, eq, ilike, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
export type UserRow = typeof users.$inferSelect;

/** Escapa curingas do LIKE para que a busca seja literal. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export async function listUsers(db: Executor, organizationId: string, query: ListUsersQuery): Promise<{ rows: UserRow[]; total: number }> {
  const conditions: (SQL | undefined)[] = [
    eq(users.organizationId, organizationId),
    isNull(users.archivedAt),
    query.role ? eq(users.role, query.role) : undefined,
    query.isActive === undefined ? undefined : eq(users.isActive, query.isActive),
    query.search
      ? or(ilike(users.name, `%${escapeLike(query.search)}%`), ilike(users.email, `%${escapeLike(query.search)}%`))
      : undefined,
  ];
  const where = and(...conditions);

  const [rows, totals] = await Promise.all([
    db.select().from(users).where(where).orderBy(asc(users.name), asc(users.id)).limit(query.limit).offset(query.offset),
    db.select({ total: count() }).from(users).where(where),
  ]);
  return { rows, total: totals[0]?.total ?? 0 };
}

export async function findUser(db: Executor, organizationId: string, userId: string): Promise<UserRow | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, organizationId), isNull(users.archivedAt)))
    .limit(1);
  return row ?? null;
}

export async function insertUser(
  db: Executor,
  values: { organizationId: string; email: string; name: string; role: Role; passwordHash: string },
): Promise<UserRow> {
  const [row] = await db.insert(users).values(values).returning();
  if (!row) throw new Error('Falha ao criar o usuário');
  return row;
}

export async function updateUser(
  db: Executor,
  organizationId: string,
  userId: string,
  changes: { name?: string; role?: Role; isActive?: boolean; passwordHash?: string; passwordChangedAt?: Date },
): Promise<UserRow | null> {
  const [row] = await db
    .update(users)
    .set({ ...changes, updatedAt: sql`now()` })
    .where(and(eq(users.id, userId), eq(users.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

/**
 * Quantos OUTROS administradores ativos existem, sem contar `excludeUserId`.
 * Deve ser chamado dentro de uma transação: `FOR UPDATE` bloqueia as linhas dos administradores, de modo que
 * dois administradores removendo um ao outro ao mesmo tempo sejam serializados (o segundo recontará e falhará).
 */
export async function countOtherActiveAdmins(db: Executor, organizationId: string, excludeUserId: string): Promise<number> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.organizationId, organizationId),
        eq(users.role, 'ADMIN'),
        eq(users.isActive, true),
        isNull(users.archivedAt),
        ne(users.id, excludeUserId),
      ),
    )
    .for('update');
  return rows.length;
}
