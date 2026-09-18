# Arquitetura

## Diagrama

```
 navegador / campo ──► apps/web (React, Vite; proxy /api em dev)
                              │  mesma origem, cookie HttpOnly + x-csrf-token
                              ▼
 dispositivos ─(etapa 3)─► apps/api (Fastify) ── enfileira (etapa 3+) ──► Redis/BullMQ ──► apps/worker
                              │  auth · organizations · users · audit · health          │
                              └──────────────┬─────────────────────────────────────────┘
                                             ▼
        packages/domain (puro) · contracts (Zod) · database (Drizzle + SQL) · config (env)
                                             ▼
                          PostgreSQL + PostGIS        MinIO (S3, privado — etapa 5)
```

Monólito modular: API e worker são processos separados que compartilham os pacotes de domínio.

## Decisões

| Decisão | Motivo |
|---|---|
| Pacotes internos exportam TypeScript-fonte | Vite, Vitest e tsx consomem direto; `tsup` empacota apps só no build de produção. Dependências de runtime dos pacotes internos são declaradas nas apps (ficam externas). |
| Migrations SQL escritas à mão + migrator próprio | PostGIS, índices parciais, checks, triggers e FKs compostas ficam explícitos. O migrator usa lock consultivo, uma transação por migration e checksum (editar migration aplicada é erro). |
| Drizzle só para consultas tipadas | Um teste de integração compara colunas/nulabilidade do schema Drizzle com o banco real. |
| FK composta `(organization_id, x_id)` | O PostgreSQL impede referência entre organizações, além da validação na aplicação. |
| Sem `ON DELETE CASCADE`, com `archived_at` | Preserva histórico operacional. Tabelas de eventos e auditoria são append-only por trigger. |
| Enumerações como `text` + `CHECK` | Evolução por migration, sem `ALTER TYPE`. Valores vivem em `@aer/domain`. |
| Credencial de dispositivo = segredo de 256 bits com SHA-256 | Argon2 por requisição de ingestão seria custoso e desnecessário para segredo de alta entropia. |
| Argon2id via `@node-rs/argon2` | Binários pré-compilados (o pacote `argon2` exigiria compilador C++). |
| Sessão com hash SHA-256 no banco | Vazamento do banco não entrega sessões utilizáveis. |
| Autenticação e CSRF em `preValidation` | Evita revelar detalhes de validação a quem não está autenticado (achado durante a verificação). |

## Persistência e recuperação de falhas

- **API**: sem estado local. Sessões, auditoria e dados estão no PostgreSQL; reiniciar a API não derruba sessões. Encerramento gracioso
  (`SIGTERM`) para de aceitar conexões e aguarda as requisições em andamento. Escritas relevantes e o registro de auditoria ocorrem na
  **mesma transação**.
- **Rate limit**: contador em Redis (script Lua atômico `INCR`+`PEXPIRE`). Redis fora do ar ⇒ degradação para limitador em memória (por
  instância), com log de aviso; nunca "sem limite".
- **Readiness** (`/health/ready`) exige o banco e, se configurado, o Redis; **liveness** não toca dependências.
- **Worker**: jobs com até 5 tentativas e backoff exponencial (5 s → 40 s); jobs esgotados permanecem 7 dias (até 1000) no Redis para
  diagnóstico; job desconhecido é `UnrecoverableError`. O agendamento usa `upsertJobScheduler` (idempotente com vários workers). O Redis roda
  com AOF, então jobs enfileirados sobrevivem a reinícios. `purge-stale-sessions` é idempotente: reexecutar não causa dano.
- **Ingestão de telemetria (etapa 3)**: o princípio adotado é *receber ≠ processar* — o lote será gravado como `RECEIVED` antes de qualquer
  processamento e só passa a `PROCESSED` depois que o worker termina; falhas deixam o lote reprocessável. **Ainda não implementado.**

## Modelo de dados

Ver `packages/database/migrations/`. Convenções: UUID, `timestamptz` em UTC, geometrias `geometry(Tipo, 4326)`, índices por
organização/dispositivo/setor/status/data, `origin` (`REAL`/`SIMULATED`) com `simulation_run_id` obrigatório se, e somente se, simulado.
