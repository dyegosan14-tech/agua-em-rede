import {
  createDeviceRequestSchema,
  deviceSchema,
  errorResponseSchema,
  listDevicesQuerySchema,
  listDevicesResponseSchema,
  updateDeviceRequestSchema,
  uuidSchema,
} from '@aer/contracts';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requestMeta } from '../../lib/request-meta';
import { requireAuth } from '../../plugins/auth';
import type { DevicesService } from './devices.service';

const idParams = z.object({ id: uuidSchema });
const readErrors = { 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema };
const writeErrors = { ...readErrors, 400: errorResponseSchema, 409: errorResponseSchema };
const security = [{ cookieAuth: [], csrfToken: [] }];

export async function devicesRoutes(app: FastifyInstance, deps: { devicesService: DevicesService }): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { devicesService } = deps;

  r.get(
    '',
    {
      preValidation: [app.authenticate, app.authorize('devices:read')],
      schema: {
        tags: ['Dispositivos'],
        summary: 'Lista dispositivos de medição da organização',
        security: [{ cookieAuth: [] }],
        querystring: listDevicesQuerySchema,
        response: { 200: listDevicesResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema },
      },
    },
    async (request) => devicesService.list(requireAuth(request), request.query),
  );

  r.get(
    '/:id',
    {
      preValidation: [app.authenticate, app.authorize('devices:read')],
      schema: {
        tags: ['Dispositivos'],
        summary: 'Detalha um dispositivo de medição',
        security: [{ cookieAuth: [] }],
        params: idParams,
        response: { 200: deviceSchema, 400: errorResponseSchema, ...readErrors },
      },
    },
    async (request) => devicesService.get(requireAuth(request), request.params.id),
  );

  r.post(
    '',
    {
      preValidation: [app.authenticate, app.authorize('devices:write')],
      schema: {
        tags: ['Dispositivos'],
        summary: 'Cadastra um novo sensor ou medidor',
        security,
        body: createDeviceRequestSchema,
        response: { 201: deviceSchema, ...writeErrors },
      },
    },
    async (request, reply) => {
      const created = await devicesService.create(requireAuth(request), request.body, requestMeta(request));
      return reply.code(201).send(created);
    },
  );

  r.patch(
    '/:id',
    {
      preValidation: [app.authenticate, app.authorize('devices:write')],
      schema: {
        tags: ['Dispositivos'],
        summary: 'Atualiza dados de um dispositivo ou situação operacional',
        security,
        params: idParams,
        body: updateDeviceRequestSchema,
        response: { 200: deviceSchema, ...writeErrors },
      },
    },
    async (request) => devicesService.update(requireAuth(request), request.params.id, request.body, requestMeta(request)),
  );

  r.post(
    '/:id/credentials',
    {
      preValidation: [app.authenticate, app.authorize('devices:credentials')],
      schema: {
        tags: ['Dispositivos'],
        summary: 'Gera uma nova chave de acesso IoT para o dispositivo (exibida uma única vez)',
        security,
        params: idParams,
        body: z.object({ label: z.string().trim().max(100).optional() }),
        response: {
          201: z.object({
            id: uuidSchema,
            deviceId: uuidSchema,
            secret: z.string(),
            label: z.string().nullable(),
            createdAt: z.string(),
          }),
          ...writeErrors,
        },
      },
    },
    async (request, reply) => {
      const created = await devicesService.createCredential(
        requireAuth(request),
        request.params.id,
        requestMeta(request),
        request.body.label,
      );
      return reply.code(201).send(created);
    },
  );

  r.get(
    '/:id/credentials',
    {
      preValidation: [app.authenticate, app.authorize('devices:read')],
      schema: {
        tags: ['Dispositivos'],
        summary: 'Lista credenciais ativas e revogadas do dispositivo',
        security: [{ cookieAuth: [] }],
        params: idParams,
        response: {
          200: z.array(
            z.object({
              id: uuidSchema,
              deviceId: uuidSchema,
              label: z.string().nullable(),
              createdAt: z.string(),
              expiresAt: z.string().nullable(),
              revokedAt: z.string().nullable(),
              lastUsedAt: z.string().nullable(),
            }),
          ),
          ...readErrors,
        },
      },
    },
    async (request) => devicesService.listCredentials(requireAuth(request), request.params.id),
  );

  r.delete(
    '/:id/credentials/:credentialId',
    {
      preValidation: [app.authenticate, app.authorize('devices:credentials')],
      schema: {
        tags: ['Dispositivos'],
        summary: 'Revoga imediatamente uma chave de acesso IoT',
        security,
        params: idParams.extend({ credentialId: uuidSchema }),
        response: { 200: z.object({ success: z.boolean() }), ...writeErrors },
      },
    },
    async (request) =>
      devicesService.revokeCredential(
        requireAuth(request),
        request.params.id,
        request.params.credentialId,
        requestMeta(request),
      ),
  );
}

