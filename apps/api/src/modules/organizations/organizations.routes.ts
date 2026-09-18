import { errorResponseSchema, organizationResponseSchema } from '@aer/contracts';
import { organizations, type Db } from '@aer/database';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Errors } from '../../lib/errors';
import { requireAuth } from '../../plugins/auth';

export async function organizationsRoutes(app: FastifyInstance, deps: { db: Db }): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/current',
    {
      preValidation: [app.authenticate, app.authorize('org:read')],
      schema: {
        tags: ['Organizações'],
        summary: 'Organização da sessão autenticada',
        security: [{ cookieAuth: [] }],
        response: { 200: organizationResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request) => {
      // O id vem da sessão. Não existe rota que aceite organizationId do cliente.
      const [organization] = await deps.db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          isDemo: organizations.isDemo,
          timezone: organizations.timezone,
        })
        .from(organizations)
        .where(eq(organizations.id, requireAuth(request).organizationId))
        .limit(1);
      if (!organization) throw Errors.notFound('Organização');
      return organization;
    },
  );
}
