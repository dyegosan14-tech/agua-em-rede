-- 0005: regras de detecção, alertas e histórico de transições.

CREATE TABLE detection_rules (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES organizations (id),
  name                     text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  description              text,
  kind                     text NOT NULL CHECK (kind IN (
    'LOW_PRESSURE', 'HIGH_FLOW', 'FLOW_UP_PRESSURE_DOWN', 'NO_COMMUNICATION', 'OUT_OF_PHYSICAL_RANGE'
  )),
  scope_type               text NOT NULL CHECK (scope_type IN ('ORGANIZATION', 'SECTOR', 'DEVICE')),
  sector_id                uuid,
  device_id                uuid,
  -- Limites e parâmetros específicos por tipo (limiar, limiar de recuperação, dispositivos comparáveis...).
  -- Validados por esquema Zod na API, por tipo de regra.
  params                   jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(params) = 'object'),
  window_seconds           integer NOT NULL CHECK (window_seconds > 0),
  min_duration_seconds     integer NOT NULL CHECK (min_duration_seconds >= 0),
  -- Fração mínima de leituras esperadas na janela; abaixo disso a regra NÃO dispara (dados insuficientes).
  min_coverage_ratio       numeric(4, 3) NOT NULL CHECK (min_coverage_ratio > 0 AND min_coverage_ratio <= 1),
  severity                 text NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  -- Após um alerta ser resolvido/descartado, novos disparos idênticos são suprimidos por este intervalo.
  suppression_seconds      integer NOT NULL DEFAULT 3600 CHECK (suppression_seconds >= 0),
  -- Histerese: tempo contínuo em condição normal exigido para considerar o alerta recuperado.
  recovery_seconds         integer NOT NULL DEFAULT 600 CHECK (recovery_seconds >= 0),
  respect_supply_schedule  boolean NOT NULL DEFAULT true,
  respect_maintenance      boolean NOT NULL DEFAULT true,
  is_enabled               boolean NOT NULL DEFAULT true,
  created_by               uuid,
  archived_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT detection_rules_org_id_uniq UNIQUE (organization_id, id),
  CONSTRAINT detection_rules_sector_fk FOREIGN KEY (organization_id, sector_id) REFERENCES sectors (organization_id, id),
  CONSTRAINT detection_rules_device_fk FOREIGN KEY (organization_id, device_id) REFERENCES devices (organization_id, id),
  CONSTRAINT detection_rules_creator_fk FOREIGN KEY (organization_id, created_by) REFERENCES users (organization_id, id),
  CONSTRAINT detection_rules_duration_within_window CHECK (min_duration_seconds <= window_seconds),
  CONSTRAINT detection_rules_scope_consistent CHECK (
    (scope_type = 'ORGANIZATION' AND sector_id IS NULL AND device_id IS NULL) OR
    (scope_type = 'SECTOR' AND sector_id IS NOT NULL AND device_id IS NULL) OR
    (scope_type = 'DEVICE' AND device_id IS NOT NULL)
  )
);
CREATE INDEX detection_rules_active_idx ON detection_rules (organization_id, kind) WHERE is_enabled AND archived_at IS NULL;
CREATE INDEX detection_rules_sector_idx ON detection_rules (organization_id, sector_id);
CREATE INDEX detection_rules_device_idx ON detection_rules (organization_id, device_id);
CREATE TRIGGER detection_rules_set_updated_at BEFORE UPDATE ON detection_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE alerts (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL,
  rule_id                     uuid NOT NULL,
  sector_id                   uuid,
  device_id                   uuid,
  -- Chave de deduplicação: mesma regra + mesmo alvo => um único alerta ativo por vez.
  dedup_key                   text NOT NULL CHECK (length(dedup_key) BETWEEN 1 AND 300),
  status                      text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED', 'DISMISSED')),
  severity                    text NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  title                       text NOT NULL,
  priority_score              integer NOT NULL DEFAULT 0,
  -- Regra acionada, janela analisada, leituras usadas, qualidade/cobertura, motivo da prioridade e ação sugerida.
  evidence                    jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  occurrences                 integer NOT NULL DEFAULT 1 CHECK (occurrences >= 1),
  first_detected_at           timestamptz NOT NULL,
  last_detected_at            timestamptz NOT NULL,
  -- A condição voltou ao normal pelo tempo de histerese; NÃO resolve o alerta sozinho (decisão humana).
  recovery_observed_at        timestamptz,
  acknowledged_at             timestamptz,
  acknowledged_by             uuid,
  investigation_started_at    timestamptz,
  resolved_at                 timestamptz,
  resolved_by                 uuid,
  dismissed_at                timestamptz,
  dismissed_by                uuid,
  dismissal_reason            text,
  origin                      text NOT NULL CHECK (origin IN ('REAL', 'SIMULATED')),
  simulation_run_id           uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alerts_org_id_uniq UNIQUE (organization_id, id),
  CONSTRAINT alerts_organization_fk FOREIGN KEY (organization_id) REFERENCES organizations (id),
  CONSTRAINT alerts_rule_fk FOREIGN KEY (organization_id, rule_id) REFERENCES detection_rules (organization_id, id),
  CONSTRAINT alerts_sector_fk FOREIGN KEY (organization_id, sector_id) REFERENCES sectors (organization_id, id),
  CONSTRAINT alerts_device_fk FOREIGN KEY (organization_id, device_id) REFERENCES devices (organization_id, id),
  CONSTRAINT alerts_ack_user_fk FOREIGN KEY (organization_id, acknowledged_by) REFERENCES users (organization_id, id),
  CONSTRAINT alerts_resolved_user_fk FOREIGN KEY (organization_id, resolved_by) REFERENCES users (organization_id, id),
  CONSTRAINT alerts_dismissed_user_fk FOREIGN KEY (organization_id, dismissed_by) REFERENCES users (organization_id, id),
  CONSTRAINT alerts_simulation_fk FOREIGN KEY (organization_id, simulation_run_id) REFERENCES simulation_runs (organization_id, id),
  CONSTRAINT alerts_origin_simulation_consistent CHECK ((origin = 'SIMULATED') = (simulation_run_id IS NOT NULL)),
  CONSTRAINT alerts_dismissal_requires_reason CHECK (
    status <> 'DISMISSED' OR (dismissal_reason IS NOT NULL AND length(btrim(dismissal_reason)) >= 5)
  )
);
-- Deduplicação no banco: no máximo um alerta ATIVO por (organização, chave).
CREATE UNIQUE INDEX alerts_active_dedup_uidx ON alerts (organization_id, dedup_key)
  WHERE status IN ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING');
CREATE INDEX alerts_status_idx ON alerts (organization_id, status, severity, last_detected_at DESC);
CREATE INDEX alerts_sector_idx ON alerts (organization_id, sector_id, first_detected_at DESC);
CREATE INDEX alerts_device_idx ON alerts (organization_id, device_id, first_detected_at DESC);
CREATE INDEX alerts_rule_idx ON alerts (organization_id, rule_id);
CREATE INDEX alerts_origin_idx ON alerts (organization_id, origin, first_detected_at DESC);
CREATE TRIGGER alerts_set_updated_at BEFORE UPDATE ON alerts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE alert_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  alert_id         uuid NOT NULL,
  event_type       text NOT NULL CHECK (event_type IN (
    'DETECTED', 'RETRIGGERED', 'STATUS_CHANGED', 'RECOVERY_OBSERVED', 'NOTE', 'WORK_ORDER_LINKED'
  )),
  from_status      text,
  to_status        text,
  actor_user_id    uuid,
  note             text,
  data             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alert_events_alert_fk FOREIGN KEY (organization_id, alert_id) REFERENCES alerts (organization_id, id),
  CONSTRAINT alert_events_actor_fk FOREIGN KEY (organization_id, actor_user_id) REFERENCES users (organization_id, id)
);
CREATE INDEX alert_events_alert_idx ON alert_events (organization_id, alert_id, created_at);
CREATE TRIGGER alert_events_append_only BEFORE UPDATE OR DELETE ON alert_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
