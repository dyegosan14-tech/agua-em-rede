import { z } from 'zod';

export const livenessResponseSchema = z.object({ status: z.literal('ok') });

export const readinessResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({
    database: z.enum(['up', 'down']),
    /** "disabled": processo iniciado sem Redis (somente desenvolvimento/testes). */
    redis: z.enum(['up', 'down', 'disabled']),
  }),
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
