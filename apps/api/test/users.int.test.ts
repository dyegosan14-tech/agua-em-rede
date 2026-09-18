import { randomUUID } from 'node:crypto';
import { auditLogs, sessions, users } from '@aer/database';
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../src/modules/audit/audit.service';
import { UsersService } from '../src/modules/users/users.service';
import { PASSWORD, call, createTestContext, login, seedOrganization, testHasher, type SeededOrg, type TestContext } from './support/harness';

let ctx: TestContext;
let counter = 0;
const freshOrg = (): Promise<SeededOrg> => seedOrganization(ctx, `usr${(counter += 1)}`);

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

describe('gestão de usuários (ADMIN)', () => {
  it('cria usuário com senha em Argon2id e registra auditoria sem a senha', async () => {
    const org = await freshOrg();
    const admin = await login(ctx.app, org.users.ADMIN.email);
    const secret = 'senha-inicial-muito-secreta-9';

    const response = await call(ctx.app, admin, 'POST', '/api/users', { email: 'Novo.Usuario@USR.test', name: '  Maria  ', role: 'TECHNICIAN', password: secret });
    expect(response.statusCode).toBe(201);
    const created = response.json();
    expect(created).toMatchObject({ email: 'novo.usuario@usr.test', name: 'Maria', role: 'TECHNICIAN', isActive: true });
    expect(JSON.stringify(created)).not.toMatch(/password/i);

    const [row] = await ctx.testDb.db.select().from(users).where(eq(users.id, created.id));
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row?.passwordHash).not.toContain(secret);

    const audit = await ctx.testDb.db.select().from(auditLogs).where(and(eq(auditLogs.organizationId, org.organizationId), eq(auditLogs.action, 'user.created')));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actorUserId).toBe(org.users.ADMIN.id);
    expect(JSON.stringify(audit)).not.toContain(secret);

    // O novo usuário consegue entrar.
    await login(ctx.app, 'novo.usuario@usr.test', secret);
  });

  it('valida senha fraca, perfil inválido e e-mail duplicado', async () => {
    const org = await freshOrg();
    const admin = await login(ctx.app, org.users.ADMIN.email);

    const weak = await call(ctx.app, admin, 'POST', '/api/users', { email: 'a@usr.test', name: 'A', role: 'VIEWER', password: 'curta' });
    expect(weak.statusCode).toBe(400);
    expect(weak.json().error.details[0].message).toMatch(/ao menos 12 caracteres/);

    const badRole = await call(ctx.app, admin, 'POST', '/api/users', { email: 'b@usr.test', name: 'B', role: 'SUPERUSER', password: PASSWORD });
    expect(badRole.statusCode).toBe(400);

    const duplicate = await call(ctx.app, admin, 'POST', '/api/users', { email: org.users.VIEWER.email.toUpperCase(), name: 'Dup', role: 'VIEWER', password: PASSWORD });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('CONFLICT');
  });

  it('pagina e filtra a listagem com limites', async () => {
    const org = await freshOrg();
    const admin = await login(ctx.app, org.users.ADMIN.email);

    const first = (await call(ctx.app, admin, 'GET', '/api/users?limit=2&offset=0')).json();
    const second = (await call(ctx.app, admin, 'GET', '/api/users?limit=2&offset=2')).json();
    expect(first.page).toEqual({ limit: 2, offset: 0, total: 4 });
    expect(first.items).toHaveLength(2);
    expect(new Set([...first.items, ...second.items].map((u: { id: string }) => u.id)).size).toBe(4);

    const onlyTech = (await call(ctx.app, admin, 'GET', '/api/users?role=TECHNICIAN')).json();
    expect(onlyTech.items.map((u: { role: string }) => u.role)).toEqual(['TECHNICIAN']);

    const search = (await call(ctx.app, admin, 'GET', '/api/users?search=viewer')).json();
    expect(search.page.total).toBe(1);

    expect((await call(ctx.app, admin, 'GET', '/api/users?limit=1000')).statusCode).toBe(400);
  });

  it('mudar o perfil ou desativar encerra as sessões do usuário afetado', async () => {
    const org = await freshOrg();
    const admin = await login(ctx.app, org.users.ADMIN.email);
    const operator = await login(ctx.app, org.users.OPERATOR.email);
    const viewer = await login(ctx.app, org.users.VIEWER.email);

    expect((await call(ctx.app, admin, 'PATCH', `/api/users/${org.users.OPERATOR.id}`, { role: 'VIEWER' })).statusCode).toBe(200);
    expect((await call(ctx.app, operator, 'GET', '/api/auth/me')).statusCode).toBe(401);

    expect((await call(ctx.app, admin, 'PATCH', `/api/users/${org.users.VIEWER.id}`, { isActive: false })).statusCode).toBe(200);
    expect((await call(ctx.app, viewer, 'GET', '/api/auth/me')).statusCode).toBe(401);

    const revoked = await ctx.testDb.db
      .select({ reason: sessions.revokedReason })
      .from(sessions)
      .where(and(eq(sessions.organizationId, org.organizationId), isNull(sessions.revokedAt)));
    expect(revoked.length).toBe(1); // somente a sessão do próprio admin segue ativa
  });

  it('impede o admin de se desativar ou rebaixar; um segundo admin pode desativá-lo', async () => {
    const org = await freshOrg();
    const admin = await login(ctx.app, org.users.ADMIN.email);

    const self = await call(ctx.app, admin, 'PATCH', `/api/users/${org.users.ADMIN.id}`, { isActive: false });
    expect(self.statusCode).toBe(409);
    const selfRole = await call(ctx.app, admin, 'PATCH', `/api/users/${org.users.ADMIN.id}`, { role: 'VIEWER' });
    expect(selfRole.statusCode).toBe(409);

    expect((await call(ctx.app, admin, 'PATCH', `/api/users/${org.users.OPERATOR.id}`, { role: 'ADMIN' })).statusCode).toBe(200);
    const admin2 = await login(ctx.app, org.users.OPERATOR.email);
    expect((await call(ctx.app, admin2, 'PATCH', `/api/users/${org.users.ADMIN.id}`, { isActive: false })).statusCode).toBe(200);
  });

  it('nunca deixa a organização sem administrador ativo (regra do serviço, com chamador sintético)', async () => {
    const org = await freshOrg();
    const service = new UsersService({ db: ctx.testDb.db, passwords: testHasher, audit: new AuditService(ctx.testDb.db), clock: ctx.clock.now });
    // Na prática o chamador é sempre outro admin ativo; um chamador sintético reproduz o estado de corrida
    // (dois admins removendo um ao outro), em que o alvo é o único admin restante.
    const synthetic = {
      sessionId: randomUUID(),
      userId: randomUUID(),
      organizationId: org.organizationId,
      role: 'ADMIN' as const,
      email: 'fantasma@usr.test',
      name: 'Fantasma',
      expiresAt: new Date(),
      organization: { id: org.organizationId, name: 'x', slug: 'x', isDemo: false, timezone: 'America/Recife' },
    };
    const meta = { requestId: 'req-teste-0001', ip: null, userAgent: null };

    await expect(service.update(synthetic, org.users.ADMIN.id, { isActive: false }, meta)).rejects.toMatchObject({ code: 'LAST_ADMIN', statusCode: 409 });
    await expect(service.update(synthetic, org.users.ADMIN.id, { role: 'VIEWER' }, meta)).rejects.toMatchObject({ code: 'LAST_ADMIN' });
    const [row] = await ctx.testDb.db.select().from(users).where(eq(users.id, org.users.ADMIN.id));
    expect(row).toMatchObject({ role: 'ADMIN', isActive: true });
  });

  it('reset de senha e revogação de sessões pelo admin', async () => {
    const org = await freshOrg();
    const admin = await login(ctx.app, org.users.ADMIN.email);
    const technician = await login(ctx.app, org.users.TECHNICIAN.email);
    const newPassword = 'senha-redefinida-pelo-admin-1';

    const reset = await call(ctx.app, admin, 'POST', `/api/users/${org.users.TECHNICIAN.id}/reset-password`, { newPassword });
    expect(reset.statusCode).toBe(200);
    expect(reset.json().revokedSessions).toBe(1);
    expect((await call(ctx.app, technician, 'GET', '/api/auth/me')).statusCode).toBe(401);
    await login(ctx.app, org.users.TECHNICIAN.email, newPassword);

    const viewer = await login(ctx.app, org.users.VIEWER.email);
    const revoke = await call(ctx.app, admin, 'POST', `/api/users/${org.users.VIEWER.id}/revoke-sessions`);
    expect(revoke.json().revokedSessions).toBe(1);
    expect((await call(ctx.app, viewer, 'GET', '/api/auth/me')).statusCode).toBe(401);

    const actions = (await ctx.testDb.db.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.organizationId, org.organizationId))).map((r) => r.action);
    expect(actions).toContain('user.password.reset');
    expect(actions).toContain('user.sessions.revoked');
  });
});

describe('trilha de auditoria', () => {
  it('pagina por cursor sem repetir nem perder eventos e aplica filtros', async () => {
    const org = await freshOrg();
    const admin = await login(ctx.app, org.users.ADMIN.email);
    for (let i = 0; i < 4; i += 1) {
      await call(ctx.app, admin, 'POST', '/api/users', { email: `aud${i}@${org.slug}.test`, name: `Aud ${i}`, role: 'VIEWER', password: PASSWORD });
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url: string = `/api/audit-logs?limit=2${cursor ? `&cursor=${cursor}` : ''}`;
      const body = (await call(ctx.app, admin, 'GET', url)).json();
      expect(body.items.length).toBeLessThanOrEqual(2);
      seen.push(...body.items.map((i: { id: string }) => i.id));
      cursor = body.nextCursor;
      pages += 1;
    } while (cursor && pages < 20);

    const all = await ctx.testDb.db.select({ id: auditLogs.id }).from(auditLogs).where(eq(auditLogs.organizationId, org.organizationId));
    expect(new Set(seen).size).toBe(seen.length); // sem repetição
    expect(seen.length).toBe(all.length); // sem perda
    expect(pages).toBeGreaterThan(1);

    const created = (await call(ctx.app, admin, 'GET', '/api/audit-logs?action=user.created&limit=100')).json();
    expect(created.items).toHaveLength(4);
    expect(created.items.every((i: { action: string; actorName: string }) => i.action === 'user.created' && i.actorName?.startsWith('ADMIN'))).toBe(true);

    expect((await call(ctx.app, admin, 'GET', '/api/audit-logs?cursor=lixo')).statusCode).toBe(400);
  });
});
