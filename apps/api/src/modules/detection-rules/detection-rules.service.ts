import type { CreateDetectionRuleRequest, DetectionRuleDto, ListDetectionRulesQuery } from '@aer/contracts';
import type { Db } from '@aer/database';
import type { RequestMeta } from '../../lib/request-meta';
import type { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.service';
import * as repo from './detection-rules.repository';

export interface DetectionRulesServiceDeps {
  db: Db;
  audit: AuditService;
}

export class DetectionRulesService {
  constructor(private readonly deps: DetectionRulesServiceDeps) {}

  async list(auth: AuthContext, query: ListDetectionRulesQuery) {
    const { rows, total } = await repo.listDetectionRules(this.deps.db, auth.organizationId, query);
    return { items: rows.map(repo.toDetectionRuleDto), page: { limit: query.limit, offset: query.offset, total } };
  }

  async create(auth: AuthContext, input: CreateDetectionRuleRequest, meta: RequestMeta): Promise<DetectionRuleDto> {
    const { db, audit } = this.deps;

    return db.transaction(async (tx) => {
      const created = await repo.insertDetectionRule(tx, {
        organizationId: auth.organizationId,
        name: input.name,
        description: input.description,
        kind: input.kind,
        scopeType: input.scopeType,
        sectorId: input.sectorId ?? null,
        deviceId: input.deviceId ?? null,
        params: input.params,
        windowSeconds: input.windowSeconds,
        minDurationSeconds: input.minDurationSeconds,
        minCoverageRatio: input.minCoverageRatio.toFixed(3),
        severity: input.severity,
        suppressionSeconds: input.suppressionSeconds,
        recoverySeconds: input.recoverySeconds,
        respectSupplySchedule: input.respectSupplySchedule,
        respectMaintenance: input.respectMaintenance,
        isEnabled: input.isEnabled,
        createdBy: auth.userId,
      });

      await audit.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'detection_rule.created',
          entityType: 'detection_rule',
          entityId: created.id,
          meta,
          metadata: { name: created.name, kind: created.kind, severity: created.severity },
        },
        tx,
      );

      return repo.toDetectionRuleDto(created);
    });
  }
}
