import { dashboardSummarySchema, errorResponseSchema } from '@aer/contracts';
import { devices, organizations, sectors, users, type Db } from '@aer/database';
import { and, count, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { requireAuth } from '../../plugins/auth';

export async function dashboardRoutes(app: FastifyInstance, deps: { db: Db }): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;

  r.get(
    '/summary',
    {
      preValidation: [app.authenticate],
      schema: {
        tags: ['Dashboard'],
        summary: 'Resumo de indicadores operacionais da organização',
        security: [{ cookieAuth: [] }],
        response: { 200: dashboardSummarySchema, 401: errorResponseSchema },
      },
    },
    async (request) => {
      const auth = requireAuth(request);
      const orgId = auth.organizationId;

      const [org] = await db
        .select({ isDemo: organizations.isDemo, timezone: organizations.timezone })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);

      const [sectorsCount] = await db
        .select({ count: count() })
        .from(sectors)
        .where(and(eq(sectors.organizationId, orgId), isNull(sectors.archivedAt)));

      const [devicesCount] = await db
        .select({ count: count() })
        .from(devices)
        .where(and(eq(devices.organizationId, orgId), isNull(devices.archivedAt)));

      const [activeDevicesCount] = await db
        .select({ count: count() })
        .from(devices)
        .where(and(eq(devices.organizationId, orgId), isNull(devices.archivedAt), eq(devices.status, 'ACTIVE')));

      const [pressureSensorsCount] = await db
        .select({ count: count() })
        .from(devices)
        .where(and(eq(devices.organizationId, orgId), isNull(devices.archivedAt), eq(devices.kind, 'PRESSURE_SENSOR')));

      const [flowMetersCount] = await db
        .select({ count: count() })
        .from(devices)
        .where(and(eq(devices.organizationId, orgId), isNull(devices.archivedAt), eq(devices.kind, 'FLOW_METER')));

      const [usersCount] = await db
        .select({ count: count() })
        .from(users)
        .where(and(eq(users.organizationId, orgId), isNull(users.archivedAt)));

      return {
        sectorsCount: sectorsCount?.count ?? 0,
        devicesCount: devicesCount?.count ?? 0,
        activeDevicesCount: activeDevicesCount?.count ?? 0,
        pressureSensorsCount: pressureSensorsCount?.count ?? 0,
        flowMetersCount: flowMetersCount?.count ?? 0,
        usersCount: usersCount?.count ?? 0,
        isDemo: org?.isDemo ?? false,
        timezone: org?.timezone ?? 'America/Recife',
      };
    },
  );
}
