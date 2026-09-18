import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';

export interface SecurityOptions {
  corsOrigins: readonly string[];
  isProduction: boolean;
}

export async function registerSecurity(app: FastifyInstance, options: SecurityOptions): Promise<void> {
  await app.register(helmet, {
    // A API só serve JSON: nada pode ser carregado nem embutido a partir dela.
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: options.isProduction ? { maxAge: 15_552_000, includeSubDomains: true } : false,
  });

  await app.register(cors, {
    // Lista explícita; qualquer outra origem não recebe cabeçalhos CORS.
    origin: [...options.corsOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-csrf-token', 'x-request-id'],
    exposedHeaders: ['x-request-id', 'retry-after'],
    maxAge: 600,
  });

  await app.register(cookie);

  // Respostas autenticadas nunca devem ser guardadas por caches intermediários ou pelo navegador.
  app.addHook('onSend', async (request, reply) => {
    if (request.url.startsWith('/api/') && !request.url.startsWith('/api/docs')) {
      void reply.header('cache-control', 'no-store');
    }
    void reply.header('x-request-id', request.id);
  });
}
