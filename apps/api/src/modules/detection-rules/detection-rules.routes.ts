import {
  createDetectionRuleRequestSchema,
  detectionRuleSchema,
  errorResponseSchema,
  listDetectionRulesQuerySchema,
  listDetectionRulesResponseSchema,
} from '@aer/contracts';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requestMeta } from '../../lib/request-meta';
import { requireAuth } from '../../plugins/auth';
import type { DetectionRulesService } from './detection-rules.service';

const readErrors = { 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema };
const writeErrors = { ...readErrors, 400: errorResponseSchema };
const security = [{ cookieAuth: [], csrfToken: [] }];

export async function detectionRulesRoutes(
  app: FastifyInstance,
  deps: { detectionRulesService: DetectionRulesService },
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { detectionRulesService } = deps;

  r.get(
    '',
    {
      preValidation: [app.authenticate, app.authorize('rules:read')],
      schema: {
        tags: ['Regras de Detecção'],
        summary: 'Lista regras de detecção de vazamentos e anomalias hidráulicas',
        security: [{ cookieAuth: [] }],
        querystring: listDetectionRulesQuerySchema,
        response: { 200: listDetectionRulesResponseSchema, ...readErrors },
      },
    },
    async (request) => detectionRulesService.list(requireAuth(request), request.query),
  );

  r.post(
    '',
    {
      preValidation: [app.authenticate, app.authorize('rules:write')],
      schema: {
        tags: ['Regras de Detecção'],
        summary: 'Cadastra uma nova regra de detecção personalizada',
        security,
        body: createDetectionRuleRequestSchema,
        response: { 201: detectionRuleSchema, ...writeErrors },
      },
    },
    async (request, reply) => {
      const created = await detectionRulesService.create(requireAuth(request), request.body, requestMeta(request));
      return reply.code(201).send(created);
    },
  );
}
