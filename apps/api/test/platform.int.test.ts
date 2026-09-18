import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { MemoryRateLimiter } from '../src/lib/rate-limiter';
import { ORIGIN, createTestContext, testConfig, testHasher, type TestContext } from './support/harness';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

describe('saúde e operação', () => {
  it('liveness não depende de nada externo', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/health/live' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('readiness confirma o banco e informa Redis desativado quando não configurado', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', checks: { database: 'up', redis: 'disabled' } });
  });

  it('readiness responde 503 quando o banco está indisponível, sem vazar detalhes', async () => {
    const brokenPool = { query: () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432')) };
    const app = await buildApp({
      config: testConfig(),
      pool: brokenPool as never,
      db: ctx.testDb.db,
      redis: null,
      rateLimiter: new MemoryRateLimiter(),
      passwords: testHasher,
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/health/ready' });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ status: 'degraded', checks: { database: 'down', redis: 'disabled' } });
      expect(response.body).not.toContain('10.0.0.5');
    } finally {
      await app.close();
    }
  });
});

describe('request id', () => {
  it('gera um id quando ausente e o devolve no cabeçalho e nos erros', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/auth/me' });
    const header = response.headers['x-request-id'];
    expect(typeof header).toBe('string');
    expect(response.json().error.requestId).toBe(header);
  });

  it('aceita um id bem formado do cliente/proxy e descarta valores suspeitos', async () => {
    const good = await ctx.app.inject({ method: 'GET', url: '/health/live', headers: { 'x-request-id': 'proxy-req-12345' } });
    expect(good.headers['x-request-id']).toBe('proxy-req-12345');

    const bad = await ctx.app.inject({ method: 'GET', url: '/health/live', headers: { 'x-request-id': 'x\r\nSet-Cookie: a=b' } });
    expect(bad.headers['x-request-id']).not.toContain('Set-Cookie');
    const tooShort = await ctx.app.inject({ method: 'GET', url: '/health/live', headers: { 'x-request-id': 'ab' } });
    expect(tooShort.headers['x-request-id']).not.toBe('ab');
  });
});

describe('cabeçalhos de segurança e CORS', () => {
  it('envia cabeçalhos de segurança e impede cache de respostas da API', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('CORS: reflete apenas origens permitidas, com credenciais', async () => {
    const allowed = await ctx.app.inject({ method: 'GET', url: '/health/live', headers: { origin: ORIGIN } });
    expect(allowed.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await ctx.app.inject({ method: 'GET', url: '/health/live', headers: { origin: 'https://site-malicioso.test' } });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rotas inexistentes e JSON malformado usam o envelope de erro padrão', async () => {
    const notFound = await ctx.app.inject({ method: 'GET', url: '/api/nao-existe' });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json().error.code).toBe('NOT_FOUND');

    const malformed = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      payload: '{"email": ',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('documentação OpenAPI é gerada com o esquema de segurança por cookie e os endpoints de autenticação', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/api/docs/json' });
    expect(response.statusCode).toBe(200);
    const doc = response.json();
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.components.securitySchemes.cookieAuth).toMatchObject({ type: 'apiKey', in: 'cookie' });
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/api/auth/login', '/api/auth/logout', '/api/users', '/api/users/{id}', '/api/audit-logs', '/health/ready']),
    );
  });
});
