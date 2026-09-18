import { getTableColumns, getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../test-support';
import { loadMigrations, runMigrations } from '../src/migrate';
import * as schema from '../src/schema';
import { seedDemo, createPasswordHasher } from '../src';

let testDb: TestDatabase;

beforeAll(async () => {
  testDb = await createTestDatabase();
});
afterAll(async () => {
  await testDb.close();
});
beforeEach(async () => {
  await testDb.reset();
});

async function expectSqlError(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  await expect(promise).rejects.toThrow(pattern);
}

async function insertOrg(slug: string): Promise<string> {
  const { rows } = await testDb.pool.query<{ id: string }>(
    'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id',
    [`Org ${slug}`, slug],
  );
  return rows[0]!.id;
}

async function insertUser(orgId: string, email: string): Promise<string> {
  const { rows } = await testDb.pool.query<{ id: string }>(
    `INSERT INTO users (organization_id, email, name, role, password_hash) VALUES ($1, $2, 'Fulano', 'VIEWER', 'x') RETURNING id`,
    [orgId, email],
  );
  return rows[0]!.id;
}

describe('migrations', () => {
  it('são idempotentes e verificam checksum', async () => {
    const again = await runMigrations(testDb.pool);
    expect(again.applied).toEqual([]);
    expect(again.alreadyApplied).toEqual(loadMigrations().map((m) => m.id));

    await testDb.pool.query(`UPDATE schema_migrations SET checksum = 'adulterado' WHERE id = '0001_extensions_and_helpers'`);
    await expect(runMigrations(testDb.pool)).rejects.toThrow(/checksum divergente/);
    const real = loadMigrations()[0]!.checksum;
    await testDb.pool.query(`UPDATE schema_migrations SET checksum = $1 WHERE id = '0001_extensions_and_helpers'`, [real]);
  });

  it('o schema Drizzle espelha as colunas reais (nome e nulabilidade)', async () => {
    const tables = Object.values(schema as Record<string, unknown>).filter((value): value is PgTable => is(value, PgTable));
    expect(tables.length).toBeGreaterThanOrEqual(17);

    for (const table of tables) {
      const name = getTableName(table);
      const expected = Object.values(getTableColumns(table)).map((column) => ({
        name: column.name,
        nullable: !column.notNull,
      }));
      const { rows } = await testDb.pool.query<{ column_name: string; is_nullable: string }>(
        `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [name],
      );
      const actual = rows.map((row) => ({ name: row.column_name, nullable: row.is_nullable === 'YES' }));
      const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
      expect(actual.sort(byName), `colunas de ${name}`).toEqual(expected.sort(byName));
    }
  });

  it('os CHECKs do banco coincidem com as enumerações do domínio', async () => {
    const { rows } = await testDb.pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'alerts'::regclass AND contype = 'c'`,
    );
    const statusCheck = rows.find((row) => row.def.includes("'INVESTIGATING'"));
    expect(statusCheck?.def).toBeDefined();
    for (const status of ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED', 'DISMISSED']) {
      expect(statusCheck!.def).toContain(`'${status}'`);
    }
  });
});

describe('integridade multi-organização', () => {
  it('FK composta impede sessão de usuário de outra organização', async () => {
    const orgA = await insertOrg('a');
    const orgB = await insertOrg('b');
    const userA = await insertUser(orgA, 'a@exemplo.test');
    await expectSqlError(
      testDb.pool.query(
        `INSERT INTO sessions (organization_id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '1 hour')`,
        [orgB, userA, 'a'.repeat(64)],
      ),
      /sessions_user_fk/,
    );
  });

  it('FK composta impede dispositivo apontar para setor de outra organização', async () => {
    const orgA = await insertOrg('a');
    const orgB = await insertOrg('b');
    const { rows } = await testDb.pool.query<{ id: string }>(
      `INSERT INTO sectors (organization_id, code, name) VALUES ($1, 'S1', 'Setor') RETURNING id`,
      [orgA],
    );
    await expectSqlError(
      testDb.pool.query(
        `INSERT INTO devices (organization_id, sector_id, code, name, kind, metrics, range_pressure_min, range_pressure_max)
         VALUES ($1, $2, 'D1', 'Dispositivo', 'PRESSURE_SENSOR', ARRAY['PRESSURE'], 0, 100)`,
        [orgB, rows[0]!.id],
      ),
      /devices_sector_fk/,
    );
  });
});

describe('restrições de telemetria', () => {
  async function createDevice(): Promise<{ orgId: string; deviceId: string }> {
    const orgId = await insertOrg('t');
    const { rows } = await testDb.pool.query<{ id: string }>(
      `INSERT INTO devices (organization_id, code, name, kind, metrics, range_pressure_min, range_pressure_max)
       VALUES ($1, 'D1', 'Sensor', 'PRESSURE_SENSOR', ARRAY['PRESSURE'], 0, 100) RETURNING id`,
      [orgId],
    );
    return { orgId, deviceId: rows[0]!.id };
  }

  const insertMeasurement = (orgId: string, deviceId: string, extra: { event?: string; metric?: string; unit?: string; origin?: string; run?: string | null } = {}) =>
    testDb.pool.query(
      `INSERT INTO measurements (organization_id, device_id, external_event_id, metric, value, unit, quality, measured_at, origin, simulation_run_id)
       VALUES ($1, $2, $3, $4, 12.5, $5, 'GOOD', now(), $6, $7)`,
      [orgId, deviceId, extra.event ?? 'evt-1', extra.metric ?? 'PRESSURE', extra.unit ?? 'mca', extra.origin ?? 'REAL', extra.run ?? null],
    );

  it('rejeita unidade incompatível com a métrica', async () => {
    const { orgId, deviceId } = await createDevice();
    await expectSqlError(insertMeasurement(orgId, deviceId, { unit: 'm3/h' }), /measurements_metric_unit_consistent/);
  });

  it('garante idempotência por dispositivo + identificador do evento', async () => {
    const { orgId, deviceId } = await createDevice();
    await insertMeasurement(orgId, deviceId, { event: 'evt-dup' });
    await expectSqlError(insertMeasurement(orgId, deviceId, { event: 'evt-dup' }), /measurements_device_event_uniq/);
  });

  it('exige simulation_run_id se, e somente se, a origem for SIMULATED', async () => {
    const { orgId, deviceId } = await createDevice();
    await expectSqlError(insertMeasurement(orgId, deviceId, { origin: 'SIMULATED' }), /measurements_origin_simulation_consistent/);
  });

  it('exige faixa física para cada métrica declarada pelo dispositivo', async () => {
    const orgId = await insertOrg('r');
    await expectSqlError(
      testDb.pool.query(
        `INSERT INTO devices (organization_id, code, name, kind, metrics) VALUES ($1, 'D2', 'Sem faixa', 'FLOW_METER', ARRAY['FLOW'])`,
        [orgId],
      ),
      /devices_flow_range_required/,
    );
  });
});

describe('alertas e histórico', () => {
  it('deduplica no banco: um único alerta ativo por chave, mas permite novo após resolução', async () => {
    const orgId = await insertOrg('al');
    const { rows: rule } = await testDb.pool.query<{ id: string }>(
      `INSERT INTO detection_rules (organization_id, name, kind, scope_type, window_seconds, min_duration_seconds, min_coverage_ratio, severity)
       VALUES ($1, 'Pressão baixa', 'LOW_PRESSURE', 'ORGANIZATION', 600, 300, 0.8, 'HIGH') RETURNING id`,
      [orgId],
    );
    const insertAlert = (status: string, extra = '') =>
      testDb.pool.query(
        `INSERT INTO alerts (organization_id, rule_id, dedup_key, status, severity, title, evidence, first_detected_at, last_detected_at, origin ${extra ? ', dismissal_reason' : ''})
         VALUES ($1, $2, 'k1', $3, 'HIGH', 'Alerta', '{}'::jsonb, now(), now(), 'REAL' ${extra ? ', $4' : ''})`,
        extra ? [orgId, rule[0]!.id, status, extra] : [orgId, rule[0]!.id, status],
      );

    await insertAlert('OPEN');
    await expectSqlError(insertAlert('ACKNOWLEDGED'), /alerts_active_dedup_uidx/);
    await testDb.pool.query(`UPDATE alerts SET status = 'RESOLVED', resolved_at = now() WHERE organization_id = $1`, [orgId]);
    await insertAlert('OPEN');
  });

  it('exige justificativa para descartar um alerta', async () => {
    const orgId = await insertOrg('dj');
    const { rows: rule } = await testDb.pool.query<{ id: string }>(
      `INSERT INTO detection_rules (organization_id, name, kind, scope_type, window_seconds, min_duration_seconds, min_coverage_ratio, severity)
       VALUES ($1, 'Vazão alta', 'HIGH_FLOW', 'ORGANIZATION', 600, 300, 0.8, 'MEDIUM') RETURNING id`,
      [orgId],
    );
    await expectSqlError(
      testDb.pool.query(
        `INSERT INTO alerts (organization_id, rule_id, dedup_key, status, severity, title, evidence, first_detected_at, last_detected_at, origin)
         VALUES ($1, $2, 'k2', 'DISMISSED', 'MEDIUM', 'Alerta', '{}'::jsonb, now(), now(), 'REAL')`,
        [orgId, rule[0]!.id],
      ),
      /alerts_dismissal_requires_reason/,
    );
  });
});

describe('trilhas append-only', () => {
  it('audit_logs não aceita UPDATE nem DELETE', async () => {
    const orgId = await insertOrg('aud');
    await testDb.pool.query(`INSERT INTO audit_logs (organization_id, action) VALUES ($1, 'TESTE')`, [orgId]);
    await expectSqlError(testDb.pool.query(`UPDATE audit_logs SET action = 'ALTERADA'`), /append-only/);
    await expectSqlError(testDb.pool.query(`DELETE FROM audit_logs`), /append-only/);
  });
});

describe('seed demonstrativo', () => {
  it('cria dados fictícios, é idempotente e grava geometrias PostGIS com SRID 4326', async () => {
    const hasher = createPasswordHasher({ memoryKib: 512, timeCost: 1 });
    const first = await seedDemo(testDb.db, { password: 'senha-demonstrativa-123', hasher });
    expect(first.created).toBe(true);
    expect(first.credentials.map((c) => c.role).sort()).toEqual(['ADMIN', 'OPERATOR', 'TECHNICIAN', 'VIEWER']);

    const second = await seedDemo(testDb.db, { hasher });
    expect(second.created).toBe(false);
    expect(second.credentials).toEqual([]);

    const { rows } = await testDb.pool.query<{ n: string; srid: number; kind: string }>(
      `SELECT count(*) AS n, min(ST_SRID(geometry)) AS srid, min(GeometryType(geometry)) AS kind FROM sectors`,
    );
    expect(Number(rows[0]!.n)).toBe(3);
    expect(rows[0]!.srid).toBe(4326);
    expect(rows[0]!.kind).toBe('MULTIPOLYGON');

    const { rows: fictional } = await testDb.pool.query<{ total: string; fake: string }>(
      `SELECT (SELECT count(*) FROM sectors) + (SELECT count(*) FROM devices) + (SELECT count(*) FROM network_assets) AS total,
              (SELECT count(*) FROM sectors WHERE is_fictional) + (SELECT count(*) FROM devices WHERE is_fictional) + (SELECT count(*) FROM network_assets WHERE is_fictional) AS fake`,
    );
    expect(fictional[0]!.fake).toBe(fictional[0]!.total);

    // Leitura via Drizzle converte EWKB -> GeoJSON.
    const [sector] = await testDb.db.select({ geometry: schema.sectors.geometry }).from(schema.sectors).limit(1);
    expect(sector?.geometry?.type).toBe('MultiPolygon');

    const [{ n: postgisOk } = { n: 0 }] = (await testDb.db.execute(sql`SELECT 1 AS n FROM sectors WHERE ST_IsValid(geometry) LIMIT 1`)).rows as { n: number }[];
    expect(postgisOk).toBe(1);
  });
});
