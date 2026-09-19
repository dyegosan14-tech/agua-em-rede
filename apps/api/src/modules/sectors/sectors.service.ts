import type { CreateSectorRequest, ListSectorsQuery, SectorDto, UpdateSectorRequest } from '@aer/contracts';
import type { Db } from '@aer/database';
import { Errors } from '../../lib/errors';
import { isUniqueViolation } from '../../lib/pg-errors';
import type { RequestMeta } from '../../lib/request-meta';
import type { AuditService } from '../audit/audit.service';
import type { AuthContext } from '../auth/auth.service';
import * as repo from './sectors.repository';

export interface SectorsServiceDeps {
  db: Db;
  audit: AuditService;
}

export class SectorsService {
  constructor(private readonly deps: SectorsServiceDeps) {}

  async list(auth: AuthContext, query: ListSectorsQuery) {
    const { rows, total } = await repo.listSectors(this.deps.db, auth.organizationId, query);
    return { items: rows.map(repo.toSectorDto), page: { limit: query.limit, offset: query.offset, total } };
  }

  async get(auth: AuthContext, sectorId: string): Promise<SectorDto> {
    const sector = await repo.findSector(this.deps.db, auth.organizationId, sectorId);
    if (!sector) throw Errors.notFound('Setor');
    return repo.toSectorDto(sector);
  }

  async create(auth: AuthContext, input: CreateSectorRequest, meta: RequestMeta): Promise<SectorDto> {
    const { db, audit } = this.deps;
    try {
      return await db.transaction(async (tx) => {
        const sector = await repo.insertSector(tx, {
          organizationId: auth.organizationId,
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          supplySchedule: input.supplySchedule,
          isFictional: input.isFictional ?? false,
        });
        await audit.record(
          {
            organizationId: auth.organizationId,
            actorUserId: auth.userId,
            action: 'sector.created',
            entityType: 'sector',
            entityId: sector.id,
            meta,
            metadata: { code: sector.code, name: sector.name },
          },
          tx,
        );
        return repo.toSectorDto(sector);
      });
    } catch (error) {
      if (isUniqueViolation(error, 'sectors_org_code_uidx')) {
        throw Errors.conflict('Já existe um setor com este código nesta organização.');
      }
      throw error;
    }
  }

  async update(auth: AuthContext, sectorId: string, input: UpdateSectorRequest, meta: RequestMeta): Promise<SectorDto> {
    const { db, audit } = this.deps;
    return db.transaction(async (tx) => {
      const current = await repo.findSector(tx, auth.organizationId, sectorId);
      if (!current) throw Errors.notFound('Setor');

      const updated = await repo.updateSector(tx, auth.organizationId, sectorId, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.supplySchedule !== undefined ? { supplySchedule: input.supplySchedule } : {}),
      });
      if (!updated) throw Errors.notFound('Setor');

      await audit.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'sector.updated',
          entityType: 'sector',
          entityId: sectorId,
          meta,
          metadata: {
            changes: {
              ...(input.name !== undefined ? { name: true } : {}),
              ...(input.description !== undefined ? { description: true } : {}),
              ...(input.supplySchedule !== undefined ? { supplySchedule: true } : {}),
            },
          },
        },
        tx,
      );
      return repo.toSectorDto(updated);
    });
  }
}
