// Gera um .env local a partir do .env.example, substituindo os marcadores __GENERATE_*__
// por valores aleatórios (o mesmo marcador recebe sempre o mesmo valor no arquivo).
// Não sobrescreve um .env existente.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = join(root, '.env.example');
const envPath = join(root, '.env');

if (existsSync(envPath)) {
  console.error('.env já existe; nada foi alterado. Remova-o manualmente se quiser regenerar.');
  process.exit(1);
}

const generated = new Map();
const content = readFileSync(examplePath, 'utf8').replace(/__GENERATE_[A-Z_]+__/g, (token) => {
  if (!generated.has(token)) {
    const bytes = token === '__GENERATE_SECRET__' ? 48 : 24;
    generated.set(token, randomBytes(bytes).toString('hex'));
  }
  return generated.get(token);
});

writeFileSync(envPath, content, { encoding: 'utf8', mode: 0o600 });
console.log(`.env criado com ${generated.size} segredos aleatórios. Revise os demais valores antes de usar.`);
