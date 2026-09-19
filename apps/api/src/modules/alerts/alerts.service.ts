import type { AlertDto, ListAlertsQuery, TransitionAlertRequest } from '@aer/contracts';
import type { Db } from '@aer/database';
import type { AlertStatus, RuleKind } from '@aer/domain';
import { Errors } from '../../lib/errors';
import type { RequestMeta } from '../../lib/request-meta';
import type { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.service';
import * as repo from './alerts.repository';

export interface AlertsServiceDeps {
  db: Db;
  audit: AuditService;
  clock?: () => Date;
}

export class AlertsService {
  constructor(private readonly deps: AlertsServiceDeps) {}

  async list(auth: AuthContext, query: ListAlertsQuery) {
    const { rows, total } = await repo.listAlerts(this.deps.db, auth.organizationId, query);
    return { items: rows.map(repo.toAlertDto), page: { limit: query.limit, offset: query.offset, total } };
  }

  async get(auth: AuthContext, alertId: string): Promise<AlertDto> {
    const alert = await repo.findAlert(this.deps.db, auth.organizationId, alertId);
    if (!alert) throw Errors.notFound('Alerta');
    return repo.toAlertDto(alert);
  }

  async transition(auth: AuthContext, alertId: string, input: TransitionAlertRequest, meta: RequestMeta): Promise<AlertDto> {
    const { db, audit } = this.deps;
    const clock = this.deps.clock ?? (() => new Date());
    const now = clock();

    return db.transaction(async (tx) => {
      const current = await repo.findAlert(tx, auth.organizationId, alertId);
      if (!current) throw Errors.notFound('Alerta');

      let targetStatus: AlertStatus = current.status;
      const changes: Partial<repo.AlertRow> = {};

      switch (input.action) {
        case 'ACKNOWLEDGE':
          targetStatus = 'ACKNOWLEDGED';
          changes.acknowledgedAt = now;
          changes.acknowledgedBy = auth.userId;
          break;
        case 'INVESTIGATE':
          targetStatus = 'INVESTIGATING';
          changes.investigationStartedAt = now;
          break;
        case 'RESOLVE':
          targetStatus = 'RESOLVED';
          changes.resolvedAt = now;
          changes.resolvedBy = auth.userId;
          break;
        case 'DISMISS':
          targetStatus = 'DISMISSED';
          changes.dismissedAt = now;
          changes.dismissedBy = auth.userId;
          changes.dismissalReason = input.dismissalReason ?? input.note ?? 'Descartado pelo operador';
          break;
      }

      changes.status = targetStatus;

      const updated = await repo.updateAlert(tx, auth.organizationId, alertId, changes);
      if (!updated) throw Errors.notFound('Alerta');

      await repo.insertAlertEvent(tx, {
        organizationId: auth.organizationId,
        alertId,
        eventType: 'STATUS_CHANGED',
        fromStatus: current.status,
        toStatus: targetStatus,
        actorUserId: auth.userId,
        note: input.note ?? null,
      });

      await audit.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'alert.transitioned',
          entityType: 'alert',
          entityId: alertId,
          meta,
          metadata: { from: current.status, to: targetStatus, action: input.action },
        },
        tx,
      );

      return repo.toAlertDto(updated);
    });
  }

  /** Cria ou deduplica alerta gerado por regras de telemetria ou simulador. */
  async createOrDeduplicate(
    organizationId: string,
    data: {
      ruleId?: string;
      ruleKind?: RuleKind;
      sectorId?: string | null;
      deviceId?: string | null;
      dedupKey: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      title: string;
      priorityScore: number;
      evidence: Record<string, unknown>;
      origin: 'REAL' | 'SIMULATED';
      simulationRunId?: string | null;
    },
  ): Promise<repo.AlertRow> {
    const clock = this.deps.clock ?? (() => new Date());
    const now = clock();

    const existing = await repo.findAlertByDedupKey(this.deps.db, organizationId, data.dedupKey);
    if (existing && existing.status !== 'RESOLVED' && existing.status !== 'DISMISSED') {
      const updated = await repo.updateAlert(this.deps.db, organizationId, existing.id, {
        occurrences: existing.occurrences + 1,
        lastDetectedAt: now,
        evidence: { ...existing.evidence, ...data.evidence, lastOccurrence: now.toISOString() },
      });
      return updated ?? existing;
    }

    const ruleId =
      data.ruleId ??
      (await repo.getOrCreateDefaultRule(
        this.deps.db,
        organizationId,
        data.ruleKind ?? 'FLOW_UP_PRESSURE_DOWN',
        data.severity,
      ));

    const created = await repo.insertAlert(this.deps.db, {
      organizationId,
      ruleId,
      sectorId: data.sectorId ?? null,
      deviceId: data.deviceId ?? null,
      dedupKey: data.dedupKey,
      status: 'OPEN',
      severity: data.severity,
      title: data.title,
      priorityScore: data.priorityScore,
      evidence: data.evidence,
      occurrences: 1,
      firstDetectedAt: now,
      lastDetectedAt: now,
      origin: data.origin,
      simulationRunId: data.simulationRunId ?? null,
    });

    await repo.insertAlertEvent(this.deps.db, {
      organizationId,
      alertId: created.id,
      eventType: 'DETECTED',
      toStatus: 'OPEN',
      data: data.evidence,
    });

    return created;
  }
}
