import { ROLES, type Role } from '@aer/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, call, createTestContext, login, seedOrganization, type SeededOrg, type TestContext, type TestSession } from './support/harness';

let ctx: TestContext;
let org: SeededOrg;
const sessions = {} as Record<Role, TestSession>;

beforeAll(async () => {
  ctx = await createTestContext();
  org = await seedOrganization(ctx, 'perm');
  for (const role of ROLES) sessions[role] = await login(ctx.app, org.users[role].email);
});
afterAll(async () => {
  await ctx.close();
});

interface Endpoint {
  name: string;
  method: 'GET' | 'POST' | 'PATCH';
  url: () => string;
  payload?: () => unknown;
  /** Perfis autorizados (os demais devem receber 403). */
  allowed: Role[];
  successStatus: number;
}

const endpoints: Endpoint[] = [
  { name: 'GET /api/users', method: 'GET', url: () => '/api/users', allowed: ['ADMIN'], successStatus: 200 },
  { name: 'GET /api/users/:id', method: 'GET', url: () => `/api/users/${org.users.VIEWER.id}`, allowed: ['ADMIN'], successStatus: 200 },
  {
    name: 'POST /api/users',
    method: 'POST',
    url: () => '/api/users',
    payload: () => ({ email: `n${Math.random().toString(36).slice(2)}@perm.test`, name: 'Novo', role: 'VIEWER', password: PASSWORD }),
    allowed: ['ADMIN'],
    successStatus: 201,
  },
  { name: 'PATCH /api/users/:id', method: 'PATCH', url: () => `/api/users/${org.users.VIEWER.id}`, payload: () => ({ name: 'Renomeado' }), allowed: ['ADMIN'], successStatus: 200 },
  { name: 'GET /api/audit-logs', method: 'GET', url: () => '/api/audit-logs', allowed: ['ADMIN'], successStatus: 200 },
  { name: 'GET /api/organizations/current', method: 'GET', url: () => '/api/organizations/current', allowed: [...ROLES], successStatus: 200 },
  { name: 'GET /api/auth/me', method: 'GET', url: () => '/api/auth/me', allowed: [...ROLES], successStatus: 200 },
];

describe('autorização por perfil', () => {
  for (const endpoint of endpoints) {
    describe(endpoint.name, () => {
      it('exige autenticação (401)', async () => {
        const response = await call(ctx.app, null, endpoint.method, endpoint.url(), endpoint.payload?.());
        expect(response.statusCode).toBe(401);
      });

      for (const role of ROLES) {
        const permitted = endpoint.allowed.includes(role);
        it(`${role}: ${permitted ? `permitido (${endpoint.successStatus})` : 'negado (403)'}`, async () => {
          const response = await call(ctx.app, sessions[role], endpoint.method, endpoint.url(), endpoint.payload?.());
          expect(response.statusCode).toBe(permitted ? endpoint.successStatus : 403);
          if (!permitted) expect(response.json().error.code).toBe('FORBIDDEN');
        });
      }
    });
  }

  it('autenticação, permissão e CSRF são verificados ANTES da validação do corpo (sem revelar o esquema a quem não deve)', async () => {
    const invalidBody = { email: 'nao-e-email', role: 'SUPERUSER' };

    const anonymous = await call(ctx.app, null, 'POST', '/api/users', invalidBody);
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json().error.details).toBeUndefined();

    const viewer = await call(ctx.app, sessions.VIEWER, 'POST', '/api/users', invalidBody);
    expect(viewer.statusCode).toBe(403);
    expect(viewer.json().error.code).toBe('FORBIDDEN');

    const noCsrf = await ctx.app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie: sessions.ADMIN.cookie, origin: 'http://localhost:5173' },
      payload: invalidBody,
    });
    expect(noCsrf.statusCode).toBe(403);
    expect(noCsrf.json().error.code).toBe('CSRF_INVALID');

    // Só depois de autenticado, autorizado e com CSRF válido o corpo inválido vira 400.
    const admin = await call(ctx.app, sessions.ADMIN, 'POST', '/api/users', invalidBody);
    expect(admin.statusCode).toBe(400);
  });

  it('a permissão negada não vaza dados: o corpo do 403 não contém o recurso', async () => {
    const response = await call(ctx.app, sessions.VIEWER, 'GET', '/api/users');
    expect(JSON.stringify(response.json())).not.toContain(org.users.ADMIN.email);
  });

  it('a lista de permissões da sessão reflete o perfil', async () => {
    const viewer = (await call(ctx.app, sessions.VIEWER, 'GET', '/api/auth/me')).json();
    expect(viewer.permissions).toContain('analytics:read');
    expect(viewer.permissions).not.toContain('users:manage');
    const technician = (await call(ctx.app, sessions.TECHNICIAN, 'GET', '/api/auth/me')).json();
    expect(technician.permissions).toContain('work-orders:execute');
  });
});
