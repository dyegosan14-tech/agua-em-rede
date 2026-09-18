# Água em Rede

Plataforma para monitoramento de pressão e vazão e gestão da redução de perdas na distribuição de água (MVP para piloto em Recife).

> **A meta de reduzir 30% das perdas é uma hipótese a validar no piloto, não uma garantia do software.**
> O sistema não afirma que toda anomalia é vazamento, não classifica ligações clandestinas, não promete localização exata
> de vazamentos, não mistura dados simulados com reais e não comanda válvulas nem bombas.

## Estado do projeto: etapa 1 de 6

| Etapa | Escopo | Situação |
|---|---|---|
| 1 | Estrutura, infraestrutura, banco e autenticação | **Implementada** (este commit) |
| 2 | Setores, dispositivos e mapa | Não iniciada |
| 3 | Ingestão de telemetria e simulador | Não iniciada |
| 4 | Regras e alertas | Não iniciada |
| 5 | Ordens de serviço e aplicação de campo (PWA) | Não iniciada |
| 6 | Indicadores, E2E e documentação final | Não iniciada |

### O que existe na etapa 1

- Monorepo (npm workspaces): `apps/{api,worker,web}`, `packages/{config,contracts,domain,database}`.
- **Banco**: 6 migrations SQL explícitas (PostGIS, SRID 4326) com **todas** as entidades do modelo de dados
  (organizações, usuários, sessões, setores, ativos, dispositivos, credenciais, medições, regras, alertas, ordens, anexos,
  janelas de manutenção, auditoria, simulações). Só as de identidade/auditoria são usadas pela aplicação por enquanto.
- **Autenticação**: sessão no servidor, token opaco (só o SHA-256 vai ao banco), cookie HttpOnly/SameSite=Strict
  (`Secure` + prefixo `__Host-` em produção), Argon2id, CSRF (HMAC por sessão + verificação de `Origin`), expiração
  absoluta (12 h) e por inatividade (120 min), revogação, rate limit de login (Redis, com degradação para memória).
- **Autorização** por perfil (ADMIN, OPERATOR, TECHNICIAN, VIEWER) e isolamento por organização (também no banco, via FKs compostas).
- **Módulos da API**: `auth`, `organizations`, `users`, `audit`, `health`. OpenAPI em `/api/docs` (dev) e `docs/api/openapi.json`.
- **Worker** (BullMQ): job de manutenção `purge-stale-sessions`, com tentativas limitadas e backoff.
- **Web**: login, shell (menu lateral no desktop, barra inferior no celular), início, usuários (CRUD, filtros, paginação),
  minha conta (troca de senha), banner "Ambiente demonstrativo — dados simulados", estados de carregando/erro/vazio/offline/
  dados desatualizados/sem permissão. Horários em America/Recife.

**Não existe ainda**: mapa, telemetria, simulador, regras, alertas, ordens de serviço, aplicação de campo/PWA, indicadores,
upload de fotos, testes E2E oficiais. A tela inicial diz isso explicitamente.

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
