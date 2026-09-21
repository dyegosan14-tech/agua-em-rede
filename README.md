# Água em Rede

Plataforma para monitoramento de pressão e vazão e gestão da redução de perdas na distribuição de água (MVP para piloto em Recife).

> **A meta de reduzir 30% das perdas é uma hipótese a validar no piloto, não uma garantia do software.**
> O sistema não afirma que toda anomalia é vazamento, não classifica ligações clandestinas, não promete localização exata
> de vazamentos, não mistura dados simulados com reais e não comanda válvulas nem bombas.

## Estado do projeto: etapas 1 a 5 concluídas

| Etapa | Escopo | Situação |
|---|---|---|
| 1 | Estrutura, infraestrutura, banco e autenticação | **Implementada** |
| 2 | Setores, dispositivos e mapa GIS interativo | **Implementada** |
| 3 | Ingestão de telemetria, credenciais IoT e gráficos | **Implementada** |
| 4 | Regras de detecção, janelas de manutenção e alertas | **Implementada** |
| 5 | Ordens de serviço, evidências fotográficas e PWA | **Implementada** |
| 6 | Indicadores, E2E, CI/CD e documentação final | **Implementada** |

### O que está implementado

- **Monorepo**: `apps/{api,worker,web}`, `packages/{config,contracts,domain,database}`.
- **Banco de Dados**: PostGIS (SRID 4326) com polígonos GeoJSON de setores e coordenadas de sensores em Recife, auditoria e isolamento multitenant estrito.
- **Autenticação & Segurança**: Sessões no servidor com tokens opacos SHA-256, cookies `HttpOnly` / `SameSite=Strict`, proteção CSRF por HMAC, rate limit (Redis/memória) e RBAC (ADMIN, OPERATOR, TECHNICIAN, VIEWER).
- **Mapa Georreferenciado Interativo (GIS)**: Tela `/mapa` construída com Leaflet, exibindo limites poligonais de setores de abastecimento (Centro Histórico, Boa Viagem, Casa Forte, etc.), localização de sensores de pressão e medidores de vazão com pins customizados e status operacional em tempo real.
- **Gráficos de Telemetria**: Visualização responsiva de séries temporais de pressão (mca) e vazão (m³/h) com faixas operacionais mín/máx e marcadores de anomalia.
- **Ingestão Direta IoT & Credenciais**: Endpoint `POST /api/telemetry/device-ingest` com cabeçalho `X-Device-Key`, segredos criptográficos de 256 bits gerados na UI web com hash SHA-256 no banco e cópia facilitada com exemplos em cURL.
- **Detecção de Falha de Comunicação**: Job de background no BullMQ (`check-no-communication`) que avalia sensores inativos a cada 5 minutos e abre alertas `NO_COMMUNICATION` automaticamente.
- **Regras e Janelas de Manutenção**: Módulos completos para cadastro de regras (`/api/detection-rules`) e agendamento de janelas de manutenção preventiva (`/api/maintenance-windows`) para silenciar alarmes durante intervenções na rede.
- **Ordens de Serviço & PWA de Campo**: Gestão de reparos e contenção de vazamentos com estimativa de volume salvo (m³), captura e upload de fotos/evidências de campo com hash SHA-256, Web App Manifest e Service Worker para suporte offline em smartphones e tablets.
- **Testes E2E de Ciclo Completo**: Teste automatizado de ponta a ponta (`apps/api/test/e2e-lifecycle.int.test.ts`) cobrindo desde a transmissão anômala do sensor IoT até a resolução da ordem em campo com fotos e consolidação no painel da Meta de 30%.
- **Containerização & Deploy (Docker)**: `Dockerfile` multi-stage para API, Worker e Web (Nginx), orquestrados via `docker-compose.prod.yml` para execução imediata em qualquer ambiente.
- **Automação de CI/CD**: Pipeline do GitHub Actions (`.github/workflows/ci.yml`) que valida linter, tipos estáticos, suíte de 148 testes e compilação de produção.
- **Roteiro de Demonstração & Pitch**: Documentação em `docs/pitch_e_demo.md` detalhando a proposta de valor, decisões de engenharia e roteiro para apresentação ao vivo.

## Requisitos

- Node.js **≥ 20.18** (recomendado 22 LTS; a verificação desta etapa foi feita no 20.18) e npm ≥ 10.
- Docker (para PostgreSQL+PostGIS, Redis e MinIO) — ou a alternativa sem Docker abaixo, só para desenvolvimento.

## Como executar

```bash
npm install
npm run setup:env        # cria .env com segredos aleatórios (não sobrescreve um .env existente)
npm run infra:up         # PostgreSQL+PostGIS, Redis (AOF) e MinIO (bucket privado)
npm run db:migrate       # aplica as migrations SQL
SEED_PASSWORD='uma-senha-forte-com-12+' npm run db:seed   # dados FICTÍCIOS de demonstração
npm run dev              # api :3000, worker e web :5173
```

Abra http://localhost:5173. Usuários do seed (`@demo.aguaemrede.test`): `admin`, `operador`, `tecnico`, `visualizador`.
Sem `SEED_PASSWORD` o seed gera senhas aleatórias e as imprime **uma única vez**. O seed recusa rodar com `NODE_ENV=production`.

No Windows/PowerShell: `$env:SEED_PASSWORD='...'; npm run db:seed`.

### Alternativa sem Docker (apenas desenvolvimento)

`npm run dev:pglite -w @aer/database` sobe um PostgreSQL+PostGIS em WASM (PGlite) em `127.0.0.1:54329`
(`postgresql://postgres:postgres@127.0.0.1:54329/postgres`). **Não é PostgreSQL real** — não use no piloto. Sem Redis, defina
`RATE_LIMIT_STORE=memory`; a API fica "degradada" no `/health/ready` (Redis é exigido quando configurado), mas o login funciona.

## Scripts

| Comando | Função |
|---|---|
| `npm run dev` | API, worker e web em modo desenvolvimento |
| `npm run build` | Build de produção (API/worker via tsup, web via Vite) |
| `npm run lint` | ESLint (regras estritas, `no-explicit-any`) |
| `npm run typecheck` | `tsc` em todos os workspaces (`strict`, `noUncheckedIndexedAccess`) |
| `npm test` | Vitest: unitários + integração |
| `npm run test:unit` / `test:integration` | Um dos dois projetos |
| `npm run openapi` | Regenera `docs/api/openapi.json` |

### Testes de integração e o banco

Os testes de integração criam um banco isolado com todas as migrations:

- **Com `TEST_DATABASE_URL`** (usuário com `CREATE DATABASE`, ex.: o do compose): usam PostgreSQL+PostGIS **reais**.
- **Sem ela**: usam PGlite+PostGIS em memória, por socket, com o mesmo driver `pg`.

## Estrutura

```
apps/api      API Fastify (módulos: auth, organizations, users, audit, health)
apps/worker   Worker BullMQ
apps/web      React + Vite + Tailwind
packages/domain     regras puras: papéis, permissões, enumerações
packages/contracts  esquemas Zod compartilhados API/web
packages/database   schema Drizzle, migrations SQL, migrator, seed, suporte a testes
packages/config     validação de variáveis de ambiente
docs/         arquitetura, segurança, OpenAPI
infra/        scripts de infraestrutura (MinIO)
```

Mais: [docs/architecture.md](docs/architecture.md) · [docs/security.md](docs/security.md) · [docs/api/openapi.json](docs/api/openapi.json)

## Pendências reais da etapa 1

- **Não verificado contra PostgreSQL/PostGIS reais nem Redis reais**: neste ambiente não havia Docker. Migrations e testes
  rodaram em PGlite+PostGIS; BullMQ, o limitador Redis e o `docker-compose.yml` **não foram executados**. As tags de imagem do MinIO
  no compose não foram puxadas (podem ser trocadas via `MINIO_IMAGE`/`MINIO_MC_IMAGE`). Rode `npm run infra:up` e
  `TEST_DATABASE_URL=... npm test` antes de confiar.
- Verificação feita no Node 20.18; o Node 22 não foi testado aqui.
- Sem Dockerfiles das aplicações nem CI.
- Sem testes automatizados de componentes React; a UI foi verificada manualmente (Edge headless), não por suíte.
- Regra do "último administrador" testada por serviço, não em concorrência real.
- Sem recuperação de senha por e-mail (a redefinição é feita por um administrador).
