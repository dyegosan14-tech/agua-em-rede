import { auditLogs, sessions, users } from '@aer/database';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, call, createTestContext, login, seedOrganization, type SeededOrg, type TestContext, type TestSession } from './support/harness';

let ctx: TestContext;
let orgA: SeededOrg;
let orgB: SeededOrg;
let adminA: TestSession;
let adminB: TestSession;

beforeAll(async () => {
  ctx = await createTestContext();
  orgA = await seedOrganization(ctx, 'alfa');
  orgB = await seedOrganization(ctx, 'beta');
  adminA = await login(ctx.app, orgA.users.ADMIN.email);
  adminB = await login(ctx.app, orgB.users.ADMIN.email);
});
afterAll(async () => {
  await ctx.close();
});

describe('isolamento entre organizações', () => {
  it('a listagem de usuários mostra somente a própria organização', async () => {
    const response = await call(ctx.app, adminA, 'GET', '/api/users?limit=100');
    expect(response.statusCode).toBe(200);
    const { items, page } = response.json();
    expect(page.total).toBe(4);
    const emails = items.map((u: { email: string }) => u.email);
    expect(emails.every((email: string) => email.endsWith('@alfa.test'))).toBe(true);
    expect(emails).not.toContain(orgB.users.ADMIN.email);
  });

  it('usuário de outra organização é indistinguível de inexistente (404) em todas as rotas por id', async () => {
    const victim = orgB.users.OPERATOR.id;
    const victimSession = await login(ctx.app, orgB.users.OPERATOR.email);

    expect((await call(ctx.app, adminA, 'GET', `/api/users/${victim}`)).statusCode).toBe(404);
    expect((await call(ctx.app, adminA, 'PATCH', `/api/users/${victim}`, { role: 'ADMIN' })).statusCode).toBe(404);
    expect((await call(ctx.app, adminA, 'PATCH', `/api/users/${victim}`, { isActive: false })).statusCode).toBe(404);
    expect((await call(ctx.app, adminA, 'POST', `/api/users/${victim}/reset-password`, { newPassword: 'invasor-senha-123456' })).statusCode).toBe(404);
    expect((await call(ctx.app, adminA, 'POST', `/api/users/${victim}/revoke-sessions`)).statusCode).toBe(404);

    // Nada mudou para a vítima: mesmo perfil, ainda ativa, mesma senha, sessão intacta.
    const [row] = await ctx.testDb.db.select().from(users).where(eq(users.id, victim));
    expect(row).toMatchObject({ role: 'OPERATOR', isActive: true });
    expect((await call(ctx.app, victimSession, 'GET', '/api/auth/me')).statusCode).toBe(200);
    await login(ctx.app, orgB.users.OPERATOR.email, PASSWORD);
  });

  it('organizationId enviado no corpo é ignorado: o novo usuário nasce na organização da sessão', async () => {
    const response = await call(ctx.app, adminA, 'POST', '/api/users', {
      email: 'infiltrado@alfa.test',
      name: 'Infiltrado',
      role: 'VIEWER',
      password: PASSWORD,
      organizationId: orgB.organizationId,
    });
    expect(response.statusCode).toBe(201);
    const [row] = await ctx.testDb.db.select().from(users).where(eq(users.email, 'infiltrado@alfa.test'));
    expect(row?.organizationId).toBe(orgA.organizationId);
  });

  it('organizationId na query string não altera o escopo da listagem', async () => {
    const response = await call(ctx.app, adminA, 'GET', `/api/users?organizationId=${orgB.organizationId}&limit=100`);
    expect(response.statusCode).toBe(200);
    expect(response.json().items.every((u: { email: string }) => u.email.endsWith('@alfa.test'))).toBe(true);
  });

  it('a organização corrente é sempre a da sessão', async () => {
    const a = await call(ctx.app, adminA, 'GET', '/api/organizations/current');
    const b = await call(ctx.app, adminB, 'GET', '/api/organizations/current');
    expect(a.json().id).toBe(orgA.organizationId);
    expect(b.json().id).toBe(orgB.organizationId);
  });

  it('a trilha de auditoria de uma organização não vaza eventos da outra', async () => {
    await call(ctx.app, adminB, 'POST', '/api/users', { email: 'so-da-beta@beta.test', name: 'Beta', role: 'VIEWER', password: PASSWORD });
    const response = await call(ctx.app, adminA, 'GET', '/api/audit-logs?limit=100');
    expect(response.statusCode).toBe(200);
    const serialized = JSON.stringify(response.json());
    expect(serialized).not.toContain('so-da-beta');
    expect(serialized).not.toContain(orgB.organizationId);

    // Sanidade: os eventos de B existem no banco, apenas não são visíveis para A.
    const rows = await ctx.testDb.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, orgB.organizationId), eq(auditLogs.action, 'user.created')));
    expect(rows.length).toBeGreaterThan(0);
  });

  it('e-mail já usado em outra organização é recusado sem revelar de qual', async () => {
    const response = await call(ctx.app, adminA, 'POST', '/api/users', {
      email: orgB.users.VIEWER.email,
      name: 'Duplicado',
      role: 'VIEWER',
      password: PASSWORD,
    });
    expect(response.statusCode).toBe(409);
    expect(JSON.stringify(response.json())).not.toContain('beta');
  });

  it('as sessões ficam vinculadas à organização do usuário', async () => {
    const rows = await ctx.testDb.db.select().from(sessions).where(eq(sessions.userId, orgA.users.ADMIN.id));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgA.organizationId)).toBe(true);
  });
});
