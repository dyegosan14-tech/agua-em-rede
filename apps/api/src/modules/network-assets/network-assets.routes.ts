import {
  errorResponseSchema,
  listNetworkAssetsQuerySchema,
  listNetworkAssetsResponseSchema,
  networkAssetSchema,
  uuidSchema,
} from '@aer/contracts';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth } from '../../plugins/auth';
import type { NetworkAssetsService } from './network-assets.service';

const idParams = z.object({ id: uuidSchema });
const readErrors = { 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema };

export async function networkAssetsRoutes(
  app: FastifyInstance,
  deps: { networkAssetsService: NetworkAssetsService },
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { networkAssetsService } = deps;

  r.get(
    '',
    {
      preValidation: [app.authenticate, app.authorize('assets:read')],
      schema: {
        tags: ['Ativos de Rede'],
        summary: 'Lista ativos da infraestrutura física (tubulações, válvulas, adutoras)',
        security: [{ cookieAuth: [] }],
        querystring: listNetworkAssetsQuerySchema,
        response: {
          200: listNetworkAssetsResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request) => networkAssetsService.list(requireAuth(request), request.query),
  );

  r.get(
    '/:id',
    {
      preValidation: [app.authenticate, app.authorize('assets:read')],
      schema: {
        tags: ['Ativos de Rede'],
        summary: 'Detalha um ativo da infraestrutura de rede',
        security: [{ cookieAuth: [] }],
        params: idParams,
        response: { 200: networkAssetSchema, 400: errorResponseSchema, ...readErrors },
      },
    },
    async (request) => networkAssetsService.get(requireAuth(request), request.params.id),
  );
}
