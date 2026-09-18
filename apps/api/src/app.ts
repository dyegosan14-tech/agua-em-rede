import { randomUUID } from 'node:crypto';
import type { ApiConfig } from '@aer/config';
import { configureZodLocale } from '@aer/contracts';
import { createDb, type Db, type PasswordHasher } from '@aer/database';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import type { RateLimiter } from './lib/rate-limiter';
import { auditRoutes } from './modules/audit/audit.routes';
import { AuditService } from './modules/audit/audit.service';
import { authRoutes } from './modules/auth/auth.routes';
import { AuthService } from './modules/auth/auth.service';
import { healthRoutes } from './modules/health/health.routes';
import { organizationsRoutes } from './modules/organizations/organizations.routes';
import { usersRoutes } from './modules/users/users.routes';
import { UsersService } from './modules/users/users.service';
import { registerAuth } from './plugins/auth';
import { registerErrorHandling } from './plugins/error-handler';
import { registerOpenApi } from './plugins/openapi';
import { registerSecurity } from './plugins/security';

export interface AppDeps {
  config: ApiConfig;
  pool: pg.Pool;
  /** Opcional: em testes o Drizzle pode ser criado a partir do pool. */
  db?: Db;
  redis: Redis | null;
  rateLimiter: RateLimiter;
  passwords: PasswordHasher;
  /** Logger (Pino) já configurado; ausente = logs desligados (testes). */
  logger?: FastifyBaseLogger;
  /** Relógio injetável (testes de expiração de sessão). */
  clock?: () => Date;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  configureZodLocale();
  const { config } = deps;
  const clock = deps.clock ?? (() => new Date());
  const db = deps.db ?? createDb(deps.pool);

  const app = Fastify({
    ...(deps.logger ? { loggerInstance: deps.logger } : { logger: false }),
    // Request ID: aceita o do proxy/cliente somente se tiver formato seguro; caso contrário gera um novo.
    requestIdHeader: false,
    genReqId: (request) => {
      const provided = request.headers['x-request-id'];
      return typeof provided === 'string' && REQUEST_ID_PATTERN.test(provided) ? provided : randomUUID();
    },
    trustProxy: config.api.trustProxy,
    bodyLimit: 1_048_576,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app);

  await registerSecurity(app, { corsOrigins: config.api.corsOrigins, isProduction: config.isProduction });
  await registerOpenApi(app, { cookieSecure: config.auth.cookieSecure, serveUi: config.api.docsEnabled });

  const audit = new AuditService(db);
  const authService = new AuthService({
    db,
    passwords: deps.passwords,
    audit,
    clock,
    policy: {
      absoluteTtlMs: config.auth.sessionAbsoluteTtlHours * 3_600_000,
      idleTtlMs: config.auth.sessionIdleTtlMinutes * 60_000,
    },
  });
  registerAuth(app, {
    authService,
    csrfSecret: config.auth.csrfSecret,
    cookieSecure: config.auth.cookieSecure,
    allowedOrigins: config.api.corsOrigins,
  });

  const usersService = new UsersService({ db, passwords: deps.passwords, audit, clock });

  await app.register((scope) => healthRoutes(scope, { pool: deps.pool, redis: deps.redis }), { prefix: '/health' });
  await app.register(
    (scope) =>
      authRoutes(scope, {
        authService,
        rateLimiter: deps.rateLimiter,
        csrfSecret: config.auth.csrfSecret,
        cookieSecure: config.auth.cookieSecure,
        loginLimits: config.rateLimit.login,
        clock,
      }),
    { prefix: '/api/auth' },
  );
  await app.register((scope) => organizationsRoutes(scope, { db }), { prefix: '/api/organizations' });
  await app.register((scope) => usersRoutes(scope, { usersService }), { prefix: '/api/users' });
  await app.register((scope) => auditRoutes(scope, { db }), { prefix: '/api/audit-logs' });

  return app;
}
