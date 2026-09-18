import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Aceita tanto o banco quanto uma transação: repositórios recebem um Executor. */
export type Executor = Db | Tx;

export interface PoolOptions {
  url: string;
  max: number;
  applicationName?: string;
  /** Erros de conexões ociosas não devem derrubar o processo silenciosamente nem ficar sem log. */
  onError?: (error: Error) => void;
}

export function createPool({ url, max, applicationName, onError }: PoolOptions): pg.Pool {
  const pool = new pg.Pool({
    connectionString: url,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ...(applicationName ? { application_name: applicationName } : {}),
  });
  pool.on('error', (error) => onError?.(error));
  return pool;
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema });
}
