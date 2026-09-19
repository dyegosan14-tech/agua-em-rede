import { useState } from 'react';
import {
  Clock,
  Droplets,
  Filter,
  Plus,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import type { WorkOrderDto } from '@aer/contracts';
import {
  type WorkOrderDiagnosis,
  type WorkOrderPriority,
  type WorkOrderStatus,
  hasPermission,
} from '@aer/domain';
import { EmptyState, ErrorState, FreshnessNote, LoadingState } from '../../components/states';
import { Badge, Button, Modal, PageHeader, SelectField, TextField } from '../../components/ui';
import { useSession } from '../auth/session';
import {
  useCreateWorkOrder,
  useUpdateWorkOrder,
  useWorkOrders,
  type WorkOrdersFilter,
} from './work-orders-api';

const PRIORITY_TONES: Record<WorkOrderPriority, 'critical' | 'warn' | 'info' | 'neutral'> = {
  URGENT: 'critical',
  HIGH: 'warn',
  MEDIUM: 'info',
  LOW: 'neutral',
};

const STATUS_TONES: Record<WorkOrderStatus, 'critical' | 'warn' | 'info' | 'ok' | 'neutral'> = {
  OPEN: 'critical',
  ASSIGNED: 'info',
  IN_PROGRESS: 'warn',
  AWAITING_RESOURCES: 'neutral',
  COMPLETED: 'ok',
  CANCELLED: 'neutral',
};

const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  OPEN: 'Aberto',
  ASSIGNED: 'Atribuído',
  IN_PROGRESS: 'Em Andamento',
  AWAITING_RESOURCES: 'Aguardando Recursos',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
};

const DIAGNOSIS_LABELS: Record<WorkOrderDiagnosis, string> = {
  LEAK_CONFIRMED: 'Vazamento Confirmado & Sanado',
  LEAK_NOT_FOUND: 'Vazamento Não Encontrado',
  SENSOR_OR_COMMS_FAULT: 'Falha de Sensor / Comunicação',
  OPERATIONAL_CAUSE: 'Causa Operacional / Manobra',
  INCONCLUSIVE: 'Inconclusivo',
  OTHER: 'Outro',
};

export function WorkOrdersPage() {
  const { data: session } = useSession();
  const [filter, setFilter] = useState<WorkOrdersFilter>({ limit: 20, offset: 0 });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createPriority, setCreatePriority] = useState<WorkOrderPriority>('MEDIUM');
  const [createDesc, setCreateDesc] = useState('');

  const [activeWo, setActiveWo] = useState<WorkOrderDto | null>(null);
  const [updateStatus, setUpdateStatus] = useState<WorkOrderStatus>('COMPLETED');
  const [updateDiagnosis, setUpdateDiagnosis] = useState<WorkOrderDiagnosis>('LEAK_CONFIRMED');
  const [updateVolume, setUpdateVolume] = useState<string>('350');
  const [updateNotes, setUpdateNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, dataUpdatedAt, isFetching } = useWorkOrders(filter);
  const createMutation = useCreateWorkOrder();
  const updateMutation = useUpdateWorkOrder();

  if (!session) return null;
  const canCreate = hasPermission(session.user.role, 'work-orders:create');
  const canExecute = hasPermission(session.user.role, 'work-orders:execute');

  const handleOpenAction = (wo: WorkOrderDto) => {
    setActiveWo(wo);
    setUpdateStatus(wo.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS');
    setUpdateDiagnosis(wo.diagnosis ?? 'LEAK_CONFIRMED');
    setUpdateVolume(wo.estimatedVolumeM3 ? String(wo.estimatedVolumeM3) : '400');
    setUpdateNotes(wo.repairNotes ?? '');
    setActionError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    try {
      await createMutation.mutateAsync({
        title: createTitle.trim(),
        priority: createPriority,
        description: createDesc.trim() || undefined,
      });
      setIsCreateOpen(false);
      setCreateTitle('');
      setCreateDesc('');
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Falha ao cadastrar ordem de serviço.');
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWo) return;
    setActionError(null);
    try {
      const vol = updateVolume.trim() ? parseFloat(updateVolume) : null;
      await updateMutation.mutateAsync({
        id: activeWo.id,
        input: {
          status: updateStatus,
          diagnosis: updateDiagnosis,
          estimatedVolumeM3: vol !== null && !isNaN(vol) ? vol : null,
          repairNotes: updateNotes.trim() || undefined,
        },
      });
      setActiveWo(null);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Falha ao atualizar ordem de serviço.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Ordens de Serviço em Campo"
        description="Acompanhamento operacional de reparos, contenção de perdas e volume de água tratada recuperado."
        actions={
          canCreate ? (
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus aria-hidden className="size-4" />
              Nova Ordem de Serviço
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
              status: (e.target.value as WorkOrderStatus) || undefined,
              offset: 0,
            }))
          }
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-brand-600 focus:outline-hidden"
        >
          <option value="">Status: Todos</option>
          <option value="OPEN">Aberto</option>
          <option value="ASSIGNED">Atribuído</option>
          <option value="IN_PROGRESS">Em Andamento</option>
          <option value="AWAITING_RESOURCES">Aguardando Recursos</option>
          <option value="COMPLETED">Concluído</option>
          <option value="CANCELLED">Cancelado</option>
        </select>

        <select
          value={filter.priority ?? ''}
          onChange={(e) =>
            setFilter((prev) => ({
              ...prev,
              priority: (e.target.value as WorkOrderPriority) || undefined,
              offset: 0,
            }))
          }
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-brand-600 focus:outline-hidden"
        >
          <option value="">Prioridade: Todas</option>
          <option value="URGENT">Urgente</option>
          <option value="HIGH">Alta</option>
          <option value="MEDIUM">Média</option>
          <option value="LOW">Baixa</option>
        </select>

        {(filter.status || filter.priority) && (
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
        <LoadingState label="Carregando ordens de serviço…" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => { void refetch(); }} />
      ) : !data?.items.length ? (
        <EmptyState
          title="Nenhuma ordem de serviço encontrada"
          description="Nenhuma ordem de serviço corresponde aos filtros selecionados."
          action={
            canCreate ? (
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="size-4" /> Cadastrar Ordem
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
                    <th scope="col" className="px-4 py-3">OS</th>
                    <th scope="col" className="px-4 py-3">Prioridade</th>
                    <th scope="col" className="px-4 py-3">Título & Escopo</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3">Diagnóstico / Economia</th>
                    <th scope="col" className="px-4 py-3">Abertura</th>
                    <th scope="col" className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((wo) => (
                    <tr key={wo.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-slate-800">
                        #{wo.number}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={PRIORITY_TONES[wo.priority]}>
                          {wo.priority === 'URGENT' ? 'URGENTE' : wo.priority}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{wo.title}</div>
                        {wo.description && (
                          <div className="max-w-md truncate text-xs text-slate-500">
                            {wo.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONES[wo.status]}>
                          {STATUS_LABELS[wo.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {wo.diagnosis && (
                          <div className="font-medium text-slate-800">
                            {DIAGNOSIS_LABELS[wo.diagnosis]}
                          </div>
                        )}
                        {wo.estimatedVolumeM3 ? (
                          <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-800">
                            <Droplets className="size-3 text-emerald-600" />
                            +{wo.estimatedVolumeM3.toLocaleString('pt-BR')} m³ salvos
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <div className="flex items-center gap-1">
                          <Clock className="size-3.5 text-slate-400" />
                          {new Date(wo.createdAt).toLocaleDateString('pt-BR')}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canExecute && (
                          <button
                            type="button"
                            onClick={() => handleOpenAction(wo)}
                            className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100"
                          >
                            <Wrench className="size-3.5" />
                            Gerenciar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criação de OS */}
      <Modal open={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Nova Ordem de Serviço">
        <form onSubmit={(e) => { void handleCreateSubmit(e); }} className="space-y-4">
          <TextField
            label="Título da OS *"
            placeholder="Ex.: Reparo de vazamento em adutora PEAD"
            value={createTitle}
            onChange={(e) => setCreateTitle(e.target.value)}
            required
          />

          <SelectField
            label="Prioridade *"
            value={createPriority}
            onChange={(e) => setCreatePriority(e.target.value as WorkOrderPriority)}
          >
            <option value="URGENT">Urgente (Rompimento crítico)</option>
            <option value="HIGH">Alta</option>
            <option value="MEDIUM">Média</option>
            <option value="LOW">Baixa</option>
          </SelectField>

          <TextField
            label="Descrição / Detalhamento"
            placeholder="Instruções para os técnicos de campo"
            value={createDesc}
            onChange={(e) => setCreateDesc(e.target.value)}
          />

          {actionError && (
            <p role="alert" className="text-sm text-red-700">{actionError}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={createMutation.isPending}
              loadingLabel="Cadastrando…"
            >
              Criar OS
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal de Registro de Ação / Conclusão de Reparo */}
      <Modal
        open={Boolean(activeWo)}
        onClose={() => setActiveWo(null)}
        title={`Gerenciar OS #${activeWo?.number}`}
      >
        {activeWo && (
          <form onSubmit={(e) => { void handleUpdateSubmit(e); }} className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">{activeWo.title}</p>
              {activeWo.description && <p className="mt-1">{activeWo.description}</p>}
            </div>

            <SelectField
              label="Status da Ordem *"
              value={updateStatus}
              onChange={(e) => setUpdateStatus(e.target.value as WorkOrderStatus)}
            >
              <option value="IN_PROGRESS">Em Andamento</option>
              <option value="AWAITING_RESOURCES">Aguardando Recursos</option>
              <option value="COMPLETED">Concluído (Reparo Efetuado)</option>
              <option value="CANCELLED">Cancelado</option>
            </SelectField>

            <SelectField
              label="Diagnóstico da Ocorrência *"
              value={updateDiagnosis}
              onChange={(e) => setUpdateDiagnosis(e.target.value as WorkOrderDiagnosis)}
            >
              <option value="LEAK_CONFIRMED">Vazamento Confirmado & Sanado</option>
              <option value="LEAK_NOT_FOUND">Vazamento Não Encontrado (Falso Positivo)</option>
              <option value="SENSOR_OR_COMMS_FAULT">Falha de Sensor ou Comunicação IoT</option>
              <option value="OPERATIONAL_CAUSE">Causa Operacional / Manobra de Rede</option>
              <option value="INCONCLUSIVE">Inconclusivo</option>
              <option value="OTHER">Outro</option>
            </SelectField>

            <TextField
              label="Volume de Água Economizado (m³)"
              type="number"
              step="0.1"
              hint="Estima o volume de água tratada recuperado após sanar o vazamento (impacta a meta de 30%)."
              value={updateVolume}
              onChange={(e) => setUpdateVolume(e.target.value)}
            />

            <TextField
              label="Notas do Reparo / Intervenção"
              placeholder="Ex.: Troca de junta mecânica e substituição de 2m de ramal."
              value={updateNotes}
              onChange={(e) => setUpdateNotes(e.target.value)}
            />

            {actionError && (
              <p role="alert" className="text-sm text-red-700">{actionError}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setActiveWo(null)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                loading={updateMutation.isPending}
                loadingLabel="Salvando…"
              >
                Salvar Alterações
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
