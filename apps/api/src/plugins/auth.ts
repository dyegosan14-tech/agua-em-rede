import { CSRF_HEADER } from '@aer/contracts';
import { hasPermission, type Permission } from '@aer/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Errors } from '../lib/errors';
import { csrfTokenFor, safeEqual } from '../lib/tokens';
import type { AuthContext, AuthService } from '../modules/auth/auth.service';

declare module 'fastify' {
  interface FastifyRequest {
    /** Preenchido por `app.authenticate`. A organização SEMPRE vem daqui, nunca do corpo/URL da requisição. */
    auth: AuthContext | null;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (permission: Permission) => (request: FastifyRequest) => Promise<void>;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Em produção o cookie é Secure e usa o prefixo __Host- (sem Domain, Path=/), imune a sobrescrita por subdomínios. */
export function sessionCookieName(secure: boolean): string {
  return secure ? '__Host-aer_session' : 'aer_session';
}

export function sessionCookieOptions(secure: boolean, maxAgeSeconds?: number) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: '/',
    ...(maxAgeSeconds === undefined ? {} : { maxAge: maxAgeSeconds }),
  };
}

export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw Errors.unauthenticated();
  return request.auth;
}

export interface AuthPluginOptions {
  authService: AuthService;
  csrfSecret: string;
  cookieSecure: boolean;
  allowedOrigins: readonly string[];
}

export function registerAuth(app: FastifyInstance, options: AuthPluginOptions): void {
  const cookieName = sessionCookieName(options.cookieSecure);
  const allowedOrigins = new Set(options.allowedOrigins);

  app.decorateRequest('auth', null);

  // Defesa em profundidade contra CSRF: se o navegador informa a origem, ela precisa ser conhecida.
  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    if (origin !== undefined && !allowedOrigins.has(origin)) throw Errors.originNotAllowed();
  });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[cookieName];
    const context = token ? await options.authService.resolveSession(token) : null;
    if (!context) {
      if (token) void reply.clearCookie(cookieName, sessionCookieOptions(options.cookieSecure));
      throw Errors.unauthenticated();
    }

    if (!SAFE_METHODS.has(request.method)) {
      const provided = request.headers[CSRF_HEADER];
      const expected = csrfTokenFor(options.csrfSecret, context.sessionId);
      if (typeof provided !== 'string' || !safeEqual(provided, expected)) throw Errors.csrfInvalid();
    }
    request.auth = context;
  });

  app.decorate('authorize', (permission: Permission) => async (request: FastifyRequest) => {
    const auth = requireAuth(request);
    if (!hasPermission(auth.role, permission)) throw Errors.forbidden();
  });
}
