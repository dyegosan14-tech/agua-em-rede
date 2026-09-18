import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

export interface Migration {
  id: string;
  sql: string;
  checksum: string;
}

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
}

export const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

// Chave arbitrária e estável do lock consultivo: impede duas instâncias migrando ao mesmo tempo.
const MIGRATION_LOCK_KEY = 726_548_301;
const FILE_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

/** Normaliza quebras de linha para que o checksum não dependa do sistema operacional (CRLF/LF). */
function checksumOf(sqlText: string): string {
  return createHash('sha256').update(sqlText.replace(/\r\n/g, '\n')).digest('hex');
}

export function loadMigrations(dir: string = DEFAULT_MIGRATIONS_DIR): Migration[] {
  const files = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
  return files.map((name) => {
    if (!FILE_PATTERN.test(name)) {
      throw new Error(`Nome de migration inválido: ${name} (esperado NNNN_descricao_em_snake_case.sql)`);
    }
    const sqlText = readFileSync(join(dir, name), 'utf8');
    return { id: name.replace(/\.sql$/, ''), sql: sqlText, checksum: checksumOf(sqlText) };
  });
}

/**
 * Aplica migrations SQL pendentes, em ordem, cada uma em sua própria transação.
 *  - Migrations já aplicadas são verificadas por checksum: editar uma migration aplicada é um erro.
 *    Correções entram como uma nova migration.
 *  - Um lock consultivo serializa execuções concorrentes.
 */
export async function runMigrations(
  pool: pg.Pool,
  options: { dir?: string; log?: (message: string) => void } = {},
): Promise<MigrationResult> {
  const migrations = loadMigrations(options.dir);
  const log = options.log ?? (() => undefined);
  const client = await pool.connect();
  const result: MigrationResult = { applied: [], alreadyApplied: [] };
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id          text PRIMARY KEY,
        checksum    text NOT NULL,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ id: string; checksum: string }>('SELECT id, checksum FROM schema_migrations');
    const applied = new Map(rows.map((row) => [row.id, row.checksum]));

    for (const migration of migrations) {
      const existing = applied.get(migration.id);
      if (existing !== undefined) {
        if (existing !== migration.checksum) {
          throw new Error(
            `A migration ${migration.id} já foi aplicada e o arquivo mudou desde então (checksum divergente). ` +
              'Não edite migrations aplicadas; crie uma nova.',
          );
        }
        result.alreadyApplied.push(migration.id);
        continue;
      }
      log(`Aplicando ${migration.id}...`);
      try {
        await client.query('BEGIN');
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)', [migration.id, migration.checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Falha ao aplicar ${migration.id}: ${error instanceof Error ? error.message : String(error)}`, {
          cause: error,
        });
      }
      result.applied.push(migration.id);
    }
    return result;
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    } finally {
      client.release();
    }
  }
}
