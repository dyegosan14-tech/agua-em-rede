import {
  alertDtoSchema,
  errorResponseSchema,
  listAlertsQuerySchema,
  listAlertsResponseSchema,
  transitionAlertRequestSchema,
  uuidSchema,
} from '@aer/contracts';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requestMeta } from '../../lib/request-meta';
import { requireAuth } from '../../plugins/auth';
import type { AlertsService } from './alerts.service';

const idParams = z.object({ id: uuidSchema });
const readErrors = { 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema };
const writeErrors = { ...readErrors, 400: errorResponseSchema };

export async function alertsRoutes(app: FastifyInstance, deps: { alertsService: AlertsService }): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { alertsService } = deps;

  r.get(
    '',
    {
      preValidation: [app.authenticate, app.authorize('alerts:read')],
      schema: {
        tags: ['Alertas'],
        summary: 'Lista alertas de anomalias e possíveis vazamentos na rede',
        security: [{ cookieAuth: [] }],
        querystring: listAlertsQuerySchema,
        response: { 200: listAlertsResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => alertsService.list(requireAuth(request), request.query),
  );

  r.get(
    '/:id',
    {
      preValidation: [app.authenticate, app.authorize('alerts:read')],
      schema: {
        tags: ['Alertas'],
        summary: 'Detalha um alerta com evidências telemétricas',
        security: [{ cookieAuth: [] }],
        params: idParams,
        response: { 200: alertDtoSchema, 400: errorResponseSchema, ...readErrors },
      },
    },
    async (request) => alertsService.get(requireAuth(request), request.params.id),
  );

  r.post(
    '/:id/transition',
    {
      preValidation: [app.authenticate, app.authorize('alerts:transition')],
      schema: {
        tags: ['Alertas'],
        summary: 'Transiciona status do alerta (Reconhecer, Investigar, Resolver ou Descartar)',
        security: [{ cookieAuth: [], csrfToken: [] }],
        params: idParams,
        body: transitionAlertRequestSchema,
        response: { 200: alertDtoSchema, ...writeErrors },
      },
    },
    async (request) => alertsService.transition(requireAuth(request), request.params.id, request.body, requestMeta(request)),
  );
}
