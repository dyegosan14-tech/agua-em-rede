import type { CreateDeviceRequest, DeviceDto, ListDevicesQuery, UpdateDeviceRequest } from '@aer/contracts';
import type { Db } from '@aer/database';
import { Errors } from '../../lib/errors';
import { isUniqueViolation } from '../../lib/pg-errors';
import type { RequestMeta } from '../../lib/request-meta';
import type { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.service';
import * as sectorsRepo from '../sectors/sectors.repository';
import * as repo from './devices.repository';

export interface DevicesServiceDeps {
  db: Db;
  audit: AuditService;
}

export class DevicesService {
  constructor(private readonly deps: DevicesServiceDeps) {}

  async list(auth: AuthContext, query: ListDevicesQuery) {
    const { rows, total } = await repo.listDevices(this.deps.db, auth.organizationId, query);
    return { items: rows.map(repo.toDeviceDto), page: { limit: query.limit, offset: query.offset, total } };
  }

  async get(auth: AuthContext, deviceId: string): Promise<DeviceDto> {
    const device = await repo.findDevice(this.deps.db, auth.organizationId, deviceId);
    if (!device) throw Errors.notFound('Dispositivo');
    return repo.toDeviceDto(device);
  }

  async create(auth: AuthContext, input: CreateDeviceRequest, meta: RequestMeta): Promise<DeviceDto> {
    const { db, audit } = this.deps;

    // Validação de consistência tipo/métrica
    if (input.kind === 'PRESSURE_SENSOR' && (input.metrics.length !== 1 || input.metrics[0] !== 'PRESSURE')) {
      throw Errors.validation('Sensor de pressão deve ter apenas a métrica PRESSURE.', [{ path: 'metrics', message: 'Sensor de pressão deve ter apenas a métrica PRESSURE.' }]);
    }
    if (input.kind === 'FLOW_METER' && (input.metrics.length !== 1 || input.metrics[0] !== 'FLOW')) {
      throw Errors.validation('Medidor de vazão deve ter apenas a métrica FLOW.', [{ path: 'metrics', message: 'Medidor de vazão deve ter apenas a métrica FLOW.' }]);
    }

    // Validação de faixas físicas obrigatórias
    if (input.metrics.includes('PRESSURE')) {
      if (input.rangePressureMin === null || input.rangePressureMin === undefined || input.rangePressureMax === null || input.rangePressureMax === undefined) {
        throw Errors.validation('Faixa de pressão (mín e máx) é obrigatória.', [{ path: 'rangePressureMax', message: 'Faixa de pressão (mín e máx) é obrigatória.' }]);
      }
      if (input.rangePressureMax <= input.rangePressureMin) {
        throw Errors.validation('A pressão máxima deve ser maior que a mínima.', [{ path: 'rangePressureMax', message: 'A pressão máxima deve ser maior que a mínima.' }]);
      }
    }

    if (input.metrics.includes('FLOW')) {
      if (input.rangeFlowMin === null || input.rangeFlowMin === undefined || input.rangeFlowMax === null || input.rangeFlowMax === undefined) {
        throw Errors.validation('Faixa de vazão (mín e máx) é obrigatória.', [{ path: 'rangeFlowMax', message: 'Faixa de vazão (mín e máx) é obrigatória.' }]);
      }
      if (input.rangeFlowMax <= input.rangeFlowMin) {
        throw Errors.validation('A vazão máxima deve ser maior que a mínima.', [{ path: 'rangeFlowMax', message: 'A vazão máxima deve ser maior que a mínima.' }]);
      }
    }

    try {
      return await db.transaction(async (tx) => {
        if (input.sectorId) {
          const sector = await sectorsRepo.findSector(tx, auth.organizationId, input.sectorId);
          if (!sector) throw Errors.validation('Setor informado não existe nesta organização.', [{ path: 'sectorId', message: 'Setor informado não existe nesta organização.' }]);
        }

        const device = await repo.insertDevice(tx, {
          organizationId: auth.organizationId,
          sectorId: input.sectorId ?? null,
          assetId: input.assetId ?? null,
          code: input.code,
          name: input.name,
          kind: input.kind,
          metrics: input.metrics,
          rangePressureMin: input.rangePressureMin ?? null,
          rangePressureMax: input.rangePressureMax ?? null,
          rangeFlowMin: input.rangeFlowMin ?? null,
          rangeFlowMax: input.rangeFlowMax ?? null,
          expectedIntervalSeconds: input.expectedIntervalSeconds,
          status: input.status,
          isFictional: input.isFictional ?? false,
        });

        await audit.record(
          {
            organizationId: auth.organizationId,
            actorUserId: auth.userId,
            action: 'device.created',
            entityType: 'device',
            entityId: device.id,
            meta,
            metadata: { code: device.code, kind: device.kind, metrics: device.metrics },
          },
          tx,
        );
        return repo.toDeviceDto(device);
      });
    } catch (error) {
      if (isUniqueViolation(error, 'devices_org_code_uidx')) {
        throw Errors.conflict('Já existe um dispositivo com este código nesta organização.');
      }
      throw error;
    }
  }

  async update(auth: AuthContext, deviceId: string, input: UpdateDeviceRequest, meta: RequestMeta): Promise<DeviceDto> {
    const { db, audit } = this.deps;
    return db.transaction(async (tx) => {
      const current = await repo.findDevice(tx, auth.organizationId, deviceId);
      if (!current) throw Errors.notFound('Dispositivo');

      if (input.sectorId) {
        const sector = await sectorsRepo.findSector(tx, auth.organizationId, input.sectorId);
        if (!sector) throw Errors.validation('Setor informado não existe nesta organização.', [{ path: 'sectorId', message: 'Setor informado não existe nesta organização.' }]);
      }

      const updated = await repo.updateDevice(tx, auth.organizationId, deviceId, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.sectorId !== undefined ? { sectorId: input.sectorId } : {}),
        ...(input.assetId !== undefined ? { assetId: input.assetId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.rangePressureMin !== undefined ? { rangePressureMin: input.rangePressureMin } : {}),
        ...(input.rangePressureMax !== undefined ? { rangePressureMax: input.rangePressureMax } : {}),
        ...(input.rangeFlowMin !== undefined ? { rangeFlowMin: input.rangeFlowMin } : {}),
        ...(input.rangeFlowMax !== undefined ? { rangeFlowMax: input.rangeFlowMax } : {}),
        ...(input.expectedIntervalSeconds !== undefined ? { expectedIntervalSeconds: input.expectedIntervalSeconds } : {}),
      });
      if (!updated) throw Errors.notFound('Dispositivo');

      await audit.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'device.updated',
          entityType: 'device',
          entityId: deviceId,
          meta,
          metadata: { changes: input },
        },
        tx,
      );
      return repo.toDeviceDto(updated);
    });
  }
}
