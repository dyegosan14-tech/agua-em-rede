import { auditLogs, sessions, users } from '@aer/database';
import { desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken } from '../src/lib/tokens';
import {
  ORIGIN,
  PASSWORD,
  call,
  createTestContext,
  login,
  seedOrganization,
  sessionCookieFrom,
  testConfig,
  type SeededOrg,
  type TestContext,
} from './support/harness';

let ctx: TestContext;
let org: SeededOrg;
let orgCounter = 0;

/** Cada teste usa uma organização própria: e-mails são únicos globalmente e o rate limit é por IP+e-mail. */
async function freshOrg(): Promise<SeededOrg> {
  orgCounter += 1;
  return seedOrganization(ctx, `auth${orgCounter}`);
}

beforeAll(async () => {
  ctx = await createTestContext();
  org = await freshOrg();
});
afterAll(async () => {
  await ctx.close();
});

describe('login', () => {
  it('cria sessão com cookie HttpOnly/SameSite=Strict e não persiste o token em claro', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: org.users.ADMIN.email, password: PASSWORD },
    });
    expect(response.statusCode).toBe(200);

    const setCookie = String(response.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).not.toContain('Secure'); // ambiente de teste (não produção)

    const body = response.json();
    expect(body.user).toMatchObject({ email: org.users.ADMIN.email, role: 'ADMIN' });
    expect(body.organization).toMatchObject({ id: org.organizationId, isDemo: true });
    expect(body.permissions).toContain('users:manage');
    expect(typeof body.csrfToken).toBe('string');
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|password_hash/);

    // O banco guarda apenas o hash SHA-256 do token opaco.
    const token = sessionCookieFrom(response)!.split('=')[1]!;
    expect(token.length).toBeGreaterThanOrEqual(43);
    const [row] = await ctx.testDb.db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    expect(row).toBeDefined();
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('em produção o cookie é Secure e usa o prefixo __Host-', async () => {
    const productionCtx = await createTestContext({
      config: testConfig({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://app.exemplo.test',
        RATE_LIMIT_STORE: 'redis',
        ARGON2_MEMORY_KIB: '19456',
        ARGON2_TIME_COST: '2',
      }),
    });
    try {
      const prodOrg = await seedOrganization(productionCtx, 'prod');
      const response = await productionCtx.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { origin: 'https://app.exemplo.test' },
        payload: { email: prodOrg.users.ADMIN.email, password: PASSWORD },
      });
      expect(response.statusCode).toBe(200);
      const setCookie = String(response.headers['set-cookie']);
      expect(setCookie).toMatch(/^__Host-aer_session=/);
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('HttpOnly');
      // Swagger UI desligada por padrão em produção.
      expect((await productionCtx.app.inject({ method: 'GET', url: '/api/docs' })).statusCode).toBe(404);
    } finally {
      await productionCtx.close();
    }
  });

  it('não distingue senha errada, e-mail inexistente e conta desativada (sem enumeração de contas)', async () => {
    const own = await freshOrg();
    await ctx.testDb.db.update(users).set({ isActive: false }).where(eq(users.id, own.users.VIEWER.id));

    const attempts = [
      { email: own.users.ADMIN.email, password: 'senha-errada-999' },
      { email: `ninguem@${own.slug}.test`, password: PASSWORD },
      { email: own.users.VIEWER.email, password: PASSWORD }, // senha correta, mas conta desativada
    ];
    const bodies = [];
    for (const payload of attempts) {
      const response = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: ORIGIN }, payload });
      expect(response.statusCode).toBe(401);
      expect(response.headers['set-cookie']).toBeUndefined();
      const { error } = response.json();
      bodies.push({ code: error.code, message: error.message });
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    expect(bodies[0]).toEqual({ code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos.' });
  });

  it('audita tentativas falhas com o motivo real, sem gravar senha nem e-mail em claro', async () => {
    const own = await freshOrg();
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: `fantasma@${own.slug}.test`, password: 'uma-senha-secreta-123' },
    });
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: own.users.OPERATOR.email, password: 'outra-senha-secreta-1' },
    });

    const failed = await ctx.testDb.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'auth.login.failed'))
      .orderBy(desc(auditLogs.createdAt))
      .limit(2);
    const reasons = failed.map((row) => (row.metadata as { reason: string }).reason).sort();
    expect(reasons).toEqual(['bad_password', 'unknown_user']);
    const serialized = JSON.stringify(failed);
    expect(serialized).not.toContain('uma-senha-secreta-123');
    expect(serialized).not.toContain('outra-senha-secreta-1');
    expect(serialized).not.toContain(`fantasma@${own.slug}.test`);
  });

  it('valida o corpo com mensagens em português', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: 'nao-e-email', password: '' },
    });
    expect(response.statusCode).toBe(400);
    const { error } = response.json();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.requestId).toBeTruthy();
    expect(error.details.map((d: { path: string }) => d.path).sort()).toEqual(['email', 'password']);
  });

  it('aplica rate limit por IP+e-mail (429 com Retry-After) sem bloquear outras contas', async () => {
    const own = await freshOrg();
    const attempt = (email: string) =>
      ctx.app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: ORIGIN }, payload: { email, password: 'senha-errada-999' } });

    for (let i = 0; i < 5; i += 1) expect((await attempt(own.users.ADMIN.email)).statusCode).toBe(401);
    const blocked = await attempt(own.users.ADMIN.email);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    // Outra conta, mesmo IP: ainda permitido (o limite por IP é maior).
    expect((await attempt(own.users.OPERATOR.email)).statusCode).toBe(401);
    // Mesmo com a senha certa, a conta limitada continua bloqueada durante a janela.
    const stillBlocked = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: own.users.ADMIN.email, password: PASSWORD },
    });
    expect(stillBlocked.statusCode).toBe(429);

    // Após a janela o limite é liberado.
    ctx.clock.advance(16 * 60_000);
    const later = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN },
      payload: { email: own.users.ADMIN.email, password: PASSWORD },
    });
    expect(later.statusCode).toBe(200);
  });
});

describe('sessão, CSRF e logout', () => {
  it('exige sessão para /me e devolve o contexto quando autenticado', async () => {
    expect((await call(ctx.app, null, 'GET', '/api/auth/me')).statusCode).toBe(401);
    const session = await login(ctx.app, org.users.OPERATOR.email);
    const me = await call(ctx.app, session, 'GET', '/api/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().user.role).toBe('OPERATOR');
  });

  it('cookie forjado ou aleatório não autentica', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: 'aer_session=token-forjado-que-nao-existe' } });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('bloqueia escrita sem token CSRF, com token errado e com Origin não permitida', async () => {
    const own = await freshOrg();
    const session = await login(ctx.app, own.users.ADMIN.email);
    const body = { email: `novo@${own.slug}.test`, name: 'Novo', role: 'VIEWER', password: PASSWORD };

    const missing = await ctx.app.inject({ method: 'POST', url: '/api/users', headers: { cookie: session.cookie, origin: ORIGIN }, payload: body });
    expect(missing.statusCode).toBe(403);
    expect(missing.json().error.code).toBe('CSRF_INVALID');

    const wrong = await call(ctx.app, session, 'POST', '/api/users', body, { 'x-csrf-token': 'a'.repeat(43) });
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json().error.code).toBe('CSRF_INVALID');

    const foreignOrigin = await call(ctx.app, session, 'POST', '/api/users', body, { origin: 'https://site-malicioso.test' });
    expect(foreignOrigin.statusCode).toBe(403);
    expect(foreignOrigin.json().error.code).toBe('ORIGIN_NOT_ALLOWED');

    expect((await call(ctx.app, session, 'POST', '/api/users', body)).statusCode).toBe(201);
  });

  it('o token CSRF de uma sessão não vale para outra', async () => {
    const own = await freshOrg();
    const a = await login(ctx.app, own.users.ADMIN.email);
    const b = await login(ctx.app, own.users.OPERATOR.email);
    const response = await call(ctx.app, a, 'POST', '/api/auth/logout', undefined, { 'x-csrf-token': b.csrf });
    expect(response.statusCode).toBe(403);
  });

  it('logout revoga a sessão no servidor: o cookie antigo deixa de funcionar', async () => {
    const own = await freshOrg();
    const session = await login(ctx.app, own.users.TECHNICIAN.email);

    const response = await call(ctx.app, session, 'POST', '/api/auth/logout');
    expect(response.statusCode).toBe(204);
    expect(String(response.headers['set-cookie'])).toMatch(/aer_session=;/);

    // Reutilizar o mesmo cookie (roubado, por exemplo) falha.
    expect((await call(ctx.app, session, 'GET', '/api/auth/me')).statusCode).toBe(401);

    const [row] = await ctx.testDb.db.select().from(sessions).where(eq(sessions.userId, own.users.TECHNICIAN.id));
    expect(row?.revokedReason).toBe('LOGOUT');
    expect(row?.revokedAt).toBeInstanceOf(Date);

    const audited = await ctx.testDb.db.select().from(auditLogs).where(eq(auditLogs.actorUserId, own.users.TECHNICIAN.id));
    expect(audited.map((a) => a.action).sort()).toEqual(['auth.login.succeeded', 'auth.logout']);
  });

  it('expira a sessão pelo limite absoluto (12 h)', async () => {
    const own = await freshOrg();
    const session = await login(ctx.app, own.users.VIEWER.email);
    // Atividade a cada 100 min mantém a sessão viva pelo critério de inatividade (120 min)...
    for (let elapsed = 100; elapsed <= 700; elapsed += 100) {
      ctx.clock.advance(100 * 60_000);
      expect((await call(ctx.app, session, 'GET', '/api/auth/me')).statusCode, `aos ${elapsed} min`).toBe(200);
    }
    // ... mas o teto absoluto de 12 h (720 min) prevalece: aos 800 min a sessão não vale mais.
    ctx.clock.advance(100 * 60_000);
    expect((await call(ctx.app, session, 'GET', '/api/auth/me')).statusCode).toBe(401);
  });

  it('expira a sessão por inatividade (120 min) e renova enquanto houver atividade', async () => {
    const own = await freshOrg();
    const idle = await login(ctx.app, own.users.VIEWER.email);
    ctx.clock.advance(121 * 60_000);
    expect((await call(ctx.app, idle, 'GET', '/api/auth/me')).statusCode).toBe(401);

    const active = await login(ctx.app, own.users.OPERATOR.email);
    ctx.clock.advance(100 * 60_000);
    expect((await call(ctx.app, active, 'GET', '/api/auth/me')).statusCode).toBe(200);
    ctx.clock.advance(100 * 60_000); // 200 min no total, mas só 100 desde a última atividade
    expect((await call(ctx.app, active, 'GET', '/api/auth/me')).statusCode).toBe(200);
  });

  it('desativar o usuário derruba a sessão imediatamente', async () => {
    const own = await freshOrg();
    const session = await login(ctx.app, own.users.OPERATOR.email);
    await ctx.testDb.db.update(users).set({ isActive: false }).where(eq(users.id, own.users.OPERATOR.id));
    expect((await call(ctx.app, session, 'GET', '/api/auth/me')).statusCode).toBe(401);
  });

  it('troca de senha encerra as demais sessões, mantém a atual e invalida a senha antiga', async () => {
    const own = await freshOrg();
    const current = await login(ctx.app, own.users.ADMIN.email);
    const other = await login(ctx.app, own.users.ADMIN.email);
    const newPassword = 'nova-senha-super-forte-1';

    const wrong = await call(ctx.app, current, 'POST', '/api/auth/change-password', { currentPassword: 'errada-errada-12', newPassword });
    expect(wrong.statusCode).toBe(400);

    const ok = await call(ctx.app, current, 'POST', '/api/auth/change-password', { currentPassword: PASSWORD, newPassword });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().revokedSessions).toBe(1);

    expect((await call(ctx.app, current, 'GET', '/api/auth/me')).statusCode).toBe(200);
    expect((await call(ctx.app, other, 'GET', '/api/auth/me')).statusCode).toBe(401);

    const oldLogin = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: ORIGIN }, payload: { email: own.users.ADMIN.email, password: PASSWORD } });
    expect(oldLogin.statusCode).toBe(401);
    await login(ctx.app, own.users.ADMIN.email, newPassword);
  });
});
