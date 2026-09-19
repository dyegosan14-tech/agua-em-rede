import type { CreateWorkOrderRequest, ListWorkOrdersQuery, UpdateWorkOrderRequest, WorkOrderDto } from '@aer/contracts';
import type { Db } from '@aer/database';
import { Errors } from '../../lib/errors';
import type { RequestMeta } from '../../lib/request-meta';
import * as alertsRepo from '../alerts/alerts.repository';
import type { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.service';
import * as repo from './work-orders.repository';

export interface WorkOrdersServiceDeps {
  db: Db;
  audit: AuditService;
  clock?: () => Date;
}

export class WorkOrdersService {
  constructor(private readonly deps: WorkOrdersServiceDeps) {}

  async list(auth: AuthContext, query: ListWorkOrdersQuery) {
    const { rows, total } = await repo.listWorkOrders(this.deps.db, auth.organizationId, query);
    return { items: rows.map(repo.toWorkOrderDto), page: { limit: query.limit, offset: query.offset, total } };
  }

  async get(auth: AuthContext, workOrderId: string): Promise<WorkOrderDto> {
    const order = await repo.findWorkOrder(this.deps.db, auth.organizationId, workOrderId);
    if (!order) throw Errors.notFound('Ordem de serviço');
    return repo.toWorkOrderDto(order);
  }

  async create(auth: AuthContext, input: CreateWorkOrderRequest, meta: RequestMeta): Promise<WorkOrderDto> {
    const { db, audit } = this.deps;
    const clock = this.deps.clock ?? (() => new Date());
    const now = clock();

    return db.transaction(async (tx) => {
      let sectorId = input.sectorId ?? null;
      let deviceId = input.deviceId ?? null;
      let origin: 'REAL' | 'SIMULATED' = 'REAL';
      let simulationRunId: string | null = null;

      if (input.alertId) {
        const alert = await alertsRepo.findAlert(tx, auth.organizationId, input.alertId);
        if (alert) {
          sectorId = alert.sectorId ?? sectorId;
          deviceId = alert.deviceId ?? deviceId;
          origin = alert.origin;
          simulationRunId = alert.simulationRunId;

          // Se o alerta estiver OPEN, avança para INVESTIGATING automaticamente
          if (alert.status === 'OPEN') {
            await alertsRepo.updateAlert(tx, auth.organizationId, alert.id, {
              status: 'INVESTIGATING',
              investigationStartedAt: now,
            });
            await alertsRepo.insertAlertEvent(tx, {
              organizationId: auth.organizationId,
              alertId: alert.id,
              eventType: 'STATUS_CHANGED',
              fromStatus: 'OPEN',
              toStatus: 'INVESTIGATING',
              actorUserId: auth.userId,
              note: `Vinculado à nova OS gerada.`,
            });
          }
        }
      }

      const order = await repo.insertWorkOrder(tx, {
        organizationId: auth.organizationId,
        alertId: input.alertId ?? null,
        sectorId,
        deviceId,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? 'MEDIUM',
        status: input.assignedTo ? 'ASSIGNED' : 'OPEN',
        assignedTo: input.assignedTo ?? null,
        createdBy: auth.userId,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        assignedAt: input.assignedTo ? now : null,
        origin,
        simulationRunId,
      });

      await repo.insertWorkOrderEvent(tx, {
        organizationId: auth.organizationId,
        workOrderId: order.id,
        eventType: 'CREATED',
        toStatus: order.status,
        actorUserId: auth.userId,
      });

      await audit.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'work_order.created',
          entityType: 'work_order',
          entityId: order.id,
          meta,
          metadata: { number: order.number, priority: order.priority, alertId: order.alertId },
        },
        tx,
      );

      return repo.toWorkOrderDto(order);
    });
  }

  async update(auth: AuthContext, workOrderId: string, input: UpdateWorkOrderRequest, meta: RequestMeta): Promise<WorkOrderDto> {
    const { db, audit } = this.deps;
    const clock = this.deps.clock ?? (() => new Date());
    const now = clock();

    return db.transaction(async (tx) => {
      const current = await repo.findWorkOrder(tx, auth.organizationId, workOrderId);
      if (!current) throw Errors.notFound('Ordem de serviço');

      const changes: Partial<repo.WorkOrderRow> = {};

      if (input.priority !== undefined) changes.priority = input.priority;
      if (input.diagnosis !== undefined) changes.diagnosis = input.diagnosis;
      if (input.inspectionNotes !== undefined) changes.inspectionNotes = input.inspectionNotes;
      if (input.repairNotes !== undefined) changes.repairNotes = input.repairNotes;
      if (input.estimatedVolumeM3 !== undefined) {
        changes.estimatedVolumeM3 = input.estimatedVolumeM3 !== null ? String(input.estimatedVolumeM3) : null;
      }
      if (input.cancellationReason !== undefined) changes.cancellationReason = input.cancellationReason;

      if (input.assignedTo !== undefined && input.assignedTo !== current.assignedTo) {
        changes.assignedTo = input.assignedTo;
        changes.assignedAt = input.assignedTo ? now : null;
        if (current.status === 'OPEN' && input.assignedTo) {
          changes.status = 'ASSIGNED';
        }
      }

      if (input.status !== undefined && input.status !== current.status) {
        changes.status = input.status;
        if (input.status === 'IN_PROGRESS' && !current.inspectionStartedAt) {
          changes.inspectionStartedAt = now;
        } else if (input.status === 'COMPLETED') {
          changes.completedAt = now;
          changes.repairedAt = now;
          // Se ordem foi concluída e tem alerta vinculado, resolve o alerta
          if (current.alertId) {
            await alertsRepo.updateAlert(tx, auth.organizationId, current.alertId, {
              status: 'RESOLVED',
              resolvedAt: now,
              resolvedBy: auth.userId,
            });
            await alertsRepo.insertAlertEvent(tx, {
              organizationId: auth.organizationId,
              alertId: current.alertId,
              eventType: 'STATUS_CHANGED',
              fromStatus: 'INVESTIGATING',
              toStatus: 'RESOLVED',
              actorUserId: auth.userId,
              note: `Resolvido pela conclusão da OS #${current.number}.`,
            });
          }
        } else if (input.status === 'CANCELLED') {
          changes.cancelledAt = now;
        }
      }

      const updated = await repo.updateWorkOrder(tx, auth.organizationId, workOrderId, changes);
      if (!updated) throw Errors.notFound('Ordem de serviço');

      if (input.status && input.status !== current.status) {
        await repo.insertWorkOrderEvent(tx, {
          organizationId: auth.organizationId,
          workOrderId,
          eventType: 'STATUS_CHANGED',
          fromStatus: current.status,
          toStatus: input.status,
          actorUserId: auth.userId,
        });
      }

      await audit.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'work_order.updated',
          entityType: 'work_order',
          entityId: workOrderId,
          meta,
          metadata: { changes: input },
        },
        tx,
      );

      return repo.toWorkOrderDto(updated);
    });
  }
}
