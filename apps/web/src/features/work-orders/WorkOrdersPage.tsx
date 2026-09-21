import { useState } from 'react';
import {
  Camera,
  Clock,
  Droplets,
  Eye,
  FileImage,
  Filter,
  Plus,
  RotateCcw,
  Smartphone,
  UploadCloud,
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
  useUploadWorkOrderAttachment,
  useWorkOrderAttachments,
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
  const [modalTab, setModalTab] = useState<'details' | 'attachments'>('details');
  const [recentPhotos, setRecentPhotos] = useState<Record<string, string>>({});
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [updateStatus, setUpdateStatus] = useState<WorkOrderStatus>('COMPLETED');
  const [updateDiagnosis, setUpdateDiagnosis] = useState<WorkOrderDiagnosis>('LEAK_CONFIRMED');
  const [updateVolume, setUpdateVolume] = useState<string>('350');
  const [updateNotes, setUpdateNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, dataUpdatedAt, isFetching } = useWorkOrders(filter);
  const { data: attachments, isLoading: isAttachmentsLoading } = useWorkOrderAttachments(activeWo?.id ?? null);
  const createMutation = useCreateWorkOrder();
  const updateMutation = useUpdateWorkOrder();
  const uploadAttachmentMutation = useUploadWorkOrderAttachment();

  if (!session) return null;
  const canCreate = hasPermission(session.user.role, 'work-orders:create');
  const canExecute = hasPermission(session.user.role, 'work-orders:execute');

  const handleOpenAction = (wo: WorkOrderDto) => {
    setActiveWo(wo);
    setModalTab('details');
    setUpdateStatus(wo.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS');
    setUpdateDiagnosis(wo.diagnosis ?? 'LEAK_CONFIRMED');
    setUpdateVolume(wo.estimatedVolumeM3 ? String(wo.estimatedVolumeM3) : '400');
    setUpdateNotes(wo.repairNotes ?? '');
    setActionError(null);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeWo) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setActionError('Formato inválido. Use JPEG, PNG ou WebP.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setActionError('A foto excede o limite máximo de 10 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const resultStr = reader.result as string;
        const base64 = resultStr.split(',')[1] || resultStr;
        const res = await uploadAttachmentMutation.mutateAsync({
          workOrderId: activeWo.id,
          input: {
            filename: file.name,
            contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
            dataBase64: base64,
          },
        });
        setRecentPhotos((prev) => ({ ...prev, [res.id]: resultStr }));
        setActionError(null);
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : 'Falha ao anexar imagem.');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
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

      {/* Modal de Registro de Ação / Conclusão de Reparo / Fotos PWA */}
      <Modal
        open={Boolean(activeWo)}
        onClose={() => setActiveWo(null)}
        title={`Gerenciar OS #${activeWo?.number}`}
      >
        {activeWo && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">{activeWo.title}</p>
              {activeWo.description && <p className="mt-1">{activeWo.description}</p>}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200">
              <button
                type="button"
                onClick={() => setModalTab('details')}
                className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
                  modalTab === 'details'
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                Detalhes & Reparo
              </button>
              <button
                type="button"
                onClick={() => setModalTab('attachments')}
                className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  modalTab === 'attachments'
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Camera className="size-3.5" />
                Evidências Fotográficas ({attachments?.length ?? 0})
              </button>
            </div>

            {modalTab === 'details' ? (
              <form onSubmit={(e) => { void handleUpdateSubmit(e); }} className="space-y-4">
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
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-2.5 rounded-xl border border-sky-100 bg-sky-50/80 p-3 text-xs text-sky-900">
                  <Smartphone className="size-4 shrink-0 text-sky-600 mt-0.5" />
                  <div>
                    <span className="font-semibold">Modo Técnico em Campo (PWA)</span>
                    <p className="text-sky-800 text-[11px] mt-0.5">
                      Tire fotos do local da escavação, tubulação rompida ou reparo concluído. As fotos são persistidas com hash SHA-256 no sistema.
                    </p>
                  </div>
                </div>

                {/* Upload Box */}
                <div className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-center hover:border-brand-400 bg-slate-50/50 transition-colors">
                  <UploadCloud className="mx-auto size-7 text-brand-600 mb-1" />
                  <p className="text-xs font-semibold text-slate-800">Tirar foto com câmera ou anexar imagem</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">JPEG, PNG ou WebP até 10 MB</p>
                  <label className="mt-2.5 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 shadow-xs transition-colors">
                    <Camera className="size-3.5" />
                    <span>Capturar / Enviar Foto</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      className="sr-only"
                      onChange={handlePhotoUpload}
                      disabled={uploadAttachmentMutation.isPending}
                    />
                  </label>
                  {uploadAttachmentMutation.isPending && (
                    <p className="text-xs text-brand-700 font-medium mt-2 animate-pulse">Enviando evidência fotográfica...</p>
                  )}
                </div>

                {actionError && (
                  <p role="alert" className="text-sm text-red-700">{actionError}</p>
                )}

                {/* Attachment List */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Fotos Anexadas</h4>
                  {isAttachmentsLoading ? (
                    <p className="text-xs text-slate-500 italic py-2">Carregando fotos anexadas…</p>
                  ) : !attachments || attachments.length === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-4">
                      Nenhuma evidência fotográfica anexada a esta ordem de serviço.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                      {attachments.map((att) => {
                        const previewUrl = recentPhotos[att.id] || (att.dataBase64 ? `data:${att.contentType};base64,${att.dataBase64}` : null);
                        return (
                          <div
                            key={att.id}
                            className="rounded-xl border border-slate-200 bg-white p-2 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200">
                                {previewUrl ? (
                                  <img src={previewUrl} alt={att.originalFilename ?? 'Evidência'} className="h-full w-full object-cover" />
                                ) : (
                                  <FileImage className="size-5 text-slate-400" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-slate-900" title={att.originalFilename ?? 'Evidência'}>
                                  {att.originalFilename ?? 'Evidência'}
                                </p>
                                <p className="text-[10px] text-slate-500">{(att.sizeBytes / 1024).toFixed(0)} KB</p>
                              </div>
                            </div>
                            {previewUrl ? (
                              <button
                                type="button"
                                onClick={() => setPreviewImage({ url: previewUrl, title: att.originalFilename ?? 'Evidência de campo' })}
                                className="inline-flex items-center justify-center gap-1 w-full rounded-md bg-slate-50 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                              >
                                <Eye className="size-3 text-slate-500" />
                                Ver Foto
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400 text-center">Salvo no MinIO</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-200">
                  <Button variant="secondary" onClick={() => setActiveWo(null)}>
                    Fechar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal para Visualização de Foto em Alta Resolução */}
      <Modal
        open={Boolean(previewImage)}
        onClose={() => setPreviewImage(null)}
        title={previewImage?.title ?? 'Foto de Campo'}
      >
        {previewImage && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl bg-black/5 flex items-center justify-center max-h-[70vh]">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-h-[65vh] w-auto object-contain rounded-lg shadow-sm"
              />
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setPreviewImage(null)}>
                Fechar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

