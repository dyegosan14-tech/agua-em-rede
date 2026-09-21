import { useState } from 'react';
import { Calendar, Clock, Plus, Search, Wrench, X } from 'lucide-react';
import type { SectorDto } from '@aer/contracts';
import { hasPermission } from '@aer/domain';
import { EmptyState, ErrorState, FreshnessNote, LoadingState } from '../../components/states';
import { Badge, Button, Modal, PageHeader, TextField } from '../../components/ui';
import { useSession } from '../auth/session';
import {
  useCancelMaintenanceWindow,
  useCreateMaintenanceWindow,
  useCreateSector,
  useMaintenanceWindows,
  useSectors,
  type SectorsFilter,
} from './sectors-api';

const DAYS_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function SectorsPage() {
  const { data: session } = useSession();
  const [filter, setFilter] = useState<SectorsFilter>({ limit: 10, offset: 0 });

  const [searchInput, setSearchInput] = useState('');
  const [selectedSector, setSelectedSector] = useState<SectorDto | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Form state - Sector
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Form state - Maintenance Window
  const [isScheduleMwOpen, setIsScheduleMwOpen] = useState(false);
  const [mwReason, setMwReason] = useState('');
  const [mwStartsAt, setMwStartsAt] = useState('');
  const [mwEndsAt, setMwEndsAt] = useState('');
  const [mwError, setMwError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, dataUpdatedAt, isFetching } = useSectors(filter);
  const { data: mwData, isLoading: mwLoading } = useMaintenanceWindows(selectedSector?.id);
  const createMutation = useCreateSector();
  const createMwMutation = useCreateMaintenanceWindow();
  const cancelMwMutation = useCancelMaintenanceWindow();

  if (!session) return null;
  const canWrite = hasPermission(session.user.role, 'sectors:write');
  const timeZone = session.organization.timezone;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilter((prev) => ({ ...prev, search: searchInput.trim() || undefined, offset: 0 }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await createMutation.mutateAsync({
        code: newCode.trim(),
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      });
      setIsCreateOpen(false);
      setNewCode('');
      setNewName('');
      setNewDesc('');
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao cadastrar setor.');
    }
  };

  const handleScheduleMw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSector) return;
    setMwError(null);
    try {
      await createMwMutation.mutateAsync({
        sectorId: selectedSector.id,
        reason: mwReason.trim(),
        startsAt: new Date(mwStartsAt).toISOString(),
        endsAt: new Date(mwEndsAt).toISOString(),
      });
      setIsScheduleMwOpen(false);
      setMwReason('');
      setMwStartsAt('');
      setMwEndsAt('');
    } catch (err: unknown) {
      setMwError(err instanceof Error ? err.message : 'Erro ao agendar manutenção.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Setores de Abastecimento"
        description="Monitoramento das áreas de pressão e horários de fornecimento de água."
        actions={
          canWrite ? (
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus aria-hidden className="size-4" />
              Novo setor
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <form onSubmit={handleSearch} className="flex max-w-sm flex-1 items-center gap-2">
          <TextField
            label="Buscar setor"
            placeholder="Código ou nome…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Button type="submit" variant="secondary" className="mt-6">
            <Search aria-hidden className="size-4" />
            <span className="sr-only">Buscar</span>
          </Button>
        </form>

        <FreshnessNote
          updatedAt={dataUpdatedAt}
          isFetching={isFetching}
          failed={isError}
          timeZone={timeZone}
        />
      </div>

      {isLoading ? (
        <LoadingState label="Carregando setores…" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => { void refetch(); }} title="Falha ao carregar setores" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="Nenhum setor encontrado"
          description={filter.search ? 'Tente ajustar os termos da busca.' : 'Cadastre o primeiro setor da rede.'}
          action={
            canWrite && !filter.search ? (
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus aria-hidden className="size-4" />
                Cadastrar primeiro setor
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-800">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                <tr>
                  <th scope="col" className="px-5 py-3.5">Código</th>
                  <th scope="col" className="px-5 py-3.5">Nome</th>
                  <th scope="col" className="px-5 py-3.5">Abastecimento</th>
                  <th scope="col" className="px-5 py-3.5">Origem</th>
                  <th scope="col" className="px-5 py-3.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((sector) => (
                  <tr key={sector.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4 font-mono font-bold text-slate-900">{sector.code}</td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{sector.name}</p>
                      {sector.description ? (
                        <p className="line-clamp-1 text-xs text-slate-700">{sector.description}</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">
                      {sector.supplySchedule.length > 0 ? (
                        <div className="flex items-center gap-1.5 text-xs text-brand-900">
                          <Clock aria-hidden className="size-3.5 text-brand-600" />
                          <span>{sector.supplySchedule.length} janela(s) definida(s)</span>
                        </div>
                      ) : (
                        <Badge tone="neutral">Não configurado</Badge>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {sector.isFictional ? (
                        <Badge tone="warn">Fictício (seed)</Badge>
                      ) : (
                        <Badge tone="ok">Operacional</Badge>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button variant="ghost" className="text-xs" onClick={() => setSelectedSector(sector)}>
                        Detalhes
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs text-slate-600">
            <span>
              Mostrando {data.items.length} de {data.page.total} setor(es)
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={filter.offset === 0}
                onClick={() => setFilter((prev) => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                className="min-h-9 px-3 text-xs"
              >
                Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={filter.offset + filter.limit >= data.page.total}
                onClick={() => setFilter((prev) => ({ ...prev, offset: prev.offset + prev.limit }))}
                className="min-h-9 px-3 text-xs"
              >
                Próximo
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalhes do Setor */}
      <Modal open={selectedSector !== null} onClose={() => setSelectedSector(null)} title={selectedSector ? `Setor: ${selectedSector.name}` : ''}>
        {selectedSector ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-xl bg-slate-50 p-4">
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="text-slate-700">Código</dt>
                  <dd className="font-mono font-bold text-slate-900">{selectedSector.code}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-700">Natureza</dt>
                  <dd>{selectedSector.isFictional ? <Badge tone="warn">Dados Simulados / Fictício</Badge> : <Badge tone="ok">Rede Real</Badge>}</dd>
                </div>
                {selectedSector.description ? (
                  <div className="pt-2 border-t border-slate-200">
                    <dt className="text-slate-700 mb-1">Descrição</dt>
                    <dd className="text-slate-800 text-xs">{selectedSector.description}</dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <div>
              <h3 className="mb-2 font-semibold text-slate-900 flex items-center gap-2">
                <Calendar aria-hidden className="size-4 text-brand-700" />
                Regime de Abastecimento
              </h3>
              {selectedSector.supplySchedule.length === 0 ? (
                <p className="text-xs text-slate-700 italic">
                  Nenhum horário restritivo configurado. O setor opera sem intermitência programada ou ainda não possui calendário cadastrado.
                </p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {selectedSector.supplySchedule.map((entry, idx) => (
                    <li key={idx} className="rounded-lg border border-slate-200 p-2.5 flex justify-between items-center">
                      <span className="font-medium text-slate-800">
                        {entry.daysOfWeek.map((d) => DAYS_NAMES[d]).join(', ')}
                      </span>
                      <span className="font-mono text-brand-900 bg-brand-50 px-2 py-0.5 rounded">
                        {entry.start} às {entry.end}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Janelas de Manutenção Programada */}
            <div className="pt-3 border-t border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Wrench aria-hidden className="size-4 text-amber-600" />
                  Manutenção Programada (Mute de Alarmes)
                </h3>
                {canWrite && !isScheduleMwOpen && (
                  <button
                    type="button"
                    onClick={() => setIsScheduleMwOpen(true)}
                    className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    <Plus className="size-3" />
                    Agendar
                  </button>
                )}
              </div>

              {isScheduleMwOpen ? (
                <form onSubmit={(e) => { void handleScheduleMw(e); }} className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 space-y-3 mb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900">Nova Janela de Manutenção</span>
                    <button type="button" onClick={() => setIsScheduleMwOpen(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="size-4" />
                    </button>
                  </div>
                  {mwError && <p className="text-xs text-red-700">{mwError}</p>}
                  <TextField
                    label="Motivo da Intervenção *"
                    placeholder="Ex: Manutenção preventiva em bombas e registros"
                    value={mwReason}
                    onChange={(e) => setMwReason(e.target.value)}
                    required
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <TextField
                      label="Início *"
                      type="datetime-local"
                      value={mwStartsAt}
                      onChange={(e) => setMwStartsAt(e.target.value)}
                      required
                    />
                    <TextField
                      label="Término *"
                      type="datetime-local"
                      value={mwEndsAt}
                      onChange={(e) => setMwEndsAt(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="secondary" className="text-xs px-2.5 py-1" onClick={() => setIsScheduleMwOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" loading={createMwMutation.isPending} loadingLabel="Salvando…" className="text-xs px-2.5 py-1">
                      Confirmar Janela
                    </Button>
                  </div>
                </form>
              ) : null}

              {mwLoading ? (
                <p className="text-xs text-slate-500 italic">Carregando manutenções programadas…</p>
              ) : !mwData || mwData.items.length === 0 ? (
                <p className="text-xs text-slate-500 italic">
                  Nenhuma janela de manutenção cadastrada para este setor.
                </p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {mwData.items.map((mw) => {
                    const isCancelled = Boolean(mw.cancelledAt);
                    const now = new Date();
                    const isActive = !isCancelled && now >= new Date(mw.startsAt) && now <= new Date(mw.endsAt);
                    return (
                      <li key={mw.id} className="rounded-lg border border-slate-200 p-2.5 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{mw.reason}</span>
                            {isCancelled ? (
                              <Badge tone="neutral">Cancelada</Badge>
                            ) : isActive ? (
                              <Badge tone="warn">Em Andamento</Badge>
                            ) : (
                              <Badge tone="info">Agendada</Badge>
                            )}
                          </div>
                          <div className="text-slate-500 text-[11px] mt-0.5">
                            {new Date(mw.startsAt).toLocaleString('pt-BR')} até {new Date(mw.endsAt).toLocaleString('pt-BR')}
                          </div>
                        </div>
                        {canWrite && !isCancelled && (
                          <Button
                            variant="ghost"
                            className="text-xs text-red-600 hover:text-red-700 px-2 py-1"
                            onClick={() => cancelMwMutation.mutate(mw.id)}
                            loading={cancelMwMutation.isPending}
                          >
                            Cancelar
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex justify-end pt-3">
              <Button variant="secondary" onClick={() => setSelectedSector(null)}>
                Fechar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Modal de Criação de Setor */}
      <Modal open={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Cadastrar Setor de Abastecimento">
        <form onSubmit={(e) => { void handleCreate(e); }} className="space-y-4">
          {formError ? (
            <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {formError}
            </div>
          ) : null}

          <TextField
            label="Código do setor"
            required
            placeholder="Ex: SEC-CENTRO-01"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            hint="Identificador alfanumérico único para o setor."
          />

          <TextField
            label="Nome do setor"
            required
            placeholder="Ex: Setor Centro Histórico"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">Descrição (opcional)</label>
            <textarea
              className="block min-h-20 w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm text-slate-900"
              placeholder="Notas operacionais ou limites de bairros cobertos..."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={createMutation.isPending} loadingLabel="Salvando…">
              Salvar setor
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
