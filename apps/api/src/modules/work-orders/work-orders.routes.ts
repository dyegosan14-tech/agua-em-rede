import {
  createWorkOrderRequestSchema,
  errorResponseSchema,
  listWorkOrdersQuerySchema,
  listWorkOrdersResponseSchema,
  updateWorkOrderRequestSchema,
  uuidSchema,
  workOrderDtoSchema,
} from '@aer/contracts';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requestMeta } from '../../lib/request-meta';
import { requireAuth } from '../../plugins/auth';
import type { WorkOrdersService } from './work-orders.service';

const idParams = z.object({ id: uuidSchema });
const readErrors = { 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema };
const writeErrors = { ...readErrors, 400: errorResponseSchema };

export async function workOrdersRoutes(app: FastifyInstance, deps: { workOrdersService: WorkOrdersService }): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { workOrdersService } = deps;

  r.get(
    '',
    {
      preValidation: [app.authenticate],
      schema: {
        tags: ['Ordens de Serviço'],
        summary: 'Lista ordens de serviço de manutenção e reparo de vazamentos',
        security: [{ cookieAuth: [] }],
        querystring: listWorkOrdersQuerySchema,
        response: { 200: listWorkOrdersResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      // Se for técnico, filtra ordens atribuídas se não tiver work-orders:read
      const query = request.query;
      if (auth.role === 'TECHNICIAN' && !query.assignedTo) {
        query.assignedTo = auth.userId;
      }
      return workOrdersService.list(auth, query);
    },
  );

  r.get(
    '/:id',
    {
      preValidation: [app.authenticate],
      schema: {
        tags: ['Ordens de Serviço'],
        summary: 'Detalha uma ordem de serviço com histórico de reparos e volume',
        security: [{ cookieAuth: [] }],
        params: idParams,
        response: { 200: workOrderDtoSchema, 400: errorResponseSchema, ...readErrors },
      },
    },
    async (request) => workOrdersService.get(requireAuth(request), request.params.id),
  );

  r.post(
    '',
    {
      preValidation: [app.authenticate, app.authorize('work-orders:create')],
      schema: {
        tags: ['Ordens de Serviço'],
        summary: 'Abre uma nova ordem de serviço de campo',
        security: [{ cookieAuth: [], csrfToken: [] }],
        body: createWorkOrderRequestSchema,
        response: { 201: workOrderDtoSchema, ...writeErrors },
      },
    },
    async (request, reply) => {
      const created = await workOrdersService.create(requireAuth(request), request.body, requestMeta(request));
      return reply.code(201).send(created);
    },
  );

  r.patch(
    '/:id',
    {
      preValidation: [app.authenticate],
      schema: {
        tags: ['Ordens de Serviço'],
        summary: 'Atualiza situação, diagnóstico, notas ou volume economizado',
        security: [{ cookieAuth: [], csrfToken: [] }],
        params: idParams,
        body: updateWorkOrderRequestSchema,
        response: { 200: workOrderDtoSchema, ...writeErrors },
      },
    },
    async (request) => workOrdersService.update(requireAuth(request), request.params.id, request.body, requestMeta(request)),
  );
}
