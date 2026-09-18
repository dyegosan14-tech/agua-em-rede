# Segurança (etapa 1)

| Controle | Implementação | Teste |
|---|---|---|
| Senhas | Argon2id (19 MiB, t=2, p=1); produção recusa parâmetros menores; rehash oportunista | `users.int`, `config` |
| Sessão | Token opaco de 256 bits; só o SHA-256 é persistido; cookie HttpOnly, `SameSite=Strict`, `Secure` + `__Host-` em produção | `auth.int` |
| Expiração/revogação | Absoluta 12 h, inatividade 120 min (configuráveis); logout, troca de senha, desativação e mudança de perfil revogam | `auth.int`, `users.int` |
| CSRF | HMAC(segredo, id da sessão) no cabeçalho `x-csrf-token` + verificação de `Origin` | `auth.int`, `permissions.int` |
| Enumeração de contas | Resposta idêntica para usuário inexistente, senha errada e conta desativada; verificação Argon2 fictícia equaliza o tempo | `auth.int` |
| Rate limit | Login por IP e por IP+e-mail (impressão digital do e-mail, nunca o e-mail); troca de senha por usuário | `auth.int`, `unit` |
| Autorização | Matriz em `@aer/domain`; verificada antes da validação do corpo | `permissions.int` |
| Isolamento | `organizationId` só da sessão; FKs compostas; recurso de outra organização = 404 | `isolation.int`, `database.int` |
| Auditoria | Append-only (trigger), metadados sanitizados, ação e registro na mesma transação | `users.int`, `unit` |
| Logs | Pino com `redact`, serializadores sem cabeçalhos/corpo; request ID validado | `unit` |
| Cabeçalhos/CORS | Helmet (CSP restritiva, HSTS em produção), CORS por lista explícita, `Cache-Control: no-store` na API | `platform.int` |
| Configuração | Validação Zod na inicialização; não ecoa valores; rejeita marcadores de exemplo; sem senha padrão | `config` |
| Segredos | Somente variáveis de ambiente; `.env` ignorado no Git; `.env.example` só com marcadores | — |

## Limitações conhecidas

- Sem MFA e sem recuperação de senha por e-mail.
- O limite de login por IP depende de `TRUST_PROXY` correto atrás de proxy reverso.
- Upload de fotos, buckets privados e URLs autorizadas ainda não existem (etapa 5).
- Não foi feita revisão de segurança independente nem teste de intrusão.
