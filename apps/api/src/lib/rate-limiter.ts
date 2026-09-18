import type { Redis } from 'ioredis';

export interface RateLimitRule {
  max: number;
  windowSeconds: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** Conta uma tentativa para `key` (janela fixa) e informa se ainda está dentro do limite. */
  consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision>;
}

/** Implementação em memória: adequada a testes e a um único processo de desenvolvimento. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    const now = this.now();
    if (this.buckets.size > 10_000) this.sweep(now);
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + rule.windowSeconds * 1000 };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    return Promise.resolve({
      allowed: bucket.count <= rule.max,
      remaining: Math.max(0, rule.max - bucket.count),
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    });
  }

  private sweep(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

// INCR + PEXPIRE atômicos: se o processo cair entre os dois comandos, a chave não fica sem TTL.
const INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`;

/**
 * Rate limit compartilhado entre instâncias via Redis. Se o Redis estiver indisponível, degrada para
 * o limitador local (proteção parcial, por instância) em vez de derrubar o login ou deixá-lo sem limite.
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly fallback: RateLimiter,
    private readonly onFallback: (error: unknown) => void = () => undefined,
    private readonly prefix = 'aer:rl:',
  ) {}

  async consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    try {
      const result = (await this.redis.eval(INCREMENT_SCRIPT, 1, this.prefix + key, String(rule.windowSeconds * 1000))) as [
        number,
        number,
      ];
      const [count, ttlMs] = result;
      return {
        allowed: count <= rule.max,
        remaining: Math.max(0, rule.max - count),
        retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
      };
    } catch (error) {
      this.onFallback(error);
      return this.fallback.consume(key, rule);
    }
  }
}
