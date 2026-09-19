import {
  createSectorRequestSchema,
  errorResponseSchema,
  listSectorsQuerySchema,
  listSectorsResponseSchema,
  sectorSchema,
  updateSectorRequestSchema,
  uuidSchema,
} from '@aer/contracts';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requestMeta } from '../../lib/request-meta';
import { requireAuth } from '../../plugins/auth';
import type { SectorsService } from './sectors.service';

const idParams = z.object({ id: uuidSchema });
const readErrors = { 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema };
const writeErrors = { ...readErrors, 400: errorResponseSchema, 409: errorResponseSchema };
const security = [{ cookieAuth: [], csrfToken: [] }];

export async function sectorsRoutes(app: FastifyInstance, deps: { sectorsService: SectorsService }): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { sectorsService } = deps;

  r.get(
    '',
    {
      preValidation: [app.authenticate, app.authorize('sectors:read')],
      schema: {
        tags: ['Setores'],
        summary: 'Lista setores de abastecimento da organização',
        security: [{ cookieAuth: [] }],
        querystring: listSectorsQuerySchema,
        response: { 200: listSectorsResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema },
      },
    },
    async (request) => sectorsService.list(requireAuth(request), request.query),
  );

  r.get(
    '/:id',
    {
      preValidation: [app.authenticate, app.authorize('sectors:read')],
      schema: {
        tags: ['Setores'],
        summary: 'Detalha um setor de abastecimento',
        security: [{ cookieAuth: [] }],
        params: idParams,
        response: { 200: sectorSchema, 400: errorResponseSchema, ...readErrors },
      },
    },
    async (request) => sectorsService.get(requireAuth(request), request.params.id),
  );

  r.post(
    '',
    {
      preValidation: [app.authenticate, app.authorize('sectors:write')],
      schema: {
        tags: ['Setores'],
        summary: 'Cadastra um novo setor de abastecimento',
        security,
        body: createSectorRequestSchema,
        response: { 201: sectorSchema, ...writeErrors },
      },
    },
    async (request, reply) => {
      const created = await sectorsService.create(requireAuth(request), request.body, requestMeta(request));
      return reply.code(201).send(created);
    },
  );

  r.patch(
    '/:id',
    {
      preValidation: [app.authenticate, app.authorize('sectors:write')],
      schema: {
        tags: ['Setores'],
        summary: 'Atualiza dados cadastrais ou horários de abastecimento de um setor',
        security,
        params: idParams,
        body: updateSectorRequestSchema,
        response: { 200: sectorSchema, ...writeErrors },
      },
    },
    async (request) => sectorsService.update(requireAuth(request), request.params.id, request.body, requestMeta(request)),
  );
}
