// Servidor PostgreSQL+PostGIS EM WASM (PGlite) exposto por socket, para desenvolver/verificar SEM Docker.
// NÃO é um PostgreSQL real: serve apenas de alternativa local e para os testes. Para o piloto use o
// docker-compose (postgis/postgis). Uso: npm run dev:pglite -w @aer/database [-- <diretório-de-dados>]
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const dataDir = process.argv[2];
const port = Number(process.env['PGLITE_PORT'] ?? 54329);

const lite = await PGlite.create({ ...(dataDir ? { dataDir } : {}), extensions: { postgis } });
const server = new PGLiteSocketServer({ db: lite, port, host: '127.0.0.1', maxConnections: 4 });
await server.start();
console.log(`PGlite+PostGIS ouvindo em postgresql://postgres:postgres@127.0.0.1:${port}/postgres ${dataDir ? `(dados em ${dataDir})` : '(em memória)'}`);

const stop = async () => {
  await server.stop();
  await lite.close();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
