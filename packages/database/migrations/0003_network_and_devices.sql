-- 0003: setores, ativos de rede, dispositivos, credenciais e janelas de manutenção.
-- Geometrias usam SRID 4326 (WGS 84, longitude/latitude).

CREATE TABLE sectors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations (id),
  code             text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 50),
  name             text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  description      text,
  geometry         geometry(MultiPolygon, 4326),
  -- Horários de abastecimento configurados: array de {daysOfWeek, start, end}. Vazio = "não configurado"
  -- (o sistema não presume abastecimento contínuo nem linha de base).
  supply_schedule  jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(supply_schedule) = 'array'),
  -- Cadastros de demonstração são explicitamente fictícios.
  is_fictional     boolean NOT NULL DEFAULT false,
  archived_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sectors_org_id_uniq UNIQUE (organization_id, id)
);
CREATE UNIQUE INDEX sectors_org_code_uidx ON sectors (organization_id, code) WHERE archived_at IS NULL;
CREATE INDEX sectors_geometry_gix ON sectors USING gist (geometry);
CREATE TRIGGER sectors_set_updated_at BEFORE UPDATE ON sectors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE network_assets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations (id),
  sector_id        uuid,
  kind             text NOT NULL CHECK (kind IN ('PIPE', 'VALVE', 'HYDRANT', 'RESERVOIR', 'PUMP_STATION', 'METER_POINT', 'OTHER')),
  code             text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 50),
  name             text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  geometry         geometry(Geometry, 4326) NOT NULL
                   CHECK (GeometryType(geometry) IN ('POINT', 'LINESTRING', 'MULTILINESTRING')),
  properties       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(properties) = 'object'),
  status           text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  is_fictional     boolean NOT NULL DEFAULT false,
  archived_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT network_assets_org_id_uniq UNIQUE (organization_id, id),
  CONSTRAINT network_assets_sector_fk FOREIGN KEY (organization_id, sector_id) REFERENCES sectors (organization_id, id)
);
CREATE UNIQUE INDEX network_assets_org_code_uidx ON network_assets (organization_id, code) WHERE archived_at IS NULL;
CREATE INDEX network_assets_sector_idx ON network_assets (organization_id, sector_id);
CREATE INDEX network_assets_geometry_gix ON network_assets USING gist (geometry);
CREATE TRIGGER network_assets_set_updated_at BEFORE UPDATE ON network_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE devices (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id            uuid NOT NULL REFERENCES organizations (id),
  sector_id                  uuid,
  asset_id                   uuid,
  code                       text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 100),
  name                       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  kind                       text NOT NULL CHECK (kind IN ('PRESSURE_SENSOR', 'FLOW_METER', 'MULTI_SENSOR')),
  -- Métricas que o dispositivo pode reportar. Pressão em mca e vazão em m3/h (padrão do MVP).
  metrics                    text[] NOT NULL CHECK (cardinality(metrics) > 0 AND metrics <@ ARRAY['PRESSURE', 'FLOW']),
  location                   geometry(Point, 4326),
  -- Faixa física do instrumento (leituras fora dela são marcadas como qualidade ruim).
  range_pressure_min         double precision,
  range_pressure_max         double precision,
  range_flow_min             double precision,
  range_flow_max             double precision,
  -- Intervalo esperado entre mensagens; base da regra de ausência de comunicação.
  expected_interval_seconds  integer NOT NULL DEFAULT 300 CHECK (expected_interval_seconds > 0),
  status                     text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  last_measurement_at        timestamptz,
  last_received_at           timestamptz,
  is_fictional               boolean NOT NULL DEFAULT false,
  archived_at                timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT devices_org_id_uniq UNIQUE (organization_id, id),
  CONSTRAINT devices_sector_fk FOREIGN KEY (organization_id, sector_id) REFERENCES sectors (organization_id, id),
  CONSTRAINT devices_asset_fk FOREIGN KEY (organization_id, asset_id) REFERENCES network_assets (organization_id, id),
  CONSTRAINT devices_kind_metrics_consistent CHECK (
    (kind = 'PRESSURE_SENSOR' AND metrics = ARRAY['PRESSURE']) OR
    (kind = 'FLOW_METER' AND metrics = ARRAY['FLOW']) OR
    kind = 'MULTI_SENSOR'
  ),
  CONSTRAINT devices_pressure_range_required CHECK (
    NOT ('PRESSURE' = ANY (metrics)) OR (range_pressure_min IS NOT NULL AND range_pressure_max IS NOT NULL AND range_pressure_max > range_pressure_min)
  ),
  CONSTRAINT devices_flow_range_required CHECK (
    NOT ('FLOW' = ANY (metrics)) OR (range_flow_min IS NOT NULL AND range_flow_max IS NOT NULL AND range_flow_max > range_flow_min)
  )
);
CREATE UNIQUE INDEX devices_org_code_uidx ON devices (organization_id, code) WHERE archived_at IS NULL;
CREATE INDEX devices_sector_idx ON devices (organization_id, sector_id) WHERE archived_at IS NULL;
CREATE INDEX devices_status_idx ON devices (organization_id, status, last_received_at);
CREATE INDEX devices_location_gix ON devices USING gist (location);
CREATE TRIGGER devices_set_updated_at BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE device_credentials (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  device_id        uuid NOT NULL,
  -- SHA-256 (hex) de um segredo aleatório de 256 bits. Argon2 seria custoso por requisição de
  -- ingestão e desnecessário para segredos de alta entropia. O segredo em claro é exibido uma vez.
  secret_hash      text NOT NULL CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
  label            text,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz,
  revoked_at       timestamptz,
  last_used_at     timestamptz,
  CONSTRAINT device_credentials_device_fk FOREIGN KEY (organization_id, device_id) REFERENCES devices (organization_id, id),
  CONSTRAINT device_credentials_creator_fk FOREIGN KEY (organization_id, created_by) REFERENCES users (organization_id, id)
);
CREATE INDEX device_credentials_device_active_idx ON device_credentials (device_id) WHERE revoked_at IS NULL;

CREATE TABLE maintenance_windows (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations (id),
  sector_id        uuid,
  device_id        uuid,
  reason           text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  created_by       uuid,
  cancelled_at     timestamptz,
  archived_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_windows_org_id_uniq UNIQUE (organization_id, id),
  CONSTRAINT maintenance_windows_period CHECK (ends_at > starts_at),
  CONSTRAINT maintenance_windows_scope CHECK (sector_id IS NOT NULL OR device_id IS NOT NULL),
  CONSTRAINT maintenance_windows_sector_fk FOREIGN KEY (organization_id, sector_id) REFERENCES sectors (organization_id, id),
  CONSTRAINT maintenance_windows_device_fk FOREIGN KEY (organization_id, device_id) REFERENCES devices (organization_id, id),
  CONSTRAINT maintenance_windows_creator_fk FOREIGN KEY (organization_id, created_by) REFERENCES users (organization_id, id)
);
CREATE INDEX maintenance_windows_period_idx ON maintenance_windows (organization_id, starts_at, ends_at) WHERE cancelled_at IS NULL;
CREATE INDEX maintenance_windows_sector_idx ON maintenance_windows (organization_id, sector_id);
CREATE INDEX maintenance_windows_device_idx ON maintenance_windows (organization_id, device_id);
CREATE TRIGGER maintenance_windows_set_updated_at BEFORE UPDATE ON maintenance_windows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
