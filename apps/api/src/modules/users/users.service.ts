import type { CreateUserRequest, ListUsersQuery, ResetPasswordRequest, UpdateUserRequest, UserDto } from '@aer/contracts';
import type { Db, PasswordHasher } from '@aer/database';
import { Errors } from '../../lib/errors';
import { isUniqueViolation } from '../../lib/pg-errors';
import type { RequestMeta } from '../../lib/request-meta';
import type { AuditService } from '../audit/audit.service';
import * as authRepo from '../auth/auth.repository';
import type { AuthContext } from '../auth/auth.service';
import * as repo from './users.repository';

export function toUserDto(user: repo.UserRow): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export interface UsersServiceDeps {
  db: Db;
  passwords: PasswordHasher;
  audit: AuditService;
  clock: () => Date;
}

/**
 * Todas as operações recebem o AuthContext do chamador e escopam por `auth.organizationId`.
 * Usuários de outras organizações são indistinguíveis de usuários inexistentes (404).
 */
export class UsersService {
  constructor(private readonly deps: UsersServiceDeps) {}

  async list(auth: AuthContext, query: ListUsersQuery) {
    const { rows, total } = await repo.listUsers(this.deps.db, auth.organizationId, query);
    return { items: rows.map(toUserDto), page: { limit: query.limit, offset: query.offset, total } };
  }

  async get(auth: AuthContext, userId: string): Promise<UserDto> {
    const user = await repo.findUser(this.deps.db, auth.organizationId, userId);
    if (!user) throw Errors.notFound('Usuário');
    return toUserDto(user);
  }

  async create(auth: AuthContext, input: CreateUserRequest, meta: RequestMeta): Promise<UserDto> {
    const { db, passwords, audit } = this.deps;
    const passwordHash = await passwords.hash(input.password);
    try {
      return await db.transaction(async (tx) => {
        const user = await repo.insertUser(tx, {
          organizationId: auth.organizationId, // nunca vem do corpo da requisição
          email: input.email,
          name: input.name,
          role: input.role,
          passwordHash,
        });
        await audit.record(
          {
            organizationId: auth.organizationId,
            actorUserId: auth.userId,
            action: 'user.created',
            entityType: 'user',
            entityId: user.id,
            meta,
            metadata: { role: user.role },
          },
          tx,
        );
        return toUserDto(user);
      });
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_uidx')) throw Errors.conflict('Já existe um usuário com este e-mail.');
      throw error;
    }
  }

  async update(auth: AuthContext, userId: string, input: UpdateUserRequest, meta: RequestMeta): Promise<UserDto> {
    const { db, audit, clock } = this.deps;
    return db.transaction(async (tx) => {
      const current = await repo.findUser(tx, auth.organizationId, userId);
      if (!current) throw Errors.notFound('Usuário');

      const roleChanges = input.role !== undefined && input.role !== current.role;
      const deactivates = input.isActive === false && current.isActive;
      const removesAdmin = current.role === 'ADMIN' && current.isActive && (roleChanges || deactivates);

      if (userId === auth.userId && (roleChanges || deactivates)) {
        throw Errors.conflict('Você não pode alterar o próprio perfil nem desativar a própria conta.');
      }
      if (removesAdmin && (await repo.countOtherActiveAdmins(tx, auth.organizationId, userId)) === 0) {
        throw Errors.lastAdmin();
      }

      const updated = await repo.updateUser(tx, auth.organizationId, userId, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      });
      if (!updated) throw Errors.notFound('Usuário');

      // Mudança de perfil ou desativação encerra as sessões: permissões antigas não sobrevivem.
      let revokedSessions = 0;
      if (roleChanges || deactivates) {
        revokedSessions = await authRepo.revokeUserSessions(tx, {
          organizationId: auth.organizationId,
          userId,
          reason: deactivates ? 'USER_DEACTIVATED' : 'ROLE_CHANGED',
          now: clock(),
        });
      }
      await audit.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'user.updated',
          entityType: 'user',
          entityId: userId,
          meta,
          metadata: {
            changes: {
              ...(input.name !== undefined ? { name: true } : {}),
              ...(roleChanges ? { role: { from: current.role, to: input.role } } : {}),
              ...(input.isActive !== undefined ? { isActive: { from: current.isActive, to: input.isActive } } : {}),
            },
            revokedSessions,
          },
        },
        tx,
      );
      return toUserDto(updated);
    });
  }

  async resetPassword(auth: AuthContext, userId: string, input: ResetPasswordRequest, meta: RequestMeta): Promise<{ revokedSessions: number }> {
    const { db, passwords, audit, clock } = this.deps;
    const passwordHash = await passwords.hash(input.newPassword);
    return db.transaction(async (tx) => {
      const now = clock();
      const updated = await repo.updateUser(tx, auth.organizationId, userId, { passwordHash, passwordChangedAt: now });
      if (!updated) throw Errors.notFound('Usuário');
      const revokedSessions = await authRepo.revokeUserSessions(tx, {
        organizationId: auth.organizationId,
        userId,
        reason: 'PASSWORD_CHANGED',
        now,
      });
      await audit.record(
        { organizationId: auth.organizationId, actorUserId: auth.userId, action: 'user.password.reset', entityType: 'user', entityId: userId, meta, metadata: { revokedSessions } },
        tx,
      );
      return { revokedSessions };
    });
  }

  async revokeSessions(auth: AuthContext, userId: string, meta: RequestMeta): Promise<{ revokedSessions: number }> {
    const { db, audit, clock } = this.deps;
    return db.transaction(async (tx) => {
      const user = await repo.findUser(tx, auth.organizationId, userId);
      if (!user) throw Errors.notFound('Usuário');
      const revokedSessions = await authRepo.revokeUserSessions(tx, {
        organizationId: auth.organizationId,
        userId,
        reason: 'ADMIN_REVOKED',
        now: clock(),
      });
      await audit.record(
        { organizationId: auth.organizationId, actorUserId: auth.userId, action: 'user.sessions.revoked', entityType: 'user', entityId: userId, meta, metadata: { revokedSessions } },
        tx,
      );
      return { revokedSessions };
    });
  }
}
