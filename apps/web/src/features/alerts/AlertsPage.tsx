import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Eye,
  FilePlus,
  Filter,
  Play,
  RotateCcw,
} from 'lucide-react';
import type { AlertDto } from '@aer/contracts';
import type { AlertStatus, Severity } from '@aer/domain';
import { hasPermission } from '@aer/domain';
import { EmptyState, ErrorState, FreshnessNote, LoadingState } from '../../components/states';
import { Badge, Button, Modal, PageHeader, SelectField, TextField } from '../../components/ui';
import { useSession } from '../auth/session';
import { useRunSimulation } from '../telemetry/telemetry-api';
import { useCreateWorkOrder } from '../work-orders/work-orders-api';
import { useAlerts, useTransitionAlert, type AlertsFilter } from './alerts-api';

const SEVERITY_TONES: Record<Severity, 'critical' | 'warn' | 'info' | 'neutral'> = {
  CRITICAL: 'critical',
  HIGH: 'warn',
  MEDIUM: 'info',
  LOW: 'neutral',
};

const STATUS_TONES: Record<AlertStatus, 'critical' | 'warn' | 'info' | 'ok' | 'neutral'> = {
  OPEN: 'critical',
  INVESTIGATING: 'warn',
  ACKNOWLEDGED: 'info',
  RESOLVED: 'ok',
  DISMISSED: 'neutral',
};

const STATUS_LABELS: Record<AlertStatus, string> = {
  OPEN: 'Aberto',
  INVESTIGATING: 'Em Investigação',
  ACKNOWLEDGED: 'Reconhecido',
  RESOLVED: 'Resolvido',
  DISMISSED: 'Descartado',
};

export function AlertsPage() {
  const { data: session } = useSession();
  const [filter, setFilter] = useState<AlertsFilter>({ limit: 20, offset: 0 });

  const [selectedAlert, setSelectedAlert] = useState<AlertDto | null>(null);
  const [transitionModalAlert, setTransitionModalAlert] = useState<{ alert: AlertDto; action: 'ACKNOWLEDGE' | 'INVESTIGATE' | 'RESOLVE' | 'DISMISS' } | null>(null);
  const [transitionNote, setTransitionNote] = useState('');
  const [createWoAlert, setCreateWoAlert] = useState<AlertDto | null>(null);
  const [woTitle, setWoTitle] = useState('');
  const [woPriority, setWoPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('HIGH');
  const [woDesc, setWoDesc] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, dataUpdatedAt, isFetching } = useAlerts(filter);
  const transitionMutation = useTransitionAlert();
  const createWoMutation = useCreateWorkOrder();
  const simulationMutation = useRunSimulation();

  if (!session) return null;
  const canTransition = hasPermission(session.user.role, 'alerts:transition');
  const canCreateWo = hasPermission(session.user.role, 'work-orders:create');
  const canSimulate = hasPermission(session.user.role, 'simulator:run');

  const handleOpenCreateWo = (alert: AlertDto) => {
    setCreateWoAlert(alert);
    setWoTitle(`Inspeção de anomalia: ${alert.title}`);
    setWoPriority(alert.severity === 'CRITICAL' ? 'URGENT' : alert.severity === 'HIGH' ? 'HIGH' : 'MEDIUM');
    setWoDesc(`Gerado a partir do alerta ${alert.id}. Evidências: ${JSON.stringify(alert.evidence, null, 2)}`);
    setActionError(null);
  };

  const handleConfirmCreateWo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createWoAlert) return;
    setActionError(null);
    try {
      await createWoMutation.mutateAsync({
        alertId: createWoAlert.id,
        sectorId: createWoAlert.sectorId,
        deviceId: createWoAlert.deviceId,
        title: woTitle.trim(),
        priority: woPriority,
        description: woDesc.trim() || undefined,
      });
      setCreateWoAlert(null);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Falha ao criar ordem de serviço.');
    }
  };

  const handleConfirmTransition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transitionModalAlert) return;
    setActionError(null);
    try {
      await transitionMutation.mutateAsync({
        alertId: transitionModalAlert.alert.id,
        input: {
          action: transitionModalAlert.action,
          note: transitionNote.trim() || undefined,
          dismissalReason: transitionModalAlert.action === 'DISMISS' ? transitionNote.trim() || 'Descartado pelo operador' : undefined,
        },
      });
      setTransitionModalAlert(null);
      setTransitionNote('');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Falha ao atualizar status do alerta.');
    }
  };

  const handleQuickSimulation = async () => {
    try {
      await simulationMutation.mutateAsync({
        scenario: 'COMBINED_EVENT',
        durationHours: 12,
      });
      await refetch();
    } catch {
      // Ignora erro rápido da simulação se ocorrer
    }
  };

  return (
    <div>
      <PageHeader
        title="Alertas de Rede & Vazamentos"
        description="Monitoramento inteligente de quedas de pressão, surtos de vazão e rompimentos na malha do Recife."
        actions={
          canSimulate ? (
            <Button
              variant="secondary"
              loading={simulationMutation.isPending}
              loadingLabel="Simulando Rompimento…"
              onClick={() => {
                void handleQuickSimulation();
              }}
            >
              <Play aria-hidden className="size-4 text-brand-700" />
              Simular Rompimento
            </Button>
          ) : undefined
        }
      />

      {/* Barra de Filtros */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Filter aria-hidden className="size-4 text-slate-500" />
          Filtros:
        </div>

        <select
          value={filter.status ?? ''}
          onChange={(e) =>
            setFilter((prev) => ({
              ...prev,
              status: (e.target.value as AlertStatus) || undefined,
              offset: 0,
            }))
          }
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-brand-600 focus:outline-hidden"
        >
          <option value="">Status: Todos</option>
          <option value="OPEN">Abertos</option>
          <option value="INVESTIGATING">Em Investigação</option>
          <option value="ACKNOWLEDGED">Reconhecidos</option>
          <option value="RESOLVED">Resolvidos</option>
          <option value="DISMISSED">Descartados</option>
        </select>

        <select
          value={filter.severity ?? ''}
          onChange={(e) =>
            setFilter((prev) => ({
              ...prev,
              severity: (e.target.value as Severity) || undefined,
              offset: 0,
            }))
          }
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-brand-600 focus:outline-hidden"
        >
          <option value="">Severidade: Todas</option>
          <option value="CRITICAL">Crítica</option>
          <option value="HIGH">Alta</option>
          <option value="MEDIUM">Média</option>
          <option value="LOW">Baixa</option>
        </select>

        <select
          value={filter.origin ?? ''}
          onChange={(e) =>
            setFilter((prev) => ({
              ...prev,
              origin: (e.target.value as 'REAL' | 'SIMULATED') || undefined,
              offset: 0,
            }))
          }
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-brand-600 focus:outline-hidden"
        >
          <option value="">Origem: Todas</option>
          <option value="REAL">Rede Real</option>
          <option value="SIMULATED">Simulada</option>
        </select>

        {(filter.status || filter.severity || filter.origin) && (
          <button
            type="button"
            onClick={() => setFilter({ limit: 20, offset: 0 })}
            className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
          >
            <RotateCcw className="size-3" /> Limpar filtros
          </button>
        )}
      </div>

      {isLoading ? (
        <LoadingState label="Carregando alertas da rede…" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => { void refetch(); }} />
      ) : !data?.items.length ? (
        <EmptyState
          title="Nenhum alerta encontrado"
          description="Nenhuma anomalia de pressão ou vazão corresponde aos critérios selecionados."
          action={
            canSimulate ? (
              <Button variant="secondary" onClick={() => { void handleQuickSimulation(); }}>
                <Play className="size-4" /> Executar Simulação
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <FreshnessNote
              updatedAt={dataUpdatedAt}
              isFetching={isFetching}
              failed={isError}
              timeZone={session.organization.timezone}
            />
            <span className="text-xs text-slate-500 font-medium">Total: {data.page.total}</span>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                  <tr>
                    <th scope="col" className="px-4 py-3">Severidade</th>
                    <th scope="col" className="px-4 py-3">Título & Anomalia</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3">Detecção</th>
                    <th scope="col" className="px-4 py-3">Origem</th>
                    <th scope="col" className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((alert) => (
                    <tr key={alert.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3">
                        <Badge tone={SEVERITY_TONES[alert.severity]}>
                          {alert.severity === 'CRITICAL' ? 'CRÍTICO' : alert.severity}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{alert.title}</div>
                        <div className="text-xs text-slate-500">
                          {alert.occurrences} ocorrência(s) • Score: {alert.priorityScore}/100
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONES[alert.status]}>
                          {STATUS_LABELS[alert.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <div className="flex items-center gap-1">
                          <Clock className="size-3.5 text-slate-400" />
                          {new Date(alert.lastDetectedAt).toLocaleString('pt-BR')}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {alert.origin === 'SIMULATED' ? (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            Simulado
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            Real
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedAlert(alert)}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            title="Ver Detalhes e Evidências"
                          >
                            <Eye className="size-3.5" />
                            Ver
                          </button>

                          {canCreateWo && alert.status !== 'RESOLVED' && alert.status !== 'DISMISSED' && (
                            <button
                              type="button"
                              onClick={() => handleOpenCreateWo(alert)}
                              className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100"
                              title="Abrir Ordem de Serviço"
                            >
                              <FilePlus className="size-3.5" />
                              Criar OS
                            </button>
                          )}

                          {canTransition && (
                            <>
                              {alert.status === 'OPEN' && (
                                <button
                                  type="button"
                                  onClick={() => setTransitionModalAlert({ alert, action: 'ACKNOWLEDGE' })}
                                  className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                                >
                                  Reconhecer
                                </button>
                              )}

                              {alert.status === 'ACKNOWLEDGED' && (
                                <button
                                  type="button"
                                  onClick={() => setTransitionModalAlert({ alert, action: 'INVESTIGATE' })}
                                  className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-900 hover:bg-brand-100"
                                >
                                  Investigar
                                </button>
                              )}

                              {alert.status !== 'RESOLVED' && alert.status !== 'DISMISSED' && (
                                <button
                                  type="button"
                                  onClick={() => setTransitionModalAlert({ alert, action: 'RESOLVE' })}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                                >
                                  <CheckCircle2 className="size-3.5" />
                                  Resolver
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalhes da Evidência */}
      <Modal
        open={Boolean(selectedAlert)}
        onClose={() => setSelectedAlert(null)}
        title={selectedAlert?.title ?? 'Detalhes do Alerta'}
      >
        {selectedAlert && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={SEVERITY_TONES[selectedAlert.severity]}>{selectedAlert.severity}</Badge>
              <Badge tone={STATUS_TONES[selectedAlert.status]}>{STATUS_LABELS[selectedAlert.status]}</Badge>
              {selectedAlert.origin === 'SIMULATED' && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  Simulação
                </span>
              )}
            </div>

            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
              <p><strong>ID:</strong> {selectedAlert.id}</p>
              <p><strong>Primeira detecção:</strong> {new Date(selectedAlert.firstDetectedAt).toLocaleString('pt-BR')}</p>
              <p><strong>Última detecção:</strong> {new Date(selectedAlert.lastDetectedAt).toLocaleString('pt-BR')}</p>
              <p><strong>Deduplicação:</strong> {selectedAlert.dedupKey}</p>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-slate-900">Evidências e Telemetria:</h4>
              <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-emerald-400">
                {JSON.stringify(selectedAlert.evidence, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-3">
              <Button variant="secondary" onClick={() => setSelectedAlert(null)}>
                Fechar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Transição de Status */}
      <Modal
        open={Boolean(transitionModalAlert)}
        onClose={() => setTransitionModalAlert(null)}
        title={`Ação: ${transitionModalAlert?.action}`}
      >
        {transitionModalAlert && (
          <form onSubmit={(e) => { void handleConfirmTransition(e); }} className="space-y-4">
            <p className="text-sm text-slate-700">
              Atualizar o status do alerta <strong>{transitionModalAlert.alert.title}</strong> para{' '}
              <strong>
                {transitionModalAlert.action === 'ACKNOWLEDGE'
                  ? 'Reconhecido'
                  : transitionModalAlert.action === 'INVESTIGATE'
                  ? 'Em Investigação'
                  : transitionModalAlert.action === 'RESOLVE'
                  ? 'Resolvido'
                  : 'Descartado'}
              </strong>.
            </p>

            <TextField
              label="Observação / Justificativa (opcional)"
              placeholder="Ex.: Equipe enviada ao setor ou verificação de manobra realizada"
              value={transitionNote}
              onChange={(e) => setTransitionNote(e.target.value)}
            />

            {actionError && (
              <p role="alert" className="text-sm text-red-700">{actionError}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setTransitionModalAlert(null)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                loading={transitionMutation.isPending}
                loadingLabel="Confirmando…"
              >
                Confirmar Transição
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal de Criação de Ordem de Serviço vinculada ao Alerta */}
      <Modal
        open={Boolean(createWoAlert)}
        onClose={() => setCreateWoAlert(null)}
        title="Gerar Ordem de Serviço em Campo"
      >
        {createWoAlert && (
          <form onSubmit={(e) => { void handleConfirmCreateWo(e); }} className="space-y-4">
            <TextField
              label="Título da Ordem de Serviço *"
              value={woTitle}
              onChange={(e) => setWoTitle(e.target.value)}
              required
            />

            <SelectField
              label="Prioridade *"
              value={woPriority}
              onChange={(e) => setWoPriority(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT')}
            >
              <option value="URGENT">Urgente (Rompimento grave / Perda expressiva)</option>
              <option value="HIGH">Alta</option>
              <option value="MEDIUM">Média</option>
              <option value="LOW">Baixa</option>
            </SelectField>

            <TextField
              label="Instruções para Equipe de Campo"
              value={woDesc}
              onChange={(e) => setWoDesc(e.target.value)}
            />

            {actionError && (
              <p role="alert" className="text-sm text-red-700">{actionError}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setCreateWoAlert(null)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                loading={createWoMutation.isPending}
                loadingLabel="Abrindo OS…"
              >
                Criar Ordem de Serviço
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
