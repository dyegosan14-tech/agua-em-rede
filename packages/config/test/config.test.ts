import { describe, expect, it } from 'vitest';
import { ConfigError, loadApiConfig, loadSeedConfig } from '../src';

const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://:p@localhost:6379',
  CORS_ORIGINS: 'http://localhost:5173',
  CSRF_SECRET: 'a'.repeat(40),
};

function problemsOf(fn: () => unknown): string[] {
  try {
    fn();
  } catch (error) {
    if (error instanceof ConfigError) return [...error.problems];
    throw error;
  }
  return [];
}

describe('loadApiConfig', () => {
  it('aplica padrões seguros e monta a estrutura', () => {
    const config = loadApiConfig(valid);
    expect(config.api.port).toBe(3000);
    expect(config.api.docsEnabled).toBe(true);
    expect(config.auth.cookieSecure).toBe(false);
    expect(config.auth.sessionAbsoluteTtlHours).toBe(12);
    expect(config.rateLimit.store).toBe('redis');
  });

  it('reporta variáveis ausentes sem ecoar valores', () => {
    const problems = problemsOf(() => loadApiConfig({ NODE_ENV: 'development', CSRF_SECRET: 'segredo-curto-demais' }));
    expect(problems.some((p) => p.startsWith('DATABASE_URL'))).toBe(true);
    expect(problems.some((p) => p.startsWith('CSRF_SECRET'))).toBe(true);
    expect(problems.join(' ')).not.toContain('segredo-curto-demais');
  });

  it('recusa segredo com marcador de exemplo', () => {
    const problems = problemsOf(() => loadApiConfig({ ...valid, CSRF_SECRET: '__GENERATE_SECRET__'.padEnd(40, 'x') }));
    expect(problems.some((p) => p.startsWith('CSRF_SECRET'))).toBe(true);
  });

  it('trata variável vazia como ausente', () => {
    expect(loadApiConfig({ ...valid, API_PORT: '' }).api.port).toBe(3000);
  });

  it('em produção exige https, redis no rate limit e Argon2 forte; cookie Secure e docs desligadas', () => {
    const production = { ...valid, NODE_ENV: 'production', CORS_ORIGINS: 'https://app.exemplo.gov.br' };
    const config = loadApiConfig(production);
    expect(config.auth.cookieSecure).toBe(true);
    expect(config.api.docsEnabled).toBe(false);

    expect(problemsOf(() => loadApiConfig({ ...production, CORS_ORIGINS: 'http://app.exemplo.gov.br' }))).toEqual([
      expect.stringContaining('CORS_ORIGINS'),
    ]);
    expect(problemsOf(() => loadApiConfig({ ...production, RATE_LIMIT_STORE: 'memory' }))).toEqual([
      expect.stringContaining('RATE_LIMIT_STORE'),
    ]);
    expect(problemsOf(() => loadApiConfig({ ...production, ARGON2_MEMORY_KIB: '1024' }))).toEqual([
      expect.stringContaining('ARGON2'),
    ]);
  });
});

describe('loadSeedConfig', () => {
  it('recusa rodar em produção', () => {
    expect(problemsOf(() => loadSeedConfig({ NODE_ENV: 'production', DATABASE_URL: valid.DATABASE_URL }))).toEqual([
      expect.stringContaining('produção'),
    ]);
  });

  it('exige senha mínima quando informada', () => {
    expect(problemsOf(() => loadSeedConfig({ DATABASE_URL: valid.DATABASE_URL, SEED_PASSWORD: 'curta' }))).toEqual([
      expect.stringContaining('SEED_PASSWORD'),
    ]);
    expect(loadSeedConfig({ DATABASE_URL: valid.DATABASE_URL }).seedPassword).toBeUndefined();
  });
});
