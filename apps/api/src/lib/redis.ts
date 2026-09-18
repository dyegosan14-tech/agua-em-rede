import { Redis } from 'ioredis';
import type { Logger } from 'pino';

/**
 * Cliente Redis para a API (rate limit e readiness). Falha rápido quando desconectado
 * (sem fila offline) para que o chamador possa degradar em vez de ficar pendurado.
 */
export function createRedis(url: string, logger: Logger): Redis {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 3_000,
    retryStrategy: (attempt) => Math.min(attempt * 250, 3_000),
  });
  let lastLogged = 0;
  redis.on('error', (error) => {
    // Evita inundar o log quando o Redis está fora do ar.
    if (Date.now() - lastLogged > 10_000) {
      lastLogged = Date.now();
      logger.warn({ err: error }, 'Redis indisponível');
    }
  });
  return redis;
}
