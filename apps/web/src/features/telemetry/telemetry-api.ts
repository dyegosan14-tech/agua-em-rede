import {
  type IngestTelemetryRequest,
  type RunSimulationRequest,
} from '@aer/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../../lib/api';

const runSimulationResponseSchema = z.object({
  runId: z.string(),
  scenario: z.string(),
  sectorCode: z.string(),
  measurementsGenerated: z.number(),
  generatedAlertId: z.string(),
});

export function useRunSimulation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RunSimulationRequest) =>
      api('/telemetry/simulate', {
        method: 'POST',
        body: input,
        schema: runSimulationResponseSchema,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['telemetry'] }),
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['analytics'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['devices'] }),
      ]);
    },
  });
}

const ingestTelemetryResponseSchema = z.object({
  ingestedCount: z.number(),
});

export function useIngestTelemetry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: IngestTelemetryRequest) =>
      api('/telemetry/ingest', {
        method: 'POST',
        body: input,
        schema: ingestTelemetryResponseSchema,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['telemetry'] }),
        queryClient.invalidateQueries({ queryKey: ['alerts'] }),
        queryClient.invalidateQueries({ queryKey: ['analytics'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['devices'] }),
      ]);
    },
  });
}
