import { loadDatabaseConfig, loadDotEnvIfPresent, ConfigError } from '@aer/config';
import { createPool } from '../client';
import { runMigrations } from '../migrate';

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const config = loadDatabaseConfig();
  const pool = createPool({ url: config.database.url, max: 2, applicationName: 'aer-migrate' });
  try {
    const result = await runMigrations(pool, { log: (message) => console.log(message) });
    console.log(
      result.applied.length === 0
        ? `Banco já está atualizado (${result.alreadyApplied.length} migrations aplicadas).`
        : `Migrations aplicadas: ${result.applied.join(', ')}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
});
