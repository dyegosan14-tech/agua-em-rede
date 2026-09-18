-- 0002: organizações, usuários, sessões e auditoria.
-- Convenções (valem para todas as migrations):
--  * UUIDs (gen_random_uuid) e timestamptz (UTC); conversão de fuso é responsabilidade da interface.
--  * Toda tabela de negócio tem organization_id e UNIQUE (organization_id, id), para que relações
--    usem FK composta (organization_id, x_id) e o banco impeça referências entre organizações.
--  * Sem ON DELETE CASCADE: o histórico operacional é preservado; itens saem de uso via archived_at.
--  * Enumerações são text + CHECK (evolução por migration, sem ALTER TYPE).

CREATE TABLE organizations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  slug         text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_demo      boolean NOT NULL DEFAULT false,
  timezone     text NOT NULL DEFAULT 'America/Recife',
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX organizations_slug_uidx ON organizations (slug);
CREATE TRIGGER organizations_set_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations (id),
  email                 text NOT NULL CHECK (email = lower(email) AND position('@' IN email) > 1),
  name                  text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  role                  text NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR', 'TECHNICIAN', 'VIEWER')),
  password_hash         text NOT NULL,
  password_changed_at   timestamptz NOT NULL DEFAULT now(),
  is_active             boolean NOT NULL DEFAULT true,
  last_login_at         timestamptz,
  archived_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_org_id_uniq UNIQUE (organization_id, id)
);
-- O login é por e-mail (sem informar organização): o e-mail é único globalmente, inclusive entre arquivados.
CREATE UNIQUE INDEX users_email_uidx ON users (email);
CREATE INDEX users_org_role_idx ON users (organization_id, role) WHERE archived_at IS NULL;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  user_id          uuid NOT NULL,
  -- SHA-256 (hex) do token opaco; o token em si nunca é persistido.
  token_hash       text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  ip               text,
  user_agent       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  revoked_at       timestamptz,
  revoked_reason   text CHECK (revoked_reason IN ('LOGOUT', 'ADMIN_REVOKED', 'PASSWORD_CHANGED', 'USER_DEACTIVATED', 'ROLE_CHANGED')),
  CONSTRAINT sessions_user_fk FOREIGN KEY (organization_id, user_id) REFERENCES users (organization_id, id),
  CONSTRAINT sessions_revocation_consistent CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL)),
  CONSTRAINT sessions_expiry_after_creation CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX sessions_token_hash_uidx ON sessions (token_hash);
CREATE INDEX sessions_user_active_idx ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE audit_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nulo apenas para eventos anteriores à identificação (ex.: login com e-mail inexistente).
  organization_id  uuid REFERENCES organizations (id),
  actor_user_id    uuid,
  action           text NOT NULL CHECK (length(action) BETWEEN 1 AND 100),
  entity_type      text,
  entity_id        text,
  request_id       text,
  ip               text,
  user_agent       text,
  -- Somente metadados sanitizados (nunca senhas, tokens ou cookies).
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_actor_fk FOREIGN KEY (organization_id, actor_user_id) REFERENCES users (organization_id, id)
);
CREATE INDEX audit_logs_org_created_idx ON audit_logs (organization_id, created_at DESC, id DESC);
CREATE INDEX audit_logs_org_action_idx ON audit_logs (organization_id, action, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (organization_id, entity_type, entity_id);
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
