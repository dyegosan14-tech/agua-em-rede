import type { SessionRevocationReason } from '@aer/domain';
import { organizations, sessions, users, type Executor } from '@aer/database';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';

export type UserRow = typeof users.$inferSelect;
export type OrganizationRow = typeof organizations.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;

export interface UserWithOrganization {
  user: UserRow;
  organization: OrganizationRow;
}

export interface SessionWithUser extends UserWithOrganization {
  session: SessionRow;
}

export async function findUserByEmail(db: Executor, email: string): Promise<UserWithOrganization | null> {
  const [row] = await db
    .select({ user: users, organization: organizations })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, users.organizationId))
    .where(eq(users.email, email))
    .limit(1);
  return row ?? null;
}

export async function findUserWithOrganization(db: Executor, organizationId: string, userId: string): Promise<UserWithOrganization | null> {
  const [row] = await db
    .select({ user: users, organization: organizations })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, users.organizationId))
    .where(and(eq(users.id, userId), eq(users.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function findSessionByTokenHash(db: Executor, tokenHash: string): Promise<SessionWithUser | null> {
  const [row] = await db
    .select({ session: sessions, user: users, organization: organizations })
    .from(sessions)
    .innerJoin(users, and(eq(users.id, sessions.userId), eq(users.organizationId, sessions.organizationId)))
    .innerJoin(organizations, eq(organizations.id, sessions.organizationId))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

export async function insertSession(
  db: Executor,
  values: {
    organizationId: string;
    userId: string;
    tokenHash: string;
    ip: string | null;
    userAgent: string | null;
    now: Date;
    expiresAt: Date;
  },
): Promise<SessionRow> {
  const [row] = await db
    .insert(sessions)
    .values({
      organizationId: values.organizationId,
      userId: values.userId,
      tokenHash: values.tokenHash,
      ip: values.ip,
      userAgent: values.userAgent,
      createdAt: values.now,
      lastSeenAt: values.now,
      expiresAt: values.expiresAt,
    })
    .returning();
  if (!row) throw new Error('Falha ao criar a sessão');
  return row;
}

export async function touchSession(db: Executor, sessionId: string, now: Date): Promise<void> {
  await db
    .update(sessions)
    .set({ lastSeenAt: now })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

export async function revokeSession(db: Executor, sessionId: string, reason: SessionRevocationReason, now: Date): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now, revokedReason: reason })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Revoga todas as sessões ativas do usuário (opcionalmente preservando a sessão atual). Devolve quantas. */
export async function revokeUserSessions(
  db: Executor,
  params: { organizationId: string; userId: string; reason: SessionRevocationReason; now: Date; exceptSessionId?: string },
): Promise<number> {
  const revoked = await db
    .update(sessions)
    .set({ revokedAt: params.now, revokedReason: params.reason })
    .where(
      and(
        eq(sessions.organizationId, params.organizationId),
        eq(sessions.userId, params.userId),
        isNull(sessions.revokedAt),
        params.exceptSessionId ? ne(sessions.id, params.exceptSessionId) : undefined,
      ),
    )
    .returning({ id: sessions.id });
  return revoked.length;
}

export async function markLogin(db: Executor, userId: string, now: Date): Promise<void> {
  await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, userId));
}

export async function updatePasswordHash(db: Executor, userId: string, passwordHash: string, now: Date, changed: boolean): Promise<void> {
  await db
    .update(users)
    .set({ passwordHash, ...(changed ? { passwordChangedAt: now } : {}), updatedAt: sql`now()` })
    .where(eq(users.id, userId));
}
