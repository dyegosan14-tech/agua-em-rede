import { z } from 'zod';

export const kpiSummarySchema = z.object({
  /** Percentual estimado de redução de perdas de água (%) */
  lossesReductionPercent: z.number(),
  /** Volume total de água economizado com vazamentos eliminados (m³) */
  waterSavedM3: z.number(),
  /** Economia financeira operacional estimada (R$) com água tratada recuperada */
  costSavingsBrl: z.number(),
  /** Total de anomalias/vazamentos detectados pelo sistema */
  detectedLeaksCount: z.number().int(),
  /** Total de vazamentos confirmados e reparados por equipes de campo */
  confirmedLeaksCount: z.number().int(),
  /** Tempo Médio para Reparo (Mean Time to Repair - MTTR) em horas */
  meanTimeToRepairHours: z.number(),
  /** Taxa de disponibilidade de sensores IoT transmitindo no prazo previsto (%) */
  sensorAvailabilityRate: z.number(),
  /** Total de ordens de serviço pendentes de atendimento */
  pendingWorkOrdersCount: z.number().int(),
  /** Série de tendências dos últimos 7 dias */
  trendLast7Days: z.array(
    z.object({
      date: z.string(),
      alertsCount: z.number().int(),
      volumeSavedM3: z.number(),
    }),
  ),
});
export type KpiSummaryDto = z.infer<typeof kpiSummarySchema>;
