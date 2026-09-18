import { livenessResponseSchema, readinessResponseSchema, type ReadinessResponse } from '@aer/contracts';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import type pg from 'pg';

const CHECK_TIMEOUT_MS = 2_000;

async function withTimeout(promise: Promise<unknown>): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function healthRoutes(app: FastifyInstance, deps: { pool: pg.Pool; redis: Redis | null }): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Liveness: o processo está de pé. Não toca em dependências (evita reinícios em cascata).
  r.get(
    '/live',
    { schema: { tags: ['Operação'], summary: 'Liveness', response: { 200: livenessResponseSchema } } },
    async () => ({ status: 'ok' as const }),
  );

  // Readiness: pronto para receber tráfego? Exige banco; Redis é exigido quando configurado.
  r.get(
    '/ready',
    {
      schema: {
        tags: ['Operação'],
        summary: 'Readiness (banco de dados e Redis)',
        response: { 200: readinessResponseSchema, 503: readinessResponseSchema },
      },
    },
    async (_request, reply) => {
      const database = (await withTimeout(deps.pool.query('SELECT 1'))) ? 'up' : 'down';
      const redis: ReadinessResponse['checks']['redis'] = deps.redis ? ((await withTimeout(deps.redis.ping())) ? 'up' : 'down') : 'disabled';
      const ready = database === 'up' && redis !== 'down';
      const body: ReadinessResponse = { status: ready ? 'ok' : 'degraded', checks: { database, redis } };
      return reply.code(ready ? 200 : 503).send(body);
    },
  );
}
