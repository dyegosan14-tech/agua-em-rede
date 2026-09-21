# Água em Rede — Roteiro de Demonstração e Pitch do Piloto (Recife)

Plataforma integrada de telemetria, detecção de anomalias e gestão operacional de perdas físicas de água tratada para concessionárias de saneamento.

---

## 🎯 1. Proposta de Valor e o Desafio da Redução de Perdas

- **O Problema**: No Brasil, as perdas na distribuição de água tratada ultrapassam 37% em média, causadas por rompimentos de tubulações não visíveis, vazamentos em ramais prediais, pressões desreguladas e falhas de comunicação de sensores em campo.
- **A Solução**: O **Água em Rede** unifica o ciclo completo de monitoramento e resposta rápida:
  1. **Georreferenciamento de Alta Precisão (GIS / PostGIS)**: Polígonos de bacias de pressão e nós de sensores na Região Metropolitana do Recife.
  2. **Ingestão Direta IoT com Segurança Criptográfica**: Sensores e medidores transmitem dados protegidos por chaves de 256 bits (`X-Device-Key`).
  3. **Detecção Antecipada & Redução do Tempo de Resposta (MTTR)**: Alertas automáticos acionam equipes de campo antes que pequenos vazamentos se tornem grandes rompimentos.
  4. **PWA Operacional de Campo**: Técnicos utilizam smartphones/tablets offline para receber ordens de serviço, registrar fotos das tubulações sanadas e mensurar o volume recuperado.
  5. **Contabilização da Meta de 30%**: Painel executivo consolidando água poupada ($m^3$), economia financeira estimada ($R\$$) e índice de redução de perdas.

---

## 🏛️ 2. Destaques de Arquitetura e Engenharia de Software

| Componente | Tecnologia | Decisão Técnica & Diferencial |
|---|---|---|
| **API & Backend** | Fastify + TypeScript (Node 22) | Alta vazão, injeção de dependências modular, validação em tempo de compilação e execução via Zod. |
| **Banco de Dados** | PostgreSQL 17 + PostGIS (SRID 4326) | Armazenamento de geometrias espaciais reais, isolamento multitenant estrito por FKs compostas `(organization_id, id)`. |
| **Processamento Assíncrono** | BullMQ + Redis (AOF) | Fila de mensageria com tolerância a falhas, backoff exponencial e persistência append-only. |
| **Segurança & Criptografia** | Argon2id + SHA-256 + HMAC CSRF | Senhas com hash Argon2id; sessões e chaves IoT mantêm apenas hash SHA-256 no banco; cookies `HttpOnly` com `SameSite=Strict`. |
| **Frontend & PWA** | React 19 + Vite + Leaflet + Tailwind | Interface rica com mapa interativo, gráficos SVG de curvas de pressão/vazão e Service Worker com Web App Manifest para técnicos em campo. |
| **Qualidade & CI/CD** | Vitest + ESLint Estrito + GitHub Actions | 148 testes automatizados (unitários, integração e E2E completo), 0 erros de lint e pipeline automatizada no GitHub. |

---

## 🎬 3. Roteiro de Demonstração Passo a Passo (Live Demo)

### Passo 1: Acesso e Perfis de Usuário
- Abra `http://localhost:5173`.
- Acesse com a conta de **Administrador/Operador**:
  - **E-mail**: `admin@demo.aguaemrede.test`
  - **Senha**: senha configurada no seed (`SEED_PASSWORD` ou senha impressa no console).
- Destaque a proteção contra múltiplos perfis (RBAC: Administrador, Operador, Técnico, Visualizador).

### Passo 2: O Mapa Georreferenciado da Rede (GIS)
- Navegue para **Mapa da Rede** (`/mapa`):
  - Mostre os polígonos dos setores de abastecimento do Recife (ex.: *Centro Histórico*, *Boa Viagem*, *Casa Forte*).
  - Clique nos marcadores de sensores de pressão e medidores de vazão para exibir o popup com última medição, faixas operacionais e status de comunicação.
  - Utilize os filtros rápidos para isolar setores ou tipos de equipamento.

### Passo 3: Gráficos de Telemetria & Chaves de Ingestão IoT
- Acesse **Dispositivos**:
  - Clique em **Detalhes** em qualquer sensor para abrir as abas modais:
    - **Gráfico de Séries Temporais**: Demonstre a curva temporal de pressão (mca) com linhas de referência mín/máx e marcadores em anomalias.
    - **Credenciais IoT**: Demonstre o botão "Gerar Nova Chave IoT". Uma chave de 256 bits é gerada na hora, com comando `curl` pronto para cópia que permite simular transmissões diretas do hardware de campo para o endpoint `/api/telemetry/device-ingest`.

### Passo 4: Alertas Inteligentes & Janelas de Manutenção Preventiva
- Mostre a tela de **Alertas**:
  - Alertas automáticos abertos por rompimento de rede (`LOW_PRESSURE`, `FLOW_UP_PRESSURE_DOWN`) e por perda de comunicação (`NO_COMMUNICATION`).
- Mostre a tela de **Setores**:
  - Abra um setor e mostre a seção **Manutenção Programada**. Demonstre como um operador pode agendar uma janela preventiva de manobra de registros para silenciar alarmes falsos durante reparos planejados.

### Passo 5: O Trabalho do Técnico em Campo (PWA e Fotos de Evidência)
- Acesse com o perfil de **Técnico de Campo** (`tecnico@demo.aguaemrede.test`):
  - Navegue para **Ordens de Serviço**:
  - Abra uma ordem e acerte o status para "Em Andamento".
  - Clique na aba **Evidências Fotográficas**:
    - Mostre o botão "Capturar / Enviar Foto", integrado à câmera de smartphones.
    - Selecione uma foto da escavação ou do reparo da junta da tubulação. A imagem é exibida com miniatura, tamanho e persistida com hash SHA-256 de integridade.
  - Conclua a ordem selecionando diagnóstico **Vazamento Confirmado & Sanado** e informe o volume de água recuperado (ex.: $450\text{ m}^3$).

### Passo 6: Indicadores de Redução de Perdas (Meta de 30%)
- Retorne ao **Dashboard** e tela de **Indicadores**:
  - O alerta correspondente foi automaticamente resolvido pela conclusão da ordem de serviço.
  - O volume de água tratada economizado foi somado ao acumulador da organização.
  - A economia financeira estimada ($R\$$) e o percentual de redução de perdas refletem a eficácia do programa piloto.

---

## 🚀 4. Como Executar Todo o Ambiente com Docker

```bash
# Sobe banco PostGIS, Redis, MinIO, API, Worker e Web com 1 comando:
docker compose -f docker-compose.prod.yml up --build
```
Acesse no navegador: `http://localhost`.
