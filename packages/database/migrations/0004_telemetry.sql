-- 0004: execuções de simulação e medições.

CREATE TABLE simulation_runs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES organizations (id),
  scenario                text NOT NULL CHECK (scenario IN (
    'NORMAL_OPERATION', 'GRADUAL_FLOW_INCREASE', 'PRESSURE_DROP', 'COMBINED_EVENT',
    'SENSOR_OFFLINE', 'INVALID_VALUES', 'SCHEDULED_MAINTENANCE', 'POST_INTERVENTION_NORMALIZATION'
  )),
  seed                    bigint NOT NULL,
  status                  text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
  sector_id               uuid,
  params                  jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(params) = 'object'),
  started_at              timestamptz,
  finished_at             timestamptz,
  measurements_generated  integer NOT NULL DEFAULT 0 CHECK (measurements_generated >= 0),
  error                   text,
  created_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT simulation_runs_org_id_uniq UNIQUE (organization_id, id),
  CONSTRAINT simulation_runs_sector_fk FOREIGN KEY (organization_id, sector_id) REFERENCES sectors (organization_id, id),
  CONSTRAINT simulation_runs_creator_fk FOREIGN KEY (organization_id, created_by) REFERENCES users (organization_id, id)
);
CREATE INDEX simulation_runs_org_created_idx ON simulation_runs (organization_id, created_at DESC);
CREATE TRIGGER simulation_runs_set_updated_at BEFORE UPDATE ON simulation_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Cada linha é UMA leitura (uma métrica). Unidades padronizadas: pressão em mca, vazão em m3/h.
CREATE TABLE measurements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL,
  device_id          uuid NOT NULL,
  -- Setor do dispositivo NO MOMENTO do recebimento (fotografia); não muda se o dispositivo for movido depois.
  sector_id          uuid,
  -- Identificador do evento atribuído pelo dispositivo; base da idempotência.
  external_event_id  text NOT NULL CHECK (length(external_event_id) BETWEEN 1 AND 128),
  metric             text NOT NULL CHECK (metric IN ('PRESSURE', 'FLOW')),
  value              double precision NOT NULL CHECK (value BETWEEN -1e15 AND 1e15),
  unit               text NOT NULL,
  -- Qualidade do DADO (independente do estado hidráulico): GOOD, SUSPECT ou BAD.
  quality            text NOT NULL CHECK (quality IN ('GOOD', 'SUSPECT', 'BAD')),
  quality_flags      text[] NOT NULL DEFAULT '{}',
  measured_at        timestamptz NOT NULL,
  received_at        timestamptz NOT NULL DEFAULT now(),
  origin             text NOT NULL CHECK (origin IN ('REAL', 'SIMULATED')),
  simulation_run_id  uuid,
  CONSTRAINT measurements_device_fk FOREIGN KEY (organization_id, device_id) REFERENCES devices (organization_id, id),
  CONSTRAINT measurements_sector_fk FOREIGN KEY (organization_id, sector_id) REFERENCES sectors (organization_id, id),
  CONSTRAINT measurements_simulation_fk FOREIGN KEY (organization_id, simulation_run_id) REFERENCES simulation_runs (organization_id, id),
  CONSTRAINT measurements_origin_simulation_consistent CHECK ((origin = 'SIMULATED') = (simulation_run_id IS NOT NULL)),
  CONSTRAINT measurements_metric_unit_consistent CHECK (
    (metric = 'PRESSURE' AND unit = 'mca') OR (metric = 'FLOW' AND unit = 'm3/h')
  ),
  CONSTRAINT measurements_device_event_uniq UNIQUE (device_id, external_event_id)
);
CREATE INDEX measurements_device_metric_time_idx ON measurements (organization_id, device_id, metric, measured_at DESC);
CREATE INDEX measurements_sector_metric_time_idx ON measurements (organization_id, sector_id, metric, measured_at DESC)
  WHERE sector_id IS NOT NULL;
CREATE INDEX measurements_origin_time_idx ON measurements (organization_id, origin, measured_at DESC);
CREATE INDEX measurements_received_idx ON measurements (organization_id, received_at);
CREATE INDEX measurements_simulation_idx ON measurements (simulation_run_id) WHERE simulation_run_id IS NOT NULL;
