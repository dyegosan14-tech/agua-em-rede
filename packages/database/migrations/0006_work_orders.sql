-- 0006: ordens de serviço, histórico e anexos.

CREATE TABLE work_orders (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL,
  -- Número legível sequencial (exibido como OS-000123).
  number                    bigint GENERATED ALWAYS AS IDENTITY,
  alert_id                  uuid,
  sector_id                 uuid,
  asset_id                  uuid,
  device_id                 uuid,
  title                     text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description               text,
  priority                  text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  status                    text NOT NULL DEFAULT 'OPEN' CHECK (status IN (
    'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_RESOURCES', 'COMPLETED', 'CANCELLED'
  )),
  assigned_to               uuid,
  created_by                uuid NOT NULL,
  due_at                    timestamptz,
  assigned_at               timestamptz,
  inspection_started_at     timestamptz,
  completed_at              timestamptz,
  cancelled_at              timestamptz,
  cancellation_reason       text,
  -- Diagnóstico de campo. "LEAK_CONFIRMED" (vazamento confirmado em campo) é distinto de anomalia detectada.
  diagnosis                 text CHECK (diagnosis IN (
    'LEAK_CONFIRMED', 'LEAK_NOT_FOUND', 'SENSOR_OR_COMMS_FAULT', 'OPERATIONAL_CAUSE', 'INCONCLUSIVE', 'OTHER'
  )),
  inspection_notes          text,
  repair_notes              text,
  repaired_at               timestamptz,
  location                  geometry(Point, 4326),
  location_accuracy_m       real CHECK (location_accuracy_m IS NULL OR location_accuracy_m >= 0),
  -- Estimativa manual e opcional. NÃO é economia validada.
  estimated_volume_m3       numeric(12, 3) CHECK (estimated_volume_m3 IS NULL OR estimated_volume_m3 >= 0),
  -- Controle otimista de concorrência: base da detecção de conflitos na sincronização offline.
  version                   integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  origin                    text NOT NULL DEFAULT 'REAL' CHECK (origin IN ('REAL', 'SIMULATED')),
  simulation_run_id         uuid,
  archived_at               timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_orders_org_id_uniq UNIQUE (organization_id, id),
  CONSTRAINT work_orders_org_number_uniq UNIQUE (organization_id, number),
  CONSTRAINT work_orders_organization_fk FOREIGN KEY (organization_id) REFERENCES organizations (id),
  CONSTRAINT work_orders_alert_fk FOREIGN KEY (organization_id, alert_id) REFERENCES alerts (organization_id, id),
  CONSTRAINT work_orders_sector_fk FOREIGN KEY (organization_id, sector_id) REFERENCES sectors (organization_id, id),
  CONSTRAINT work_orders_asset_fk FOREIGN KEY (organization_id, asset_id) REFERENCES network_assets (organization_id, id),
  CONSTRAINT work_orders_device_fk FOREIGN KEY (organization_id, device_id) REFERENCES devices (organization_id, id),
  CONSTRAINT work_orders_assignee_fk FOREIGN KEY (organization_id, assigned_to) REFERENCES users (organization_id, id),
  CONSTRAINT work_orders_creator_fk FOREIGN KEY (organization_id, created_by) REFERENCES users (organization_id, id),
  CONSTRAINT work_orders_simulation_fk FOREIGN KEY (organization_id, simulation_run_id) REFERENCES simulation_runs (organization_id, id),
  CONSTRAINT work_orders_origin_simulation_consistent CHECK ((origin = 'SIMULATED') = (simulation_run_id IS NOT NULL)),
  CONSTRAINT work_orders_assignee_required CHECK (
    status NOT IN ('ASSIGNED', 'IN_PROGRESS', 'AWAITING_RESOURCES') OR assigned_to IS NOT NULL
  ),
  CONSTRAINT work_orders_completion_requires_diagnosis CHECK (
    status <> 'COMPLETED' OR (completed_at IS NOT NULL AND diagnosis IS NOT NULL)
  ),
  CONSTRAINT work_orders_cancellation_requires_reason CHECK (
    status <> 'CANCELLED' OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL AND length(btrim(cancellation_reason)) >= 5)
  )
);
CREATE INDEX work_orders_status_idx ON work_orders (organization_id, status, priority, due_at);
CREATE INDEX work_orders_assignee_idx ON work_orders (organization_id, assigned_to, status);
CREATE INDEX work_orders_alert_idx ON work_orders (organization_id, alert_id);
CREATE INDEX work_orders_sector_idx ON work_orders (organization_id, sector_id, created_at DESC);
CREATE INDEX work_orders_created_idx ON work_orders (organization_id, created_at DESC);
CREATE INDEX work_orders_origin_idx ON work_orders (organization_id, origin, created_at DESC);
CREATE INDEX work_orders_location_gix ON work_orders USING gist (location);
CREATE TRIGGER work_orders_set_updated_at BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE work_order_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL,
  work_order_id       uuid NOT NULL,
  event_type          text NOT NULL CHECK (event_type IN (
    'CREATED', 'ASSIGNED', 'STATUS_CHANGED', 'INSPECTION_RECORDED', 'REPAIR_RECORDED',
    'ATTACHMENT_ADDED', 'NOTE', 'SYNC_CONFLICT'
  )),
  from_status         text,
  to_status           text,
  actor_user_id       uuid,
  data                jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Identificador gerado no cliente (aplicação de campo): torna a sincronização idempotente.
  client_mutation_id  text CHECK (client_mutation_id IS NULL OR length(client_mutation_id) BETWEEN 8 AND 128),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_order_events_order_fk FOREIGN KEY (organization_id, work_order_id) REFERENCES work_orders (organization_id, id),
  CONSTRAINT work_order_events_actor_fk FOREIGN KEY (organization_id, actor_user_id) REFERENCES users (organization_id, id)
);
CREATE INDEX work_order_events_order_idx ON work_order_events (organization_id, work_order_id, created_at);
CREATE UNIQUE INDEX work_order_events_client_mutation_uidx ON work_order_events (work_order_id, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;
CREATE TRIGGER work_order_events_append_only BEFORE UPDATE OR DELETE ON work_order_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE attachments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL,
  work_order_id       uuid NOT NULL,
  uploaded_by         uuid NOT NULL,
  -- Chave do objeto no bucket privado. O acesso é sempre mediado pela API (autorização por organização/ordem).
  storage_key         text NOT NULL CHECK (length(storage_key) BETWEEN 1 AND 500),
  original_filename   text,
  content_type        text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes          integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 15728640),
  sha256              text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  captured_at         timestamptz,
  location            geometry(Point, 4326),
  client_mutation_id  text CHECK (client_mutation_id IS NULL OR length(client_mutation_id) BETWEEN 8 AND 128),
  archived_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attachments_order_fk FOREIGN KEY (organization_id, work_order_id) REFERENCES work_orders (organization_id, id),
  CONSTRAINT attachments_uploader_fk FOREIGN KEY (organization_id, uploaded_by) REFERENCES users (organization_id, id)
);
CREATE UNIQUE INDEX attachments_storage_key_uidx ON attachments (storage_key);
CREATE INDEX attachments_order_idx ON attachments (organization_id, work_order_id) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX attachments_client_mutation_uidx ON attachments (work_order_id, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;
