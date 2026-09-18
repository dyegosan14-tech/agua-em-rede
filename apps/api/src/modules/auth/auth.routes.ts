import {
  changePasswordRequestSchema,
  errorResponseSchema,
  loginRequestSchema,
  sessionResponseSchema,
  type SessionResponse,
} from '@aer/contracts';
import { permissionsFor } from '@aer/domain';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Errors } from '../../lib/errors';
import type { RateLimiter } from '../../lib/rate-limiter';
import { requestMeta } from '../../lib/request-meta';
import { csrfTokenFor, fingerprint } from '../../lib/tokens';
import { requireAuth, sessionCookieName, sessionCookieOptions } from '../../plugins/auth';
import type { AuthContext, AuthService } from './auth.service';

export interface AuthRoutesDeps {
  authService: AuthService;
  rateLimiter: RateLimiter;
  csrfSecret: string;
  cookieSecure: boolean;
  loginLimits: { maxPerIdentity: number; maxPerIp: number; windowSeconds: number };
  clock: () => Date;
}

export async function authRoutes(app: FastifyInstance, deps: AuthRoutesDeps): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const cookieName = sessionCookieName(deps.cookieSecure);

  const toSessionResponse = (context: AuthContext): SessionResponse => ({
    user: { id: context.userId, email: context.email, name: context.name, role: context.role },
    organization: context.organization,
    permissions: [...permissionsFor(context.role)],
    csrfToken: csrfTokenFor(deps.csrfSecret, context.sessionId),
    expiresAt: context.expiresAt.toISOString(),
  });

  r.post(
    '/login',
    {
      schema: {
        tags: ['Autenticação'],
        summary: 'Inicia uma sessão (cookie HttpOnly)',
        description:
          'Valida as credenciais, cria uma sessão no servidor e devolve o cookie de sessão HttpOnly. ' +
          'A resposta traz o token CSRF que deve ser enviado no cabeçalho `x-csrf-token` nas escritas.',
        body: loginRequestSchema,
        response: { 200: sessionResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema, 429: errorResponseSchema },
      },
      preHandler: async (request) => {
        // Dois limites: por IP (varredura de contas) e por IP+e-mail (força bruta de uma conta).
        // O e-mail entra na chave apenas como impressão digital (não guardamos e-mails no Redis).
        const { maxPerIp, maxPerIdentity, windowSeconds } = deps.loginLimits;
        const byIp = await deps.rateLimiter.consume(`login:ip:${request.ip}`, { max: maxPerIp, windowSeconds });
        const byIdentity = await deps.rateLimiter.consume(`login:id:${request.ip}:${fingerprint(request.body.email)}`, {
          max: maxPerIdentity,
          windowSeconds,
        });
        if (!byIp.allowed || !byIdentity.allowed) {
          throw Errors.rateLimited(Math.max(byIp.retryAfterSeconds, byIdentity.retryAfterSeconds));
        }
      },
    },
    async (request, reply) => {
      const { token, context } = await deps.authService.login(request.body, requestMeta(request));
      const maxAge = Math.max(1, Math.floor((context.expiresAt.getTime() - deps.clock().getTime()) / 1000));
      void reply.setCookie(cookieName, token, sessionCookieOptions(deps.cookieSecure, maxAge));
      return toSessionResponse(context);
    },
  );

  r.get(
    '/me',
    {
      preValidation: [app.authenticate],
      schema: {
        tags: ['Autenticação'],
        summary: 'Sessão atual (usuário, organização, permissões e token CSRF)',
        security: [{ cookieAuth: [] }],
        response: { 200: sessionResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => toSessionResponse(requireAuth(request)),
  );

  r.post(
    '/logout',
    {
      preValidation: [app.authenticate],
      schema: {
        tags: ['Autenticação'],
        summary: 'Encerra (revoga) a sessão atual',
        security: [{ cookieAuth: [], csrfToken: [] }],
        response: { 204: z.null(), 401: errorResponseSchema, 403: errorResponseSchema },
      },
    },
    async (request, reply) => {
      await deps.authService.logout(requireAuth(request), requestMeta(request));
      void reply.clearCookie(cookieName, sessionCookieOptions(deps.cookieSecure));
      return reply.code(204).send(null);
    },
  );

  r.post(
    '/change-password',
    {
      preValidation: [
        app.authenticate,
        async (request) => {
          // A troca exige a senha atual: limita tentativas por usuário (sessão furtada não vira força bruta).
          const decision = await deps.rateLimiter.consume(`pwchange:${requireAuth(request).userId}`, {
            max: deps.loginLimits.maxPerIdentity,
            windowSeconds: deps.loginLimits.windowSeconds,
          });
          if (!decision.allowed) throw Errors.rateLimited(decision.retryAfterSeconds);
        },
      ],
      schema: {
        tags: ['Autenticação'],
        summary: 'Altera a própria senha e encerra as demais sessões',
        security: [{ cookieAuth: [], csrfToken: [] }],
        body: changePasswordRequestSchema,
        response: {
          200: z.object({ revokedSessions: z.number().int() }),
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    async (request) => deps.authService.changePassword(requireAuth(request), request.body, requestMeta(request)),
  );
}
