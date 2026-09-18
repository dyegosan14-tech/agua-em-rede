import { defineConfig } from 'tsup';

// Empacota o código da aplicação e os pacotes internos (@aer/*, distribuídos como TypeScript-fonte);
// dependências de terceiros (inclusive nativas, como argon2) permanecem externas.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@aer\//],
});
