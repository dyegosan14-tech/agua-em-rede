import { defineConfig } from 'vitest/config';

// Dois projetos:
//  - unit: sem dependências externas (rápido).
//  - integration: exige um banco PostgreSQL/PostGIS. Usa TEST_DATABASE_URL quando definido;
//    caso contrário sobe um PGlite+PostGIS em memória (ver packages/database/test-support).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/*.int.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['packages/**/*.int.test.ts', 'apps/**/*.int.test.ts'],
          exclude: ['**/node_modules/**'],
          testTimeout: 60_000,
          hookTimeout: 180_000,
          fileParallelism: true,
        },
      },
    ],
  },
});
