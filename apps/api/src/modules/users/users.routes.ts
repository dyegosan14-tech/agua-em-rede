import {
  createUserRequestSchema,
  errorResponseSchema,
  listUsersQuerySchema,
  listUsersResponseSchema,
  resetPasswordRequestSchema,
  revokeSessionsResponseSchema,
  updateUserRequestSchema,
  userSchema,
  uuidSchema,
} from '@aer/contracts';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requestMeta } from '../../lib/request-meta';
import { requireAuth } from '../../plugins/auth';
import type { UsersService } from './users.service';

const idParams = z.object({ id: uuidSchema });
const readErrors = { 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema };
const writeErrors = { ...readErrors, 400: errorResponseSchema, 409: errorResponseSchema };
const security = [{ cookieAuth: [], csrfToken: [] }];

export async function usersRoutes(app: FastifyInstance, deps: { usersService: UsersService }): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { usersService } = deps;

  r.get(
    '',
    {
      preValidation: [app.authenticate, app.authorize('users:read')],
      schema: {
        tags: ['Usuários'],
        summary: 'Lista usuários da organização',
        security: [{ cookieAuth: [] }],
        querystring: listUsersQuerySchema,
        response: { 200: listUsersResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema },
      },
    },
    async (request) => usersService.list(requireAuth(request), request.query),
  );

  r.get(
    '/:id',
    {
      preValidation: [app.authenticate, app.authorize('users:read')],
      schema: {
        tags: ['Usuários'],
        summary: 'Detalha um usuário da organização',
        security: [{ cookieAuth: [] }],
        params: idParams,
        response: { 200: userSchema, 400: errorResponseSchema, ...readErrors },
      },
    },
    async (request) => usersService.get(requireAuth(request), request.params.id),
  );

  r.post(
    '',
    {
      preValidation: [app.authenticate, app.authorize('users:manage')],
      schema: {
        tags: ['Usuários'],
        summary: 'Cria um usuário na organização do administrador',
        security,
        body: createUserRequestSchema,
        response: { 201: userSchema, ...writeErrors },
      },
    },
    async (request, reply) => {
      const created = await usersService.create(requireAuth(request), request.body, requestMeta(request));
      return reply.code(201).send(created);
    },
  );

  r.patch(
    '/:id',
    {
      preValidation: [app.authenticate, app.authorize('users:manage')],
      schema: {
        tags: ['Usuários'],
        summary: 'Atualiza nome, perfil ou situação (ativo/inativo) de um usuário',
        description: 'Mudar o perfil ou desativar encerra as sessões do usuário. A organização precisa manter ao menos um administrador ativo.',
        security,
        params: idParams,
        body: updateUserRequestSchema,
        response: { 200: userSchema, ...writeErrors },
      },
    },
    async (request) => usersService.update(requireAuth(request), request.params.id, request.body, requestMeta(request)),
  );

  r.post(
    '/:id/reset-password',
    {
      preValidation: [app.authenticate, app.authorize('users:manage')],
      schema: {
        tags: ['Usuários'],
        summary: 'Define uma nova senha para o usuário e encerra suas sessões',
        security,
        params: idParams,
        body: resetPasswordRequestSchema,
        response: { 200: revokeSessionsResponseSchema, ...writeErrors },
      },
    },
    async (request) => usersService.resetPassword(requireAuth(request), request.params.id, request.body, requestMeta(request)),
  );

  r.post(
    '/:id/revoke-sessions',
    {
      preValidation: [app.authenticate, app.authorize('users:manage')],
      schema: {
        tags: ['Usuários'],
        summary: 'Encerra todas as sessões ativas do usuário',
        security,
        params: idParams,
        response: { 200: revokeSessionsResponseSchema, ...readErrors },
      },
    },
    async (request) => usersService.revokeSessions(requireAuth(request), request.params.id, requestMeta(request)),
  );
}
