import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { loggerOptions } from '../src/lib/logger';
import { MemoryRateLimiter, RedisRateLimiter } from '../src/lib/rate-limiter';
import { csrfTokenFor, fingerprint, generateSessionToken, hashToken, safeEqual } from '../src/lib/tokens';
import { sanitizeMetadata } from '../src/modules/audit/audit.service';

describe('tokens', () => {
  it('gera tokens opacos e únicos com hash SHA-256 determinístico', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a.token)).toBe(a.hash);
    expect(a.hash).not.toContain(a.token);
  });

  it('CSRF é determinístico por sessão, distinto entre sessões e entre segredos', () => {
    const secret = 's'.repeat(40);
    expect(csrfTokenFor(secret, 'sessao-1')).toBe(csrfTokenFor(secret, 'sessao-1'));
    expect(csrfTokenFor(secret, 'sessao-1')).not.toBe(csrfTokenFor(secret, 'sessao-2'));
    expect(csrfTokenFor(secret, 'sessao-1')).not.toBe(csrfTokenFor('t'.repeat(40), 'sessao-1'));
  });

  it('safeEqual compara em tempo constante e trata tamanhos diferentes', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('fingerprint ignora caixa e não expõe o valor', () => {
    expect(fingerprint('Fulano@Exemplo.test')).toBe(fingerprint('fulano@exemplo.test'));
    expect(fingerprint('fulano@exemplo.test')).not.toContain('fulano');
  });
});

describe('MemoryRateLimiter', () => {
  it('bloqueia após o máximo e libera quando a janela vence', async () => {
    let now = 1_000_000;
    const limiter = new MemoryRateLimiter(() => now);
    const rule = { max: 2, windowSeconds: 60 };
    expect((await limiter.consume('k', rule)).allowed).toBe(true);
    expect((await limiter.consume('k', rule)).allowed).toBe(true);
    const blocked = await limiter.consume('k', rule);
    expect(blocked).toMatchObject({ allowed: false, remaining: 0 });
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect((await limiter.consume('outra', rule)).allowed).toBe(true);
    now += 61_000;
    expect((await limiter.consume('k', rule)).allowed).toBe(true);
  });
});

describe('RedisRateLimiter', () => {
  it('usa o resultado do Redis e degrada para o limitador local quando o Redis falha', async () => {
    const fallbackCalls: string[] = [];
    const fallback = {
      consume: (key: string) => {
        fallbackCalls.push(key);
        return Promise.resolve({ allowed: true, remaining: 1, retryAfterSeconds: 1 });
      },
    };
    const working = { eval: () => Promise.resolve([3, 45_000]) };
    const ok = await new RedisRateLimiter(working as never, fallback).consume('k', { max: 2, windowSeconds: 60 });
    expect(ok).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 45 });
    expect(fallbackCalls).toEqual([]);

    let reported = 0;
    const broken = { eval: () => Promise.reject(new Error('Stream isn\'t writeable')) };
    const degraded = await new RedisRateLimiter(broken as never, fallback, () => (reported += 1)).consume('k2', { max: 2, windowSeconds: 60 });
    expect(degraded.allowed).toBe(true);
    expect(fallbackCalls).toEqual(['k2']);
    expect(reported).toBe(1);
  });
});

describe('sanitizeMetadata (auditoria)', () => {
  it('remove valores sensíveis em qualquer profundidade', () => {
    const result = sanitizeMetadata({
      role: 'ADMIN',
      password: 'x',
      nested: { sessionToken: 'abc', Authorization: 'Bearer y', ok: 1, list: [{ passwordHash: 'h', keep: true }] },
    });
    expect(result).toEqual({
      role: 'ADMIN',
      password: '[REDACTED]',
      nested: { sessionToken: '[REDACTED]', Authorization: '[REDACTED]', ok: 1, list: [{ passwordHash: '[REDACTED]', keep: true }] },
    });
  });
});

describe('logs estruturados', () => {
  it('não gravam cookies, autorização nem senhas', () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const logger = pino(loggerOptions({ logLevel: 'info', isProduction: true }), stream);
    logger.info(
      {
        req: { method: 'POST', url: '/api/auth/login', id: 'r1', ip: '10.0.0.1', headers: { cookie: 'aer_session=SEGREDO', authorization: 'Bearer SEGREDO' } },
        body: { password: 'SEGREDO' },
        user: { password: 'SEGREDO', currentPassword: 'SEGREDO', csrfToken: 'SEGREDO' },
        res: { statusCode: 200, headers: { 'set-cookie': 'aer_session=SEGREDO' } },
      },
      'requisição',
    );
    const output = lines.join('');
    expect(output).not.toContain('SEGREDO');
    expect(output).toContain('/api/auth/login');
    expect(output).toContain('"requestId":"r1"');
  });
});
