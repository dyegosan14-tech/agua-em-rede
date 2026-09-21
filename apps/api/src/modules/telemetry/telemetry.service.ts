import { createHash, randomUUID } from 'node:crypto';
import type { DeviceIngestTelemetryRequest, IngestTelemetryRequest, ListMeasurementsQuery, RunSimulationRequest } from '@aer/contracts';
import { devices, sectors, type Db } from '@aer/database';
import type { MeasurementQuality, Metric } from '@aer/domain';
import { and, eq } from 'drizzle-orm';
import { Errors } from '../../lib/errors';
import type { RequestMeta } from '../../lib/request-meta';
import type { AlertsService } from '../alerts/alerts.service';
import type { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.service';
import * as devicesRepo from '../devices/devices.repository';
import * as repo from './telemetry.repository';

export interface TelemetryServiceDeps {
  db: Db;
  alerts: AlertsService;
  audit: AuditService;
  clock?: () => Date;
}

export class TelemetryService {
  constructor(private readonly deps: TelemetryServiceDeps) {}

  async list(auth: AuthContext, query: ListMeasurementsQuery) {
    const { rows, total } = await repo.listMeasurements(this.deps.db, auth.organizationId, query);
    return { items: rows.map(repo.toMeasurementDto), page: { limit: query.limit, offset: query.offset, total } };
  }

  async ingest(auth: AuthContext, input: IngestTelemetryRequest, meta: RequestMeta) {
    const { db, alerts, audit } = this.deps;
    const clock = this.deps.clock ?? (() => new Date());
    const now = clock();

    const deviceRows = await db
      .select()
      .from(devices)
      .where(eq(devices.organizationId, auth.organizationId));
    const deviceMap = new Map(deviceRows.map((d) => [d.id, d]));

    const toInsert = [];
    const anomalies: { deviceId: string; sectorId: string | null; metric: Metric; value: number; type: string }[] = [];

    for (const item of input.items) {
      const dev = deviceMap.get(item.deviceId);
      if (!dev) continue; // ignora dispositivo não pertencente à organização

      let quality: MeasurementQuality = 'GOOD';
      const qualityFlags: string[] = [];

      // Checa se está fora de faixa física
      if (item.metric === 'PRESSURE') {
        if (dev.rangePressureMin !== null && item.value < dev.rangePressureMin) {
          quality = 'BAD';
          qualityFlags.push('OUT_OF_RANGE_MIN');
        } else if (dev.rangePressureMax !== null && item.value > dev.rangePressureMax) {
          quality = 'BAD';
          qualityFlags.push('OUT_OF_RANGE_MAX');
        } else if (item.value < 15) {
          // Abaixo de 15 mca em Recife = anomalia operacional de baixa pressão
          anomalies.push({ deviceId: dev.id, sectorId: dev.sectorId, metric: 'PRESSURE', value: item.value, type: 'LOW_PRESSURE' });
        }
      } else if (item.metric === 'FLOW') {
        if (dev.rangeFlowMin !== null && item.value < dev.rangeFlowMin) {
          quality = 'BAD';
          qualityFlags.push('OUT_OF_RANGE_MIN');
        } else if (dev.rangeFlowMax !== null && item.value > dev.rangeFlowMax) {
          quality = 'BAD';
          qualityFlags.push('OUT_OF_RANGE_MAX');
        } else if (item.value > 150) {
          anomalies.push({ deviceId: dev.id, sectorId: dev.sectorId, metric: 'FLOW', value: item.value, type: 'HIGH_FLOW' });
        }
      }

      toInsert.push({
        organizationId: auth.organizationId,
        deviceId: dev.id,
        sectorId: dev.sectorId,
        externalEventId: item.externalEventId ?? randomUUID(),
        metric: item.metric,
        value: item.value,
        unit: item.unit ?? (item.metric === 'PRESSURE' ? 'mca' : 'm3/h'),
        quality,
        qualityFlags,
        measuredAt: new Date(item.measuredAt),
        origin: dev.isFictional ? ('SIMULATED' as const) : ('REAL' as const),
        simulationRunId: null,
      });

      // Atualiza último recebimento do dispositivo
      await db
        .update(devices)
        .set({ lastMeasurementAt: new Date(item.measuredAt), lastReceivedAt: now })
        .where(eq(devices.id, dev.id));
    }

    const inserted = await repo.insertMeasurements(db, toInsert);

    // Se detectou anomalias, dispara criação/deduplicação de alertas
    for (const anom of anomalies) {
      await alerts.createOrDeduplicate(auth.organizationId, {
        ruleKind: anom.type === 'LOW_PRESSURE' ? 'LOW_PRESSURE' : 'HIGH_FLOW',
        sectorId: anom.sectorId,
        deviceId: anom.deviceId,
        dedupKey: `${anom.type}:${anom.sectorId ?? anom.deviceId}`,
        severity: anom.type === 'LOW_PRESSURE' ? 'HIGH' : 'MEDIUM',
        title: anom.type === 'LOW_PRESSURE' ? 'Queda Crítica de Pressão no Setor' : 'Vazão Excessiva Detectada',
        priorityScore: anom.type === 'LOW_PRESSURE' ? 85 : 65,
        evidence: { metric: anom.metric, value: anom.value, threshold: anom.type === 'LOW_PRESSURE' ? 15 : 150 },
        origin: 'REAL',
      });
    }

    await audit.record(
      {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: 'telemetry.ingested',
        meta,
        metadata: { count: inserted.length, anomaliesCount: anomalies.length },
      },
      db,
    );

    return { ingestedCount: inserted.length };
  }

  async runSimulation(auth: AuthContext, input: RunSimulationRequest, meta: RequestMeta) {
    const { db, alerts, audit } = this.deps;
    const clock = this.deps.clock ?? (() => new Date());
    const now = clock();

    // Encontra um setor de demonstração
    const [sector] = input.sectorId
      ? await db.select().from(sectors).where(and(eq(sectors.id, input.sectorId), eq(sectors.organizationId, auth.organizationId))).limit(1)
      : await db.select().from(sectors).where(eq(sectors.organizationId, auth.organizationId)).limit(1);

    if (!sector) throw new Error('Nenhum setor disponível para simulação.');

    const devRows = await db
      .select()
      .from(devices)
      .where(and(eq(devices.organizationId, auth.organizationId), eq(devices.sectorId, sector.id)));

    const pressureDev = devRows.find((d) => d.kind === 'PRESSURE_SENSOR') ?? devRows[0];
    const flowDev = devRows.find((d) => d.kind === 'FLOW_METER') ?? devRows[1];

    const run = await repo.createSimulationRun(db, {
      organizationId: auth.organizationId,
      scenario: input.scenario ?? 'COMBINED_EVENT',
      seed: Math.floor(Math.random() * 100000),
      status: 'RUNNING',
      sectorId: sector.id,
      createdBy: auth.userId,
    });

    const readingsToInsert = [];
    const hours = input.durationHours ?? 24;

    // Gera 1 leitura a cada hora nas últimas `hours` horas
    for (let i = hours; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 3600 * 1000);
      const isLeakHour = i <= 6; // vazamento ocorreu nas últimas 6 horas

      if (pressureDev) {
        // Normal: ~30 mca. Vazamento: ~18 mca (-40%)
        const pressVal = isLeakHour ? 17.5 + (Math.random() * 2 - 1) : 31.0 + (Math.random() * 3 - 1.5);
        readingsToInsert.push({
          organizationId: auth.organizationId,
          deviceId: pressureDev.id,
          sectorId: sector.id,
          externalEventId: randomUUID(),
          metric: 'PRESSURE' as const,
          value: Math.round(pressVal * 10) / 10,
          unit: 'mca',
          quality: 'GOOD' as const,
          qualityFlags: [],
          measuredAt: timestamp,
          origin: 'SIMULATED' as const,
          simulationRunId: run.id,
        });
      }

      if (flowDev) {
        // Normal: ~110 m³/h. Vazamento: ~165 m³/h (+50%)
        const flowVal = isLeakHour ? 168.0 + (Math.random() * 8 - 4) : 108.0 + (Math.random() * 6 - 3);
        readingsToInsert.push({
          organizationId: auth.organizationId,
          deviceId: flowDev.id,
          sectorId: sector.id,
          externalEventId: randomUUID(),
          metric: 'FLOW' as const,
          value: Math.round(flowVal * 10) / 10,
          unit: 'm3/h',
          quality: 'GOOD' as const,
          qualityFlags: [],
          measuredAt: timestamp,
          origin: 'SIMULATED' as const,
          simulationRunId: run.id,
        });
      }
    }

    await repo.insertMeasurements(db, readingsToInsert);

    // Dispara Alerta de Vazamento Iminente (FLOW_UP_PRESSURE_DOWN)
    const alert = await alerts.createOrDeduplicate(auth.organizationId, {
      ruleKind: 'FLOW_UP_PRESSURE_DOWN',
      sectorId: sector.id,
      deviceId: pressureDev?.id ?? null,
      dedupKey: `SIM:LEAK:${sector.id}`,
      severity: 'CRITICAL',
      title: `Rompimento Oculto Detectado no Setor ${sector.code}`,
      priorityScore: 95,
      evidence: {
        pattern: 'FLOW_UP_PRESSURE_DOWN',
        flowIncreasePercent: '+52%',
        pressureDropPercent: '-41%',
        estimatedLossRateM3H: 58.5,
        sectorCode: sector.code,
        sectorName: sector.name,
      },
      origin: 'SIMULATED',
      simulationRunId: run.id,
    });

    await repo.updateSimulationRun(db, auth.organizationId, run.id, {
      status: 'COMPLETED',
      measurementsGenerated: readingsToInsert.length,
      finishedAt: now,
    });

    await audit.record(
      {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: 'simulation.run',
        meta,
        metadata: { scenario: run.scenario, measurementsGenerated: readingsToInsert.length, alertId: alert.id },
      },
      db,
    );

    return {
      runId: run.id,
      scenario: run.scenario,
      sectorCode: sector.code,
      measurementsGenerated: readingsToInsert.length,
      generatedAlertId: alert.id,
    };
  }

  async ingestFromDevice(
    deviceKey: string,
    input: DeviceIngestTelemetryRequest,
    _meta: RequestMeta,
  ): Promise<{ ingestedCount: number }> {
    const { db, alerts } = this.deps;
    const secretHash = createHash('sha256').update(deviceKey).digest('hex');
    const matched = await devicesRepo.findDeviceBySecretHash(db, secretHash);
    if (!matched) {
      throw Errors.unauthenticated();
    }
    const dev = matched.device;
    const now = this.deps.clock ? this.deps.clock() : new Date();

    const toInsert = [];
    const anomalies: { deviceId: string; sectorId: string | null; metric: Metric; value: number; type: string }[] = [];

    for (const item of input.items) {
      let quality: MeasurementQuality = 'GOOD';
      const qualityFlags: string[] = [];

      if (item.metric === 'PRESSURE') {
        if (dev.rangePressureMin !== null && item.value < dev.rangePressureMin) {
          quality = 'BAD';
          qualityFlags.push('OUT_OF_RANGE_MIN');
        } else if (dev.rangePressureMax !== null && item.value > dev.rangePressureMax) {
          quality = 'BAD';
          qualityFlags.push('OUT_OF_RANGE_MAX');
        } else if (item.value < 15) {
          anomalies.push({ deviceId: dev.id, sectorId: dev.sectorId, metric: 'PRESSURE', value: item.value, type: 'LOW_PRESSURE' });
        }
      } else if (item.metric === 'FLOW') {
        if (dev.rangeFlowMin !== null && item.value < dev.rangeFlowMin) {
          quality = 'BAD';
          qualityFlags.push('OUT_OF_RANGE_MIN');
        } else if (dev.rangeFlowMax !== null && item.value > dev.rangeFlowMax) {
          quality = 'BAD';
          qualityFlags.push('OUT_OF_RANGE_MAX');
        } else if (item.value > 150) {
          anomalies.push({ deviceId: dev.id, sectorId: dev.sectorId, metric: 'FLOW', value: item.value, type: 'HIGH_FLOW' });
        }
      }

      const measuredAt = item.measuredAt ? new Date(item.measuredAt) : now;

      toInsert.push({
        organizationId: dev.organizationId,
        deviceId: dev.id,
        sectorId: dev.sectorId,
        externalEventId: item.externalEventId ?? randomUUID(),
        metric: item.metric,
        value: item.value,
        unit: item.unit ?? (item.metric === 'PRESSURE' ? 'mca' : 'm3/h'),
        quality,
        qualityFlags,
        measuredAt,
        origin: dev.isFictional ? ('SIMULATED' as const) : ('REAL' as const),
        simulationRunId: null,
      });

      await db
        .update(devices)
        .set({ lastMeasurementAt: measuredAt, lastReceivedAt: now })
        .where(eq(devices.id, dev.id));
    }

    const inserted = await repo.insertMeasurements(db, toInsert);

    for (const anom of anomalies) {
      const isPressure = anom.type === 'LOW_PRESSURE';
      await alerts.createOrDeduplicate(dev.organizationId, {
        ruleKind: isPressure ? 'LOW_PRESSURE' : 'HIGH_FLOW',
        sectorId: anom.sectorId,
        deviceId: anom.deviceId,
        dedupKey: `${dev.organizationId}:device:${anom.deviceId}:${anom.type}`,
        severity: isPressure ? 'HIGH' : 'MEDIUM',
        title: isPressure
          ? `Pressão Baixa Detectada no Sensor ${dev.code}`
          : `Vazão Excessiva no Medidor ${dev.code}`,
        priorityScore: isPressure ? 75 : 60,
        evidence: {
          metric: anom.metric,
          value: anom.value,
          unit: anom.metric === 'PRESSURE' ? 'mca' : 'm3/h',
          note: `Anomalia de ${anom.type} detectada via telemetria IoT do sensor ${dev.code}`,
          threshold: isPressure ? '< 15 mca' : '> 150 m3/h',
        },
        origin: dev.isFictional ? 'SIMULATED' : 'REAL',
      });
    }

    return { ingestedCount: inserted.length };
  }
}

