import {
  createMaintenanceWindowRequestSchema,
  errorResponseSchema,
  listMaintenanceWindowsQuerySchema,
  listMaintenanceWindowsResponseSchema,
  maintenanceWindowSchema,
  uuidSchema,
} from '@aer/contracts';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requestMeta } from '../../lib/request-meta';
import { requireAuth } from '../../plugins/auth';
import type { MaintenanceWindowsService } from './maintenance-windows.service';

const idParams = z.object({ id: uuidSchema });
const readErrors = { 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema };
const writeErrors = { ...readErrors, 400: errorResponseSchema };
const security = [{ cookieAuth: [], csrfToken: [] }];

export async function maintenanceWindowsRoutes(
  app: FastifyInstance,
  deps: { maintenanceWindowsService: MaintenanceWindowsService },
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { maintenanceWindowsService } = deps;

  r.get(
    '',
    {
      preValidation: [app.authenticate],
      schema: {
        tags: ['Janelas de Manutenção'],
        summary: 'Lista períodos de manutenção programada',
        security: [{ cookieAuth: [] }],
        querystring: listMaintenanceWindowsQuerySchema,
        response: { 200: listMaintenanceWindowsResponseSchema, ...readErrors },
      },
    },
    async (request) => maintenanceWindowsService.list(requireAuth(request), request.query),
  );

  r.post(
    '',
    {
      preValidation: [app.authenticate, app.authorize('maintenance-windows:write')],
      schema: {
        tags: ['Janelas de Manutenção'],
        summary: 'Agenda uma janela de manutenção para inibir falsos alarmes',
        security,
        body: createMaintenanceWindowRequestSchema,
        response: { 201: maintenanceWindowSchema, ...writeErrors },
      },
    },
    async (request, reply) => {
      const created = await maintenanceWindowsService.create(requireAuth(request), request.body, requestMeta(request));
      return reply.code(201).send(created);
    },
  );

  r.delete(
    '/:id',
    {
      preValidation: [app.authenticate, app.authorize('maintenance-windows:write')],
      schema: {
        tags: ['Janelas de Manutenção'],
        summary: 'Cancela uma janela de manutenção',
        security,
        params: idParams,
        response: { 200: z.object({ success: z.boolean() }), ...writeErrors },
      },
    },
    async (request) => maintenanceWindowsService.cancel(requireAuth(request), request.params.id, requestMeta(request)),
  );
}
