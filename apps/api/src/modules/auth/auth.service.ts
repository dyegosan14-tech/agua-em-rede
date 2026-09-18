import type { ChangePasswordRequest, LoginRequest } from '@aer/contracts';
import type { PasswordHasher, Db } from '@aer/database';
import type { Role } from '@aer/domain';
import { AppError, Errors } from '../../lib/errors';
import type { RequestMeta } from '../../lib/request-meta';
import { fingerprint, generateSessionToken, hashToken } from '../../lib/tokens';
import type { AuditService } from '../audit/audit.service';
import * as repo from './auth.repository';

export interface AuthContext {
  sessionId: string;
  userId: string;
  organizationId: string;
  role: Role;
  email: string;
  name: string;
  expiresAt: Date;
  organization: { id: string; name: string; slug: string; isDemo: boolean; timezone: string };
}

export interface LoginResult {
  token: string;
  context: AuthContext;
}

export interface SessionPolicy {
  absoluteTtlMs: number;
  idleTtlMs: number;
}

/** Atualiza last_seen_at no máximo uma vez por minuto, para não gerar uma escrita por requisição. */
const TOUCH_INTERVAL_MS = 60_000;

export interface AuthServiceDeps {
  db: Db;
  passwords: PasswordHasher;
  audit: AuditService;
  policy: SessionPolicy;
  clock: () => Date;
}

function toContext(row: repo.SessionWithUser): AuthContext {
  return {
    sessionId: row.session.id,
    userId: row.user.id,
    organizationId: row.user.organizationId,
    role: row.user.role,
    email: row.user.email,
    name: row.user.name,
    expiresAt: row.session.expiresAt,
    organization: {
      id: row.organization.id,
      name: row.organization.name,
      slug: row.organization.slug,
      isDemo: row.organization.isDemo,
      timezone: row.organization.timezone,
    },
  };
}

export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  async login(input: LoginRequest, meta: RequestMeta): Promise<LoginResult> {
    const { db, passwords, audit, policy, clock } = this.deps;
    const found = await repo.findUserByEmail(db, input.email);

    // Sempre gastamos o tempo de uma verificação Argon2, exista o usuário ou não.
    let passwordOk = false;
    if (found) passwordOk = await passwords.verify(found.user.passwordHash, input.password);
    else await passwords.verifyDummy(input.password);

    const eligible = found && passwordOk && found.user.isActive && !found.user.archivedAt && !found.organization.archivedAt;
    if (!found || !eligible) {
      // O motivo real só vai para a auditoria; a resposta ao cliente é sempre a mesma (sem enumeração de contas).
      const reason = !found ? 'unknown_user' : !passwordOk ? 'bad_password' : 'account_disabled';
      await audit.record({
        organizationId: found?.user.organizationId ?? null,
        actorUserId: null,
        action: 'auth.login.failed',
        entityType: found ? 'user' : undefined,
        entityId: found?.user.id,
        meta,
        metadata: { emailFingerprint: fingerprint(input.email), reason },
      });
      throw Errors.invalidCredentials();
    }

    const now = clock();
    const { token, hash } = generateSessionToken();
    const rehash = passwords.needsRehash(found.user.passwordHash) ? await passwords.hash(input.password) : null;

    const session = await db.transaction(async (tx) => {
      if (rehash) await repo.updatePasswordHash(tx, found.user.id, rehash, now, false);
      const created = await repo.insertSession(tx, {
        organizationId: found.user.organizationId,
        userId: found.user.id,
        tokenHash: hash,
        ip: meta.ip,
        userAgent: meta.userAgent,
        now,
        expiresAt: new Date(now.getTime() + policy.absoluteTtlMs),
      });
      await repo.markLogin(tx, found.user.id, now);
      await audit.record(
        {
          organizationId: found.user.organizationId,
          actorUserId: found.user.id,
          action: 'auth.login.succeeded',
          entityType: 'session',
          entityId: created.id,
          meta,
        },
        tx,
      );
      return created;
    });

    return { token, context: toContext({ session, user: found.user, organization: found.organization }) };
  }

  /** Devolve o contexto de autenticação ou null se o token for inválido, expirado, revogado ou inativo. */
  async resolveSession(token: string): Promise<AuthContext | null> {
    const { db, policy, clock } = this.deps;
    const row = await repo.findSessionByTokenHash(db, hashToken(token));
    if (!row) return null;

    const now = clock();
    const { session, user, organization } = row;
    if (session.revokedAt) return null;
    if (session.expiresAt.getTime() <= now.getTime()) return null;
    if (session.lastSeenAt.getTime() + policy.idleTtlMs <= now.getTime()) return null;
    if (!user.isActive || user.archivedAt || organization.archivedAt) return null;

    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await repo.touchSession(db, session.id, now);
    }
    return toContext(row);
  }

  async logout(auth: AuthContext, meta: RequestMeta): Promise<void> {
    const { db, audit, clock } = this.deps;
    await db.transaction(async (tx) => {
      await repo.revokeSession(tx, auth.sessionId, 'LOGOUT', clock());
      await audit.record(
        { organizationId: auth.organizationId, actorUserId: auth.userId, action: 'auth.logout', entityType: 'session', entityId: auth.sessionId, meta },
        tx,
      );
    });
  }

  async changePassword(auth: AuthContext, input: ChangePasswordRequest, meta: RequestMeta): Promise<{ revokedSessions: number }> {
    const { db, passwords, audit, clock } = this.deps;
    const found = await repo.findUserWithOrganization(db, auth.organizationId, auth.userId);
    if (!found) throw Errors.unauthenticated();

    const valid = await passwords.verify(found.user.passwordHash, input.currentPassword);
    if (!valid) {
      throw new AppError(400, 'VALIDATION_ERROR', 'A senha atual está incorreta.', [
        { path: 'currentPassword', message: 'Senha atual incorreta.' },
      ]);
    }

    const now = clock();
    const newHash = await passwords.hash(input.newPassword);
    return db.transaction(async (tx) => {
      await repo.updatePasswordHash(tx, auth.userId, newHash, now, true);
      // Encerra as demais sessões (ex.: um dispositivo perdido); a atual continua.
      const revokedSessions = await repo.revokeUserSessions(tx, {
        organizationId: auth.organizationId,
        userId: auth.userId,
        reason: 'PASSWORD_CHANGED',
        now,
        exceptSessionId: auth.sessionId,
      });
      await audit.record(
        {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: 'auth.password.changed',
          entityType: 'user',
          entityId: auth.userId,
          meta,
          metadata: { revokedSessions },
        },
        tx,
      );
      return { revokedSessions };
    });
  }
}
