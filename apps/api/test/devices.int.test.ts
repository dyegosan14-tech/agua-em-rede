import { auditLogs, devices } from '@aer/database';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestContext, login, seedOrganization, type SeededOrg, type TestContext } from './support/harness';

let ctx: TestContext;
let counter = 0;
const freshOrg = (): Promise<SeededOrg> => seedOrganization(ctx, `dev${(counter += 1)}`);

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

describe('gestão de dispositivos e dashboard', () => {
  it('cria sensor de pressão com faixas válidas e registra auditoria', async () => {
    const org = await freshOrg();
    const admin = await login(ctx.app, org.users.ADMIN.email);

    const secRes = await call(ctx.app, admin, 'POST', '/api/sectors', { code: 'SEC-D1', name: 'Setor D1' });
    const sector = secRes.json();

    const response = await call(ctx.app, admin, 'POST', '/api/devices', {
      sectorId: sector.id,
      code: 'DEV-P01',
      name: 'Sensor de Pressão Barueri',
      kind: 'PRESSURE_SENSOR',
      metrics: ['PRESSURE'],
      rangePressureMin: 0,
      rangePressureMax: 100,
    });

    expect(response.statusCode).toBe(201);
    const created = response.json();
    expect(created).toMatchObject({
      code: 'DEV-P01',
      name: 'Sensor de Pressão Barueri',
      kind: 'PRESSURE_SENSOR',
      status: 'ACTIVE',
      rangePressureMin: 0,
      rangePressureMax: 100,
    });

    const [row] = await ctx.testDb.db.select().from(devices).where(eq(devices.id, created.id));
    expect(row).toBeDefined();
    expect(row?.code).toBe('DEV-P01');

    const audit = await ctx.testDb.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, org.organizationId), eq(auditLogs.action, 'device.created')));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actorUserId).toBe(org.users.ADMIN.id);
  });

  it('valida faixas físicas incorretas', async () => {
    const org = await freshOrg();
    const admin = await login(ctx.app, org.users.ADMIN.email);

    // Pressão máxima menor ou igual à mínima
    const invalid = await call(ctx.app, admin, 'POST', '/api/devices', {
      code: 'DEV-ERR',
      name: 'Sensor Inválido',
      kind: 'PRESSURE_SENSOR',
      metrics: ['PRESSURE'],
      rangePressureMin: 50,
      rangePressureMax: 20,
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('calcula métricas agregadas do dashboard corretamente', async () => {
    const org = await freshOrg();
    const admin = await login(ctx.app, org.users.ADMIN.email);

    // Cria 1 setor e 2 dispositivos
    await call(ctx.app, admin, 'POST', '/api/sectors', { code: 'SEC-DASH', name: 'Setor Dash' });
    await call(ctx.app, admin, 'POST', '/api/devices', {
      code: 'P-DASH',
      name: 'Sensor P',
      kind: 'PRESSURE_SENSOR',
      metrics: ['PRESSURE'],
      rangePressureMin: 0,
      rangePressureMax: 60,
    });
    await call(ctx.app, admin, 'POST', '/api/devices', {
      code: 'Q-DASH',
      name: 'Medidor Q',
      kind: 'FLOW_METER',
      metrics: ['FLOW'],
      rangeFlowMin: 0,
      rangeFlowMax: 250,
    });

    const dash = await call(ctx.app, admin, 'GET', '/api/dashboard/summary');
    expect(dash.statusCode).toBe(200);
    const summary = dash.json();

    expect(summary.sectorsCount).toBe(1);
    expect(summary.devicesCount).toBe(2);
    expect(summary.activeDevicesCount).toBe(2);
    expect(summary.pressureSensorsCount).toBe(1);
    expect(summary.flowMetersCount).toBe(1);
    expect(summary.usersCount).toBeGreaterThanOrEqual(4); // usuários do seed da organização
  });
});
