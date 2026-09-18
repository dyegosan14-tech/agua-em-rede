import { loadApiConfig, type ApiConfig } from '@aer/config';
import type { SessionResponse } from '@aer/contracts';
import { createPasswordHasher, organizations, users, type PasswordHasher } from '@aer/database';
import { createTestDatabase, type TestDatabase } from '@aer/database/test-support';
import { ROLES, type Role } from '@aer/domain';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../src/app';
import { MemoryRateLimiter } from '../../src/lib/rate-limiter';

export const ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'senha-forte-123456';

/** Parâmetros Argon2 mínimos: só para os testes rodarem rápido. Produção usa os valores do .env. */
export const testHasher: PasswordHasher = createPasswordHasher({ memoryKib: 512, timeCost: 1 });

export function testConfig(overrides: Record<string, string> = {}): ApiConfig {
  return loadApiConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://ignored:ignored@localhost:5432/ignored',
    REDIS_URL: 'redis://localhost:6379',
    CORS_ORIGINS: ORIGIN,
    CSRF_SECRET: 'segredo-csrf-de-teste-com-mais-de-32-caracteres',
    RATE_LIMIT_STORE: 'memory',
    ARGON2_MEMORY_KIB: '512',
    ARGON2_TIME_COST: '1',
    ...overrides,
  });
}

/** Relógio controlável para testar expiração de sessão sem esperar. */
export class TestClock {
  private current = Date.now();
  readonly now = (): Date => new Date(this.current);
  advance(ms: number): void {
    this.current += ms;
  }
}

export interface TestContext {
  app: FastifyInstance;
  testDb: TestDatabase;
  clock: TestClock;
  rateLimiter: MemoryRateLimiter;
  config: ApiConfig;
  close(): Promise<void>;
}

export async function createTestContext(options: { config?: ApiConfig } = {}): Promise<TestContext> {
  const testDb = await createTestDatabase();
  const clock = new TestClock();
  const rateLimiter = new MemoryRateLimiter(() => clock.now().getTime());
  const config = options.config ?? testConfig();
  const app = await buildApp({
    config,
    pool: testDb.pool,
    db: testDb.db,
    redis: null,
    rateLimiter,
    passwords: testHasher,
    clock: clock.now,
  });
  await app.ready();
  return {
    app,
    testDb,
    clock,
    rateLimiter,
    config,
    async close() {
      await app.close();
      await testDb.close();
    },
  };
}

export interface SeededOrg {
  organizationId: string;
  slug: string;
  users: Record<Role, { id: string; email: string; password: string }>;
}

/** Cria uma organização com um usuário de cada perfil (senha conhecida). */
export async function seedOrganization(ctx: TestContext, slug: string): Promise<SeededOrg> {
  const [organization] = await ctx.testDb.db
    .insert(organizations)
    .values({ name: `Organização ${slug}`, slug, isDemo: true })
    .returning({ id: organizations.id });
  if (!organization) throw new Error('organização não criada');

  const passwordHash = await testHasher.hash(PASSWORD);
  const rows = await ctx.testDb.db
    .insert(users)
    .values(
      ROLES.map((role) => ({
        organizationId: organization.id,
        email: `${role.toLowerCase()}@${slug}.test`,
        name: `${role} ${slug}`,
        role,
        passwordHash,
      })),
    )
    .returning({ id: users.id, email: users.email, role: users.role });

  const byRole = Object.fromEntries(rows.map((row) => [row.role, { id: row.id, email: row.email, password: PASSWORD }])) as SeededOrg['users'];
  return { organizationId: organization.id, slug, users: byRole };
}

export interface TestSession {
  cookie: string;
  csrf: string;
  body: SessionResponse;
}

export function sessionCookieFrom(response: LightMyRequestResponse): string | null {
  const cookie = response.cookies.find((item) => item.name.endsWith('aer_session'));
  return cookie && cookie.value ? `${cookie.name}=${cookie.value}` : null;
}

export async function login(app: FastifyInstance, email: string, password = PASSWORD): Promise<TestSession> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { origin: ORIGIN },
    payload: { email, password },
  });
  if (response.statusCode !== 200) throw new Error(`login falhou (${response.statusCode}): ${response.body}`);
  const cookie = sessionCookieFrom(response);
  if (!cookie) throw new Error('cookie de sessão ausente');
  const body = response.json<SessionResponse>();
  return { cookie, csrf: body.csrfToken, body };
}

export function call(
  app: FastifyInstance,
  session: TestSession | null,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<LightMyRequestResponse> {
  const headers: Record<string, string> = { ...extraHeaders };
  if (session) headers['cookie'] = session.cookie;
  if (method !== 'GET') {
    headers['origin'] ??= ORIGIN;
    if (session) headers['x-csrf-token'] ??= session.csrf;
  }
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) });
}
