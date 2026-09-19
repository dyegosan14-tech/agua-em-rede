import { useState } from 'react';
import {
  CheckCircle,
  Clock,
  DollarSign,
  Droplets,
  Gauge,
  Play,
  Sparkles,
  Target,
  TrendingDown,
} from 'lucide-react';
import type { SimulationScenario } from '@aer/domain';
import { hasPermission } from '@aer/domain';
import { ErrorState, FreshnessNote, LoadingState } from '../../components/states';
import { Badge, Button, PageHeader, SelectField } from '../../components/ui';
import { useSession } from '../auth/session';
import { useRunSimulation } from '../telemetry/telemetry-api';
import { useKpiSummary } from './analytics-api';

export function AnalyticsPage() {
  const { data: session } = useSession();
  const { data, isLoading, isError, error, refetch, dataUpdatedAt, isFetching } = useKpiSummary();

  const [simScenario, setSimScenario] = useState<SimulationScenario>('COMBINED_EVENT');
  const [simDuration, setSimDuration] = useState<number>(24);
  const [lastSimResult, setLastSimResult] = useState<{
    scenario: string;
    measurementsGenerated: number;
    generatedAlertId: string;
  } | null>(null);

  const simulationMutation = useRunSimulation();

  if (!session) return null;
  const canSimulate = hasPermission(session.user.role, 'simulator:run');

  const handleExecuteSimulation = async () => {
    try {
      const res = await simulationMutation.mutateAsync({
        scenario: simScenario,
        durationHours: simDuration,
      });
      setLastSimResult(res);
      await refetch();
    } catch {
      // erro tratado no feedback de mutação
    }
  };

  const targetPercent = 30.0;
  const currentReduction = data?.lossesReductionPercent ?? 0;
  const targetProgress = Math.min(100, Math.round((currentReduction / targetPercent) * 100));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Painel Estratégico de Indicadores & Redução de Perdas"
        description="Acompanhamento dos indicadores de sustentabilidade hídrica da Região Metropolitana do Recife."
      />

      {isLoading ? (
        <LoadingState label="Consolidando indicadores em tempo real…" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => { void refetch(); }} />
      ) : data ? (
        <>
          {/* Card Hero: Meta de Redução de 30% */}
          <div className="relative overflow-hidden rounded-2xl border border-brand-800 bg-gradient-to-br from-brand-900 via-brand-950 to-slate-950 p-6 text-white shadow-xl lg:p-8">
            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2 max-w-xl">
                <div className="inline-flex items-center gap-2 rounded-full bg-brand-800/80 px-3 py-1 text-xs font-semibold text-aqua-300 ring-1 ring-aqua-400/30">
                  <Target className="size-3.5" />
                  Meta Estratégica do Recife
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Redução de Perdas de Água: Alvo de 30%
                </h2>
                <p className="text-sm text-brand-100/90 leading-relaxed">
                  Monitoramento contínuo das vazões noturnas mínimas, modulação de pressão e rápida contenção de rompimentos para preservação dos mananciais e equilíbrio financeiro.
                </p>
              </div>

              <div className="flex flex-col items-center rounded-xl bg-white/10 p-5 backdrop-blur-xs ring-1 ring-white/10 lg:min-w-64">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-aqua-300">
                    {currentReduction.toFixed(1)}%
                  </span>
                  <span className="text-sm font-medium text-brand-200">/ 30.0%</span>
                </div>
                <div className="mt-1 text-xs font-semibold text-brand-100">
                  {targetProgress >= 100 ? 'Meta Superada!' : `${targetProgress}% do objetivo atingido`}
                </div>
                <div className="mt-3 h-2.5 w-full rounded-full bg-brand-950/60 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-aqua-400 to-emerald-400 transition-all duration-1000"
                    style={{ width: `${targetProgress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Grid dos 5 Indicadores de Sucesso do Desafio */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {/* 1. Percentual de Redução */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Redução de Perdas
                </span>
                <span className="rounded-lg bg-brand-50 p-2 text-brand-700">
                  <TrendingDown className="size-5" />
                </span>
              </div>
              <div className="mt-3 text-2xl font-bold text-slate-900">
                {data.lossesReductionPercent.toFixed(1)}%
              </div>
              <p className="mt-1 text-xs text-slate-500">Meta: 30% de perdas eliminadas</p>
            </div>

            {/* 2. Volume Economizado */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Volume Economizado
                </span>
                <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                  <Droplets className="size-5" />
                </span>
              </div>
              <div className="mt-3 text-2xl font-bold text-slate-900">
                {data.waterSavedM3.toLocaleString('pt-BR')} <span className="text-base font-normal text-slate-500">m³</span>
              </div>
              <p className="mt-1 text-xs text-emerald-600 font-medium">Água tratada preservada</p>
            </div>

            {/* 3. Economia Financeira */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Economia Operacional
                </span>
                <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
                  <DollarSign className="size-5" />
                </span>
              </div>
              <div className="mt-3 text-2xl font-bold text-slate-900">
                R$ {data.costSavingsBrl.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <p className="mt-1 text-xs text-slate-500">Base R$ 3,50 / m³ tratado</p>
            </div>

            {/* 4. Vazamentos Detectados */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  Vazamentos Sanados
                </span>
                <span className="rounded-lg bg-purple-50 p-2 text-purple-700">
                  <CheckCircle className="size-5" />
                </span>
              </div>
              <div className="mt-3 text-2xl font-bold text-slate-900">
                {data.confirmedLeaksCount}{' '}
                <span className="text-sm font-normal text-slate-500">
                  de {data.detectedLeaksCount} detectados
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Eficiência de detecção</p>
            </div>

            {/* 5. MTTR (Tempo Médio de Reparo) */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-slate-500">
                  MTTR (Tempo de Resposta)
                </span>
                <span className="rounded-lg bg-rose-50 p-2 text-rose-700">
                  <Clock className="size-5" />
                </span>
              </div>
              <div className="mt-3 text-2xl font-bold text-slate-900">
                {data.meanTimeToRepairHours.toFixed(1)}{' '}
                <span className="text-base font-normal text-slate-500">horas</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Da detecção ao reparo</p>
            </div>
          </div>

          {/* Seção Secundária: Disponibilidade e Simulador Interativo */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Disponibilidade da Rede IoT */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Gauge className="size-5 text-brand-700" />
                Disponibilidade dos Sensores IoT
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Percentual de transmissores de pressão e vazão ativos nas últimas 24h.
              </p>

              <div className="mt-6 flex items-center justify-between">
                <div className="text-3xl font-extrabold text-brand-800">
                  {data.sensorAvailabilityRate.toFixed(1)}%
                </div>
                <Badge tone={data.sensorAvailabilityRate >= 95 ? 'ok' : 'warn'}>
                  {data.sensorAvailabilityRate >= 95 ? 'Rede Confiável' : 'Requer Atenção'}
                </Badge>
              </div>

              <div className="mt-3 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-600"
                  style={{ width: `${data.sensorAvailabilityRate}%` }}
                />
              </div>

              <div className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-600">
                <div className="flex justify-between py-1">
                  <span>Ordens de Serviço em Aberto:</span>
                  <span className="font-bold text-slate-900">{data.pendingWorkOrdersCount}</span>
                </div>
              </div>
            </div>

            {/* Simulador Interativo de Rompimentos & Anomalias */}
            <div className="lg:col-span-2 rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50/50 to-white p-6 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-brand-950">
                  <Sparkles className="size-5 text-brand-700" />
                  Simulador de Eventos de Rede & Validação em Tempo Real
                </div>
                <Badge tone="info">Ambiente de Testes</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Injeta medições sintéticas calibradas com a física hidráulica de Recife para validar a resposta das regras e cálculo automático de indicadores.
              </p>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SelectField
                  label="Cenário de Teste"
                  value={simScenario}
                  onChange={(e) => setSimScenario(e.target.value as SimulationScenario)}
                >
                  <option value="COMBINED_EVENT">Rompimento Oculto (Vazão Alta + Queda de Pressão)</option>
                  <option value="PRESSURE_DROP">Despressurização Crítica</option>
                  <option value="GRADUAL_FLOW_INCREASE">Vazamento Lento em Evolução</option>
                  <option value="NORMAL_OPERATION">Operação Estável (Linha de Base)</option>
                </SelectField>

                <SelectField
                  label="Janela de Simulação"
                  value={simDuration}
                  onChange={(e) => setSimDuration(Number(e.target.value))}
                >
                  <option value={12}>12 horas</option>
                  <option value={24}>24 horas (Ciclo diurno completo)</option>
                  <option value={48}>48 horas</option>
                </SelectField>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 pt-4">
                <div className="text-xs text-slate-500">
                  {lastSimResult ? (
                    <span className="text-emerald-700 font-medium">
                      Simulação executada! {lastSimResult.measurementsGenerated} leituras geradas e alerta vinculado.
                    </span>
                  ) : (
                    'Pronto para injetar série temporal com detecção automática.'
                  )}
                </div>

                {canSimulate && (
                  <Button
                    loading={simulationMutation.isPending}
                    loadingLabel="Executando Simulação…"
                    onClick={() => {
                      void handleExecuteSimulation();
                    }}
                  >
                    <Play className="size-4" />
                    Disparar Simulação Agora
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Histórico e Tendência dos Últimos 7 Dias */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <h3 className="text-base font-bold text-slate-900">
              Tendência de Alertas e Volume Salvo (Últimos 7 Dias)
            </h3>
            <p className="text-xs text-slate-500">
              Consolidação diária de detecções e recuperação de recursos hídricos.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                  <tr>
                    <th className="px-4 py-2.5">Data</th>
                    <th className="px-4 py-2.5">Alertas Gerados</th>
                    <th className="px-4 py-2.5">Volume Salvo</th>
                    <th className="px-4 py-2.5">Economia Estimada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.trendLast7Days.map((t) => (
                    <tr key={t.date} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{t.date}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
                          {t.alertsCount} alerta(s)
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-emerald-700">
                        {t.volumeSavedM3 > 0 ? `+${t.volumeSavedM3.toLocaleString('pt-BR')} m³` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {t.volumeSavedM3 > 0
                          ? `R$ ${(t.volumeSavedM3 * 3.5).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <FreshnessNote
            updatedAt={dataUpdatedAt}
            isFetching={isFetching}
            failed={isError}
            timeZone={session.organization.timezone}
          />
        </>
      ) : null}
    </div>
  );
}
