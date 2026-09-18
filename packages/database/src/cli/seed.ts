import { ConfigError, loadDotEnvIfPresent, loadSeedConfig } from '@aer/config';
import { createDb, createPool } from '../client';
import { seedDemo } from '../seed';

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const config = loadSeedConfig();
  const pool = createPool({ url: config.databaseUrl, max: 2, applicationName: 'aer-seed' });
  try {
    const result = await seedDemo(createDb(pool), { password: config.seedPassword });
    if (!result.created) {
      console.log('Dados demonstrativos já existem; nada foi alterado.');
      return;
    }
    console.log('Dados demonstrativos criados (organização, setores, ativos e dispositivos FICTÍCIOS).');
    console.log('Credenciais (exibidas somente agora; não são recuperáveis):');
    for (const credential of result.credentials) {
      console.log(`  ${credential.role.padEnd(10)} ${credential.email}  senha: ${credential.password}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
});
