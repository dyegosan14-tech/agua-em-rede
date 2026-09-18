// Gera docs/api/openapi.json a partir das rotas registradas (mesmos esquemas Zod usados na validação).
// Não precisa de banco nem de Redis: o pool é criado sem abrir conexões.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApiConfig } from '@aer/config';
import { createDb, createPasswordHasher, createPool } from '@aer/database';
import { buildApp } from '../src/app';
import { MemoryRateLimiter } from '../src/lib/rate-limiter';

const config = loadApiConfig({
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://openapi:openapi@localhost:5432/openapi',
  REDIS_URL: 'redis://localhost:6379',
  CORS_ORIGINS: 'http://localhost:5173',
  CSRF_SECRET: 'openapi-generation-only-not-a-real-secret',
  RATE_LIMIT_STORE: 'memory',
});

const pool = createPool({ url: config.database.url, max: 1 });
const app = await buildApp({
  config,
  pool,
  db: createDb(pool),
  redis: null,
  rateLimiter: new MemoryRateLimiter(),
  passwords: createPasswordHasher(),
});
await app.ready();

const target = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'api', 'openapi.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(app.swagger(), null, 2)}\n`, 'utf8');
console.log(`OpenAPI escrito em ${target}`);

await app.close();
await pool.end();
