import { z } from 'zod';

export const dashboardSummarySchema = z.object({
  sectorsCount: z.number().int(),
  devicesCount: z.number().int(),
  activeDevicesCount: z.number().int(),
  pressureSensorsCount: z.number().int(),
  flowMetersCount: z.number().int(),
  usersCount: z.number().int(),
  isDemo: z.boolean(),
  timezone: z.string(),
});
export type DashboardSummaryDto = z.infer<typeof dashboardSummarySchema>;
