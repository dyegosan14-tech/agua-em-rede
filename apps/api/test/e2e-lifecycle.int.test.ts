import { alerts, attachments, measurements } from '@aer/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestContext, login, seedOrganization, type SeededOrg, type TestContext } from './support/harness';

let ctx: TestContext;
let counter = 0;
const freshOrg = (): Promise<SeededOrg> => seedOrganization(ctx, `e2e${(counter += 1)}`);

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

describe('E2E: Ciclo de Vida Operacional Completo (Meta 30% Redução de Perdas)', () => {
  it('executa a cadeia de valor: ingestão IoT -> anomalia -> alerta -> janela preventiva -> OS em campo com foto -> dashboard atualizado', async () => {
    const org = await freshOrg();
    const admin = await login(ctx.app, org.users.ADMIN.email);
    const tech = await login(ctx.app, org.users.TECHNICIAN.email);

    // 1. Cadastrar Setor e Sensor de Pressão em Recife
    const secRes = await call(ctx.app, admin, 'POST', '/api/sectors', {
      code: 'SEC-BOA-VIAGEM',
      name: 'Setor Boa Viagem - Zona Sul',
      description: 'Área com monitoramento intensivo de perdas físicas',
    });
    expect(secRes.statusCode).toBe(201);
    const sector = secRes.json();

    const devRes = await call(ctx.app, admin, 'POST', '/api/devices', {
      sectorId: sector.id,
      code: 'PT-BV-001',
      name: 'Transdutor de Pressão Av. Boa Viagem',
      kind: 'PRESSURE_SENSOR',
      metrics: ['PRESSURE'],
      rangePressureMin: 0,
      rangePressureMax: 100,
      expectedIntervalSeconds: 300,
    });
    expect(devRes.statusCode).toBe(201);
    const device = devRes.json();

    // 2. Gerar Chave Criptográfica IoT de 256 bits para o Sensor
    const credRes = await call(ctx.app, admin, 'POST', `/api/devices/${device.id}/credentials`, {
      label: 'Gateway LoRaWAN / Celular',
    });
    expect(credRes.statusCode).toBe(201);
    const cred = credRes.json();
    expect(cred.secret).toBeDefined();
    expect(cred.secret.length).toBeGreaterThanOrEqual(32);

    // 3. Sensor transmite telemetria anômala via POST /api/telemetry/device-ingest usando X-Device-Key
    // Pressão cai drasticamente para 8.5 mca (limiar crítico < 15 mca => rompimento de ramal)
    const ingestRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/telemetry/device-ingest',
      headers: {
        'x-device-key': cred.secret,
        'content-type': 'application/json',
      },
      payload: {
        items: [
          {
            metric: 'PRESSURE',
            value: 8.5,
            unit: 'mca',
            measuredAt: new Date().toISOString(),
          },
        ],
      },
    });
    expect(ingestRes.statusCode).toBe(200);
    expect(ingestRes.json().ingestedCount).toBe(1);

    // Verifica persistência da medição
    const [measRow] = await ctx.testDb.db.select().from(measurements).where(eq(measurements.deviceId, device.id));
    expect(measRow).toBeDefined();
    expect(measRow?.value).toBe(8.5);

    // 4. Verifica geração automática do Alerta de Baixa Pressão
    const alertsListRes = await call(ctx.app, admin, 'GET', '/api/alerts?status=OPEN');
    expect(alertsListRes.statusCode).toBe(200);
    const activeAlerts = alertsListRes.json().items;
    const leakAlert = activeAlerts.find((a: { deviceId: string }) => a.deviceId === device.id);
    expect(leakAlert).toBeDefined();
    expect(leakAlert.severity).toBe('HIGH');
    expect(leakAlert.title).toContain('Pressão Baixa Detectada');

    // 5. Agendar Janela de Manutenção Preventiva para manobra na rede
    const startsAt = new Date();
    const endsAt = new Date(Date.now() + 4 * 3600 * 1000);
    const mwRes = await call(ctx.app, admin, 'POST', '/api/maintenance-windows', {
      sectorId: sector.id,
      reason: 'Manutenção emergencial na rede distribuidora para contenção de vazamento',
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    });
    expect(mwRes.statusCode).toBe(201);
    const mw = mwRes.json();
    expect(mw.reason).toContain('Manutenção emergencial');

    // 6. Criar Ordem de Serviço vinculada ao Alerta e atribuir ao Técnico
    const woRes = await call(ctx.app, admin, 'POST', '/api/work-orders', {
      alertId: leakAlert.id,
      sectorId: sector.id,
      deviceId: device.id,
      title: 'Reparo de vazamento visível em tubulação PEAD',
      priority: 'HIGH',
      assignedTo: org.users.TECHNICIAN.id,
      description: 'Localizar e sanar ponto de fuga de água identificado pela queda de pressão no sensor PT-BV-001.',
    });
    expect(woRes.statusCode).toBe(201);
    const workOrder = woRes.json();

    // 7. Técnico de campo inicia atendimento e anexa foto de evidência (PWA)
    const updateStartRes = await call(ctx.app, tech, 'PATCH', `/api/work-orders/${workOrder.id}`, {
      status: 'IN_PROGRESS',
      inspectionNotes: 'Escavação realizada. Identificada junta desencaixada em ramal de 60mm.',
    });
    expect(updateStartRes.statusCode).toBe(200);

    const dummyBase64 = Buffer.from('fake-photo-binary-data-for-e2e-test').toString('base64');
    const photoRes = await call(ctx.app, tech, 'POST', `/api/work-orders/${workOrder.id}/attachments`, {
      filename: 'evidencia_reparo_junta.jpg',
      contentType: 'image/jpeg',
      dataBase64: dummyBase64,
    });
    expect(photoRes.statusCode).toBe(201);
    const attachment = photoRes.json();
    expect(attachment.originalFilename).toBe('evidencia_reparo_junta.jpg');

    const [attRow] = await ctx.testDb.db.select().from(attachments).where(eq(attachments.id, attachment.id));
    expect(attRow).toBeDefined();
    expect(attRow?.sha256).toBeDefined();

    // 8. Técnico conclui o reparo, informando diagnóstico e volume recuperado (520 m³)
    const completeRes = await call(ctx.app, tech, 'PATCH', `/api/work-orders/${workOrder.id}`, {
      status: 'COMPLETED',
      diagnosis: 'LEAK_CONFIRMED',
      estimatedVolumeM3: 520,
      repairNotes: 'Substituição de luva de união e reaterro da vala concluído com sucesso.',
    });
    expect(completeRes.statusCode).toBe(200);
    const completedWo = completeRes.json();
    expect(completedWo.status).toBe('COMPLETED');
    expect(completedWo.estimatedVolumeM3).toBe(520);

    // O alerta associado é automaticamente resolvido pela conclusão da OS
    const [alertAfter] = await ctx.testDb.db.select().from(alerts).where(eq(alerts.id, leakAlert.id));
    expect(alertAfter?.status).toBe('RESOLVED');

    // 9. Consultar Dashboard e Analytics para verificar reflexo nos indicadores (Meta de 30%)
    const dashRes = await call(ctx.app, admin, 'GET', '/api/dashboard/summary');
    expect(dashRes.statusCode).toBe(200);
    const dashboard = dashRes.json();
    expect(dashboard.devicesCount).toBe(1);
    expect(dashboard.activeDevicesCount).toBe(1);
    expect(dashboard.sectorsCount).toBe(1);

    const kpiRes = await call(ctx.app, admin, 'GET', '/api/analytics/kpis');
    expect(kpiRes.statusCode).toBe(200);
    const kpis = kpiRes.json();
    expect(kpis.waterSavedM3).toBe(520);
    expect(kpis.confirmedLeaksCount).toBe(1);
    expect(kpis.costSavingsBrl).toBe(520 * 3.5);
  });
});

