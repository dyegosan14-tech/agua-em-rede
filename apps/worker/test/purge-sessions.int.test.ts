import { createDb, organizations, sessions, users, type Db } from '@aer/database';
import { createTestDatabase, type TestDatabase } from '@aer/database/test-support';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { purgeSessionsJob } from '../src/jobs/purge-sessions';
import { createProcessor } from '../src/processor';

let testDb: TestDatabase;
let db: Db;
const logger = pino({ level: 'silent' });
const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-06-15T12:00:00.000Z');

async function insertSession(
  orgId: string,
  userId: string,
  overrides: { expiresAt: Date; revokedAt?: Date },
  tag: string,
): Promise<string> {
  const created = new Date(overrides.expiresAt.getTime() - 12 * 3_600_000);
  const [row] = await db
    .insert(sessions)
    .values({
      organizationId: orgId,
      userId,
      tokenHash: tag.padEnd(64, '0'),
      createdAt: created,
      lastSeenAt: created,
      expiresAt: overrides.expiresAt,
      ...(overrides.revokedAt ? { revokedAt: overrides.revokedAt, revokedReason: 'LOGOUT' as const } : {}),
    })
    .returning({ id: sessions.id });
  return row!.id;
}

beforeAll(async () => {
  testDb = await createTestDatabase();
  db = createDb(testDb.pool);
});
afterAll(async () => {
  await testDb.close();
});

describe('job purge-stale-sessions', () => {
  it('remove somente sessões vencidas ou revogadas há mais de 30 dias e é idempotente', async () => {
    const [org] = await db.insert(organizations).values({ name: 'Org', slug: 'worker-org' }).returning({ id: organizations.id });
    const [user] = await db
      .insert(users)
      .values({ organizationId: org!.id, email: 'w@worker.test', name: 'W', role: 'VIEWER', passwordHash: 'x' })
      .returning({ id: users.id });

    const active = await insertSession(org!.id, user!.id, { expiresAt: new Date(now.getTime() + 3_600_000) }, 'a1');
    const expiredRecently = await insertSession(org!.id, user!.id, { expiresAt: new Date(now.getTime() - 5 * DAY) }, 'a2');
    const expiredLongAgo = await insertSession(org!.id, user!.id, { expiresAt: new Date(now.getTime() - 40 * DAY) }, 'a3');
    const revokedRecently = await insertSession(org!.id, user!.id, { expiresAt: new Date(now.getTime() + 3_600_000), revokedAt: new Date(now.getTime() - 2 * DAY) }, 'a4');
    const revokedLongAgo = await insertSession(org!.id, user!.id, { expiresAt: new Date(now.getTime() + 3_600_000), revokedAt: new Date(now.getTime() - 45 * DAY) }, 'a5');

    const deps = { db, logger, clock: () => now };
    expect(await purgeSessionsJob(deps, {})).toEqual({ removed: 2 });

    const remaining = (await db.select({ id: sessions.id }).from(sessions)).map((row) => row.id).sort();
    expect(remaining).toEqual([active, expiredRecently, revokedRecently].sort());
    expect(remaining).not.toContain(expiredLongAgo);
    expect(remaining).not.toContain(revokedLongAgo);

    // Reexecução (ex.: retry após falha) não altera nada.
    expect(await purgeSessionsJob(deps, {})).toEqual({ removed: 0 });
    expect(await db.select({ id: sessions.id }).from(sessions)).toHaveLength(3);
  });

  it('valida o payload e o processador rejeita jobs desconhecidos sem retentativa', async () => {
    const deps = { db, logger, clock: () => now };
    await expect(purgeSessionsJob(deps, { retentionDays: 0 })).rejects.toThrow();

    const processor = createProcessor(deps);
    await expect(processor({ name: 'job-inexistente', data: {} })).rejects.toMatchObject({ name: 'UnrecoverableError' });
    await expect(processor({ name: 'purge-stale-sessions', data: { retentionDays: 30 } })).resolves.toEqual({ removed: 0 });
  });
});
