import {
  deviceIngestTelemetryRequestSchema,
  errorResponseSchema,
  ingestTelemetryRequestSchema,
  listMeasurementsQuerySchema,
  listMeasurementsResponseSchema,
  runSimulationRequestSchema,
} from '@aer/contracts';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requestMeta } from '../../lib/request-meta';
import { requireAuth } from '../../plugins/auth';
import type { TelemetryService } from './telemetry.service';

const ingestResponseSchema = z.object({ ingestedCount: z.number().int() });
const simulationResponseSchema = z.object({
  runId: z.string(),
  scenario: z.string(),
  sectorCode: z.string(),
  measurementsGenerated: z.number().int(),
  generatedAlertId: z.string(),
});

export async function telemetryRoutes(app: FastifyInstance, deps: { telemetryService: TelemetryService }): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { telemetryService } = deps;

  r.get(
    '',
    {
      preValidation: [app.authenticate, app.authorize('telemetry:read')],
      schema: {
        tags: ['Telemetria'],
        summary: 'Consulta histórico de medições de pressão e vazão',
        security: [{ cookieAuth: [] }],
        querystring: listMeasurementsQuerySchema,
        response: { 200: listMeasurementsResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => telemetryService.list(requireAuth(request), request.query),
  );

  r.post(
    '/ingest',
    {
      preValidation: [app.authenticate, app.authorize('telemetry:import')],
      schema: {
        tags: ['Telemetria'],
        summary: 'Ingestão em lote de medições de campo',
        security: [{ cookieAuth: [], csrfToken: [] }],
        body: ingestTelemetryRequestSchema,
        response: { 200: ingestResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => telemetryService.ingest(requireAuth(request), request.body, requestMeta(request)),
  );

  r.post(
    '/simulate',
    {
      preValidation: [app.authenticate, app.authorize('simulator:run')],
      schema: {
        tags: ['Telemetria'],
        summary: 'Dispara simulação com injeção de evento de vazamento para calibração',
        security: [{ cookieAuth: [], csrfToken: [] }],
        body: runSimulationRequestSchema,
        response: { 200: simulationResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => telemetryService.runSimulation(requireAuth(request), request.body, requestMeta(request)),
  );

  r.post(
    '/device-ingest',
    {
      schema: {
        tags: ['Telemetria'],
        summary: 'Ingestão direta de telemetria para sensores e gateways IoT via chave de dispositivo',
        headers: z.object({
          'x-device-key': z.string().min(10, 'Informe o cabeçalho X-Device-Key com a chave do sensor.'),
        }),
        body: deviceIngestTelemetryRequestSchema,
        response: { 200: ingestResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request) => {
      const deviceKey = request.headers['x-device-key'];
      return telemetryService.ingestFromDevice(deviceKey, request.body, requestMeta(request));
    },
  );
}

