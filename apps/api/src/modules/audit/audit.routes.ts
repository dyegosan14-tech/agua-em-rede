import { errorResponseSchema, listAuditLogsQuerySchema, listAuditLogsResponseSchema } from '@aer/contracts';
import type { Db } from '@aer/database';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Errors } from '../../lib/errors';
import { requireAuth } from '../../plugins/auth';
import { decodeCursor, encodeCursor, listAuditLogs } from './audit.repository';

export async function auditRoutes(app: FastifyInstance, deps: { db: Db }): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '',
    {
      preValidation: [app.authenticate, app.authorize('audit:read')],
      schema: {
        tags: ['Auditoria'],
        summary: 'Lista a trilha de auditoria da organização (mais recentes primeiro)',
        security: [{ cookieAuth: [] }],
        querystring: listAuditLogsQuerySchema,
        response: { 200: listAuditLogsResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema },
      },
    },
    async (request) => {
      const query = request.query;
      const cursor = query.cursor ? decodeCursor(query.cursor) : null;
      if (query.cursor && !cursor) throw Errors.validation('Cursor inválido.');

      const rows = await listAuditLogs(deps.db, requireAuth(request).organizationId, query, cursor);
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => ({
          id: row.id,
          action: row.action,
          actorUserId: row.actorUserId,
          actorName: row.actorName,
          entityType: row.entityType,
          entityId: row.entityId,
          requestId: row.requestId,
          ip: row.ip,
          metadata: row.metadata,
          createdAt: row.createdAt.toISOString(),
        })),
        nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
      };
    },
  );
}
