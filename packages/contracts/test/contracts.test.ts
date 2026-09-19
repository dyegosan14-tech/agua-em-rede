import { describe, expect, it } from 'vitest';
import {
  createDeviceRequestSchema,
  createSectorRequestSchema,
  createWorkOrderRequestSchema,
  ingestTelemetryRequestSchema,
  kpiSummarySchema,
  runSimulationRequestSchema,
  supplyScheduleEntrySchema,
  transitionAlertRequestSchema,
  updateDeviceRequestSchema,
  updateSectorRequestSchema,
  updateWorkOrderRequestSchema,
} from '../src';

describe('Contracts - Sectors', () => {
  it('valida entrada de horário de abastecimento correta', () => {
    const valid = supplyScheduleEntrySchema.safeParse({
      daysOfWeek: [1, 2, 3, 4, 5],
      start: '06:00',
      end: '22:00',
    });
    expect(valid.success).toBe(true);
  });

  it('recusa horário com formato inválido', () => {
    const invalid = supplyScheduleEntrySchema.safeParse({
      daysOfWeek: [0],
      start: '25:00',
      end: '12:00',
    });
    expect(invalid.success).toBe(false);
  });

  it('valida requisição de criação de setor', () => {
    const parsed = createSectorRequestSchema.safeParse({
      code: 'SEC-CENTRO-01',
      name: 'Setor Centro',
      description: 'Setor de testes',
      supplySchedule: [{ daysOfWeek: [0, 1], start: '08:00', end: '18:00' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('recusa criação de setor com código inválido', () => {
    const invalid = createSectorRequestSchema.safeParse({
      code: 'SEC INVALID!',
      name: 'Setor Inválido',
    });
    expect(invalid.success).toBe(false);
  });

  it('exige ao menos um campo para atualizar setor', () => {
    const empty = updateSectorRequestSchema.safeParse({});
    expect(empty.success).toBe(false);

    const valid = updateSectorRequestSchema.safeParse({ name: 'Novo Nome' });
    expect(valid.success).toBe(true);
  });
});

describe('Contracts - Devices', () => {
  it('valida criação de sensor de pressão com faixa', () => {
    const parsed = createDeviceRequestSchema.safeParse({
      code: 'P-01',
      name: 'Sensor de Pressão Principal',
      kind: 'PRESSURE_SENSOR',
      metrics: ['PRESSURE'],
      rangePressureMin: 10,
      rangePressureMax: 80,
    });
    expect(parsed.success).toBe(true);
  });

  it('recusa criação sem métrica', () => {
    const invalid = createDeviceRequestSchema.safeParse({
      code: 'DEV-EMPTY',
      name: 'Dispositivo sem métrica',
      kind: 'PRESSURE_SENSOR',
      metrics: [],
    });
    expect(invalid.success).toBe(false);
  });

  it('valida atualização de status de dispositivo', () => {
    const update = updateDeviceRequestSchema.safeParse({ status: 'INACTIVE' });
    expect(update.success).toBe(true);
  });
});

describe('Contracts - Telemetry', () => {
  it('valida lote de ingestão de telemetria', () => {
    const parsed = ingestTelemetryRequestSchema.safeParse({
      items: [
        {
          deviceId: 'a0000000-0000-4000-a000-000000000001',
          metric: 'PRESSURE',
          value: 28.5,
          unit: 'mca',
          measuredAt: new Date().toISOString(),
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('valida requisição de simulação de cenário de vazamento', () => {
    const parsed = runSimulationRequestSchema.safeParse({
      scenario: 'COMBINED_EVENT',
      durationHours: 24,
    });
    expect(parsed.success).toBe(true);
  });
});

describe('Contracts - Alerts', () => {
  it('valida transição de status de alerta', () => {
    const parsed = transitionAlertRequestSchema.safeParse({
      action: 'INVESTIGATE',
      note: 'Equipe de campo despachada para o local.',
    });
    expect(parsed.success).toBe(true);
  });
});

describe('Contracts - Work Orders', () => {
  it('valida criação de ordem de serviço', () => {
    const parsed = createWorkOrderRequestSchema.safeParse({
      title: 'Reparo de vazamento na Rua da Aurora',
      priority: 'HIGH',
      description: 'Queda súbita de pressão detectada pelo sensor P-01.',
    });
    expect(parsed.success).toBe(true);
  });

  it('valida conclusão de reparo com volume de água economizado', () => {
    const parsed = updateWorkOrderRequestSchema.safeParse({
      status: 'COMPLETED',
      diagnosis: 'LEAK_CONFIRMED',
      estimatedVolumeM3: 450.5,
      repairNotes: 'Substituição de junta elástica danificada em tubulação de PVC 200mm.',
    });
    expect(parsed.success).toBe(true);
  });
});

describe('Contracts - Analytics & KPIs', () => {
  it('valida estrutura dos indicadores de sucesso do desafio', () => {
    const summary = kpiSummarySchema.safeParse({
      lossesReductionPercent: 18.5,
      waterSavedM3: 14200.75,
      costSavingsBrl: 49702.62,
      detectedLeaksCount: 23,
      confirmedLeaksCount: 19,
      meanTimeToRepairHours: 4.8,
      sensorAvailabilityRate: 98.2,
      pendingWorkOrdersCount: 4,
      trendLast7Days: [
        { date: '2026-09-18', alertsCount: 3, volumeSavedM3: 1200 },
        { date: '2026-09-19', alertsCount: 2, volumeSavedM3: 950 },
      ],
    });
    expect(summary.success).toBe(true);
  });
});
