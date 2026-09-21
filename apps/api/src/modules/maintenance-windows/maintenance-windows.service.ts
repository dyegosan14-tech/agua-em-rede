import type { CreateMaintenanceWindowRequest, ListMaintenanceWindowsQuery, MaintenanceWindowDto } from '@aer/contracts';
import type { Db } from '@aer/database';
import { Errors } from '../../lib/errors';
import type { RequestMeta } from '../../lib/request-meta';
import type { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.service';
import * as repo from './maintenance-windows.repository';

export interface MaintenanceWindowsServiceDeps {
  db: Db;
  audit: AuditService;
}

export class MaintenanceWindowsService {
  constructor(private readonly deps: MaintenanceWindowsServiceDeps) {}

  async list(auth: AuthContext, query: ListMaintenanceWindowsQuery) {
    const { rows, total } = await repo.listMaintenanceWindows(this.deps.db, auth.organizationId, query);
    return { items: rows.map(repo.toMaintenanceWindowDto), page: { limit: query.limit, offset: query.offset, total } };
  }

  async create(auth: AuthContext, input: CreateMaintenanceWindowRequest, meta: RequestMeta): Promise<MaintenanceWindowDto> {
    const { db, audit } = this.deps;
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);

    return db.transaction(async (tx) => {
      const created = await repo.insertMaintenanceWindow(tx, {
        organizationId: auth.organizationId,
        sectorId: input.sectorId ?? null,
        deviceId: input.deviceId ?? null,
        reason: input.reason,
        startsAt,
        endsAt,
        createdBy: auth.userId,
      });

      await audit.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'maintenance_window.created',
          entityType: 'maintenance_window',
          entityId: created.id,
          meta,
          metadata: { sectorId: input.sectorId, deviceId: input.deviceId, reason: input.reason },
        },
        tx,
      );

      return repo.toMaintenanceWindowDto(created);
    });
  }

  async cancel(auth: AuthContext, id: string, meta: RequestMeta): Promise<{ success: boolean }> {
    const { db, audit } = this.deps;
    const ok = await db.transaction(async (tx) => {
      const cancelled = await repo.cancelMaintenanceWindow(tx, auth.organizationId, id);
      if (!cancelled) throw Errors.notFound('Janela de manutenção');

      await audit.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'maintenance_window.cancelled',
          entityType: 'maintenance_window',
          entityId: id,
          meta,
          metadata: { id },
        },
        tx,
      );
      return true;
    });

    return { success: ok };
  }
}
