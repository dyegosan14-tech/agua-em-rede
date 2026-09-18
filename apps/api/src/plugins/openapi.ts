import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { sessionCookieName } from './auth';

export interface OpenApiOptions {
  cookieSecure: boolean;
  /** Serve a Swagger UI em /api/docs. O documento OpenAPI é sempre gerado (usado por `npm run openapi`). */
  serveUi: boolean;
}

export async function registerOpenApi(app: FastifyInstance, options: OpenApiOptions): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Água em Rede — API',
        version: '0.1.0',
        description:
          'API do MVP de monitoramento e redução de perdas na distribuição de água.\n\n' +
          '**Autenticação:** sessão no servidor com cookie HttpOnly. Em requisições de escrita envie também o token CSRF ' +
          '(retornado por `POST /api/auth/login` e `GET /api/auth/me`) no cabeçalho `x-csrf-token`.\n\n' +
          '**Erros:** sempre no formato `{ "error": { "code", "message", "requestId", "details?" } }`.',
      },
      tags: [
        { name: 'Autenticação' },
        { name: 'Organizações' },
        { name: 'Usuários' },
        { name: 'Auditoria' },
        { name: 'Operação' },
      ],
      components: {
        securitySchemes: {
          cookieAuth: { type: 'apiKey', in: 'cookie', name: sessionCookieName(options.cookieSecure) },
          csrfToken: { type: 'apiKey', in: 'header', name: 'x-csrf-token' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  if (options.serveUi) {
    await app.register(swaggerUi, { routePrefix: '/api/docs', uiConfig: { docExpansion: 'list', deepLinking: false } });
  }
}
