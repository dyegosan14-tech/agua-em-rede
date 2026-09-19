import { measurements } from '@aer/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestContext, login, seedOrganization, type SeededOrg, type TestContext } from './support/harness';

let ctx: TestContext;
let counter = 0;
const freshOrg = (): Promise<SeededOrg> => seedOrganization(ctx, `tel${(counter += 1)}`);

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

describe('telemetria, alertas, ordens de serviço e indicadores', () => {
  it('ingere leituras válidas e atualiza status do dispositivo', async () => {
    const org = await freshOrg();
    const admin = await login(ctx.app, org.users.ADMIN.email);

    // Cria setor e sensor
    const sec = await call(ctx.app, admin, 'POST', '/api/sectors', { code: 'SEC-TEL', name: 'Setor Tel' });
    const dev = await call(ctx.app, admin, 'POST', '/api/devices', {
      sectorId: sec.json().id,
      code: 'DEV-TEL-P1',
      name: 'Sensor P1',
      kind: 'PRESSURE_SENSOR',
      metrics: ['PRESSURE'],
      rangePressureMin: 0,
      rangePressureMax: 100,
    });

    const now = new Date().toISOString();
    const ingestRes = await call(ctx.app, admin, 'POST', '/api/telemetry/ingest', {
      items: [
        {
          deviceId: dev.json().id,
          metric: 'PRESSURE',
          value: 32.5,
          unit: 'mca',
          measuredAt: now,
        },
      ],
    });

    expect(ingestRes.statusCode).toBe(200);
    expect(ingestRes.json().ingestedCount).toBe(1);

    const rows = await ctx.testDb.db.select().from(measurements).where(eq(measurements.deviceId, dev.json().id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value).toBe(32.5);
    expect(rows[0]?.quality).toBe('GOOD');
  });

  it('marca qualidade ruim para leituras fora da faixa física do instrumento', async () => {
    const org = await freshOrg();
    const admin = await login(ctx.app, org.users.ADMIN.email);

    const sec = await call(ctx.app, admin, 'POST', '/api/sectors', { code: 'SEC-BAD', name: 'Setor Bad' });
    const dev = await call(ctx.app, admin, 'POST', '/api/devices', {
      sectorId: sec.json().id,
      code: 'DEV-BAD-P',
      name: 'Sensor Faixa',
      kind: 'PRESSURE_SENSOR',
      metrics: ['PRESSURE'],
      rangePressureMin: 10,
      rangePressureMax: 50,
    });

    const ingestRes = await call(ctx.app, admin, 'POST', '/api/telemetry/ingest', {
      items: [
        {
          deviceId: dev.json().id,
          metric: 'PRESSURE',
          value: 75.0, // Maior que 50 (máximo)
          unit: 'mca',
          measuredAt: new Date().toISOString(),
        },
      ],
    });

    expect(ingestRes.statusCode).toBe(200);
    const rows = await ctx.testDb.db.select().from(measurements).where(eq(measurements.deviceId, dev.json().id));
    expect(rows[0]?.quality).toBe('BAD');
    expect(rows[0]?.qualityFlags).toContain('OUT_OF_RANGE_MAX');
  });

  it('executa simulação de vazamento e gera alerta FLOW_UP_PRESSURE_DOWN', async () => {
    const org = await freshOrg();
    const admin = await login(ctx.app, org.users.ADMIN.email);

    const sec = await call(ctx.app, admin, 'POST', '/api/sectors', { code: 'SEC-SIM', name: 'Setor Sim' });
    await call(ctx.app, admin, 'POST', '/api/devices', {
      sectorId: sec.json().id,
      code: 'DEV-SIM-P',
      name: 'Sensor P',
      kind: 'PRESSURE_SENSOR',
      metrics: ['PRESSURE'],
      rangePressureMin: 0,
      rangePressureMax: 80,
    });
    await call(ctx.app, admin, 'POST', '/api/devices', {
      sectorId: sec.json().id,
      code: 'DEV-SIM-Q',
      name: 'Medidor Q',
      kind: 'FLOW_METER',
      metrics: ['FLOW'],
      rangeFlowMin: 0,
      rangeFlowMax: 400,
    });

    const simRes = await call(ctx.app, admin, 'POST', '/api/telemetry/simulate', {
      sectorId: sec.json().id,
      scenario: 'COMBINED_EVENT',
      durationHours: 12,
    });

    expect(simRes.statusCode).toBe(200);
    const result = simRes.json();
    expect(result.measurementsGenerated).toBeGreaterThan(0);
    expect(result.generatedAlertId).toBeDefined();

    // Checa o alerta gerado
    const alertRes = await call(ctx.app, admin, 'GET', `/api/alerts/${result.generatedAlertId}`);
    expect(alertRes.statusCode).toBe(200);
    const alert = alertRes.json();
    expect(alert.severity).toBe('CRITICAL');
    expect(alert.evidence.pattern).toBe('FLOW_UP_PRESSURE_DOWN');

    // Abre Ordem de Serviço a partir do alerta
    const osRes = await call(ctx.app, admin, 'POST', '/api/work-orders', {
      alertId: alert.id,
      title: 'Contenção de rompimento oculto',
      priority: 'URGENT',
    });
    expect(osRes.statusCode).toBe(201);
    const os = osRes.json();

    // Conclui a ordem com volume economizado
    const updateOs = await call(ctx.app, admin, 'PATCH', `/api/work-orders/${os.id}`, {
      status: 'COMPLETED',
      diagnosis: 'LEAK_CONFIRMED',
      estimatedVolumeM3: 1250.0,
      repairNotes: 'Abraçadeira instalada em tubo PEAD.',
    });
    expect(updateOs.statusCode).toBe(200);
    expect(updateOs.json().status).toBe('COMPLETED');
    expect(updateOs.json().estimatedVolumeM3).toBe(1250);

    // Consulta os KPIs consolidados
    const kpiRes = await call(ctx.app, admin, 'GET', '/api/analytics/kpis');
    expect(kpiRes.statusCode).toBe(200);
    const kpis = kpiRes.json();

    expect(kpis.waterSavedM3).toBe(1250);
    expect(kpis.costSavingsBrl).toBe(1250 * 3.5); // R$ 4.375,00
    expect(kpis.confirmedLeaksCount).toBe(1);
    expect(kpis.detectedLeaksCount).toBeGreaterThanOrEqual(1);
    expect(kpis.lossesReductionPercent).toBeGreaterThan(0);
  });

  it('gerencia ciclo de vida do alerta: ACKNOWLEDGE -> INVESTIGATE -> RESOLVE', async () => {
    const org = await freshOrg();
    const admin = await login(ctx.app, org.users.ADMIN.email);

    const sec = await call(ctx.app, admin, 'POST', '/api/sectors', { code: 'SEC-LIFE', name: 'Setor Ciclo' });
    const dev = await call(ctx.app, admin, 'POST', '/api/devices', {
      sectorId: sec.json().id,
      code: 'DEV-LIFE-P',
      name: 'Sensor Ciclo',
      kind: 'PRESSURE_SENSOR',
      metrics: ['PRESSURE'],
      rangePressureMin: 0,
      rangePressureMax: 100,
    });

    // Ingestão com pressão muito baixa (8 mca < 15 mca) para gerar anomalia
    await call(ctx.app, admin, 'POST', '/api/telemetry/ingest', {
      items: [
        {
          deviceId: dev.json().id,
          metric: 'PRESSURE',
          value: 8.5,
          unit: 'mca',
          measuredAt: new Date().toISOString(),
        },
      ],
    });

    // Lista alertas
    const listRes = await call(ctx.app, admin, 'GET', '/api/alerts?status=OPEN');
    expect(listRes.statusCode).toBe(200);
    const items = listRes.json().items;
    expect(items.length).toBeGreaterThanOrEqual(1);
    const alertId = items[0].id;

    // Transição para ACKNOWLEDGE
    const ackRes = await call(ctx.app, admin, 'POST', `/api/alerts/${alertId}/transition`, {
      action: 'ACKNOWLEDGE',
      note: 'Operador ciente',
    });
    expect(ackRes.statusCode).toBe(200);
    expect(ackRes.json().status).toBe('ACKNOWLEDGED');

    // Transição para INVESTIGATE
    const invRes = await call(ctx.app, admin, 'POST', `/api/alerts/${alertId}/transition`, {
      action: 'INVESTIGATE',
      note: 'Equipe de campo acionada',
    });
    expect(invRes.statusCode).toBe(200);
    expect(invRes.json().status).toBe('INVESTIGATING');

    // Transição para RESOLVE
    const resRes = await call(ctx.app, admin, 'POST', `/api/alerts/${alertId}/transition`, {
      action: 'RESOLVE',
      note: 'Válvula regulada com sucesso',
    });
    expect(resRes.statusCode).toBe(200);
    expect(resRes.json().status).toBe('RESOLVED');
  });
});
