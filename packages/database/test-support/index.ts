import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { createDb, createPool, type Db } from '../src/client';
import { runMigrations } from '../src/migrate';

export interface TestDatabase {
  kind: 'postgres' | 'pglite';
  url: string;
  pool: pg.Pool;
  db: Db;
  /** Esvazia todos os dados (mantém o schema). */
  reset(): Promise<void>;
  close(): Promise<void>;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Não foi possível reservar uma porta livre'));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

/**
 * Cria um banco isolado, com todas as migrations aplicadas, para testes de integração.
 *
 *  - Com TEST_DATABASE_URL: cria um banco temporário (CREATE DATABASE) em um PostgreSQL+PostGIS real
 *    e o remove ao final. É o modo recomendado (CI / docker compose).
 *  - Sem TEST_DATABASE_URL: sobe um PGlite (PostgreSQL em WASM) com PostGIS, exposto por socket para
 *    que o código de produção continue usando o driver `pg`. Uma única sessão PostgreSQL atende todas
 *    as conexões, portanto o pool de testes usa apenas 1 conexão (sem paralelismo real de transações).
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const externalUrl = process.env['TEST_DATABASE_URL'];
  return externalUrl ? createPostgresDatabase(externalUrl) : createPgliteDatabase();
}

async function finish(kind: TestDatabase['kind'], url: string, poolMax: number, dispose: () => Promise<void>): Promise<TestDatabase> {
  const pool = createPool({ url, max: poolMax });
  const db = createDb(pool);
  try {
    await runMigrations(pool);
  } catch (error) {
    await pool.end().catch(() => undefined);
    await dispose().catch(() => undefined);
    throw error;
  }
  return {
    kind,
    url,
    pool,
    db,
    async reset() {
      await pool.query('TRUNCATE organizations RESTART IDENTITY CASCADE');
    },
    async close() {
      await pool.end();
      await dispose();
    },
  };
}

async function createPostgresDatabase(adminUrl: string): Promise<TestDatabase> {
  const name = `aer_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return finish('postgres', url.toString(), 5, async () => {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  });
}

async function createPgliteDatabase(): Promise<TestDatabase> {
  const lite = await PGlite.create({ extensions: { postgis } });
  const port = await freePort();
  const server = new PGLiteSocketServer({ db: lite, port, host: '127.0.0.1', maxConnections: 4 });
  await server.start();
  return finish('pglite', `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`, 1, async () => {
    await server.stop();
    await lite.close();
  });
}
