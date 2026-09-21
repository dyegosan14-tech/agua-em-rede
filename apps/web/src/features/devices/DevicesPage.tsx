import { useState } from 'react';
import { Activity, Check, Copy, Gauge, Key, MapPin, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router';
import type { DeviceDto, DeviceKind } from '@aer/contracts';
import { hasPermission } from '@aer/domain';
import { EmptyState, ErrorState, FreshnessNote, LoadingState } from '../../components/states';
import { TelemetryChart } from '../../components/TelemetryChart';
import { Badge, Button, Modal, PageHeader, SelectField, TextField } from '../../components/ui';
import { useSession } from '../auth/session';
import { useSectors } from '../sectors/sectors-api';
import { useTelemetryMeasurements } from '../telemetry/telemetry-api';
import {
  useCreateDevice,
  useCreateDeviceCredential,
  useDeviceCredentials,
  useDevices,
  useRevokeDeviceCredential,
  useUpdateDevice,
  type DevicesFilter,
} from './devices-api';

const KIND_LABELS: Record<DeviceKind, string> = {
  PRESSURE_SENSOR: 'Sensor de Pressão',
  FLOW_METER: 'Medidor de Vazão',
  MULTI_SENSOR: 'Sensor Multivariável',
};

export function DevicesPage() {
  const { data: session } = useSession();
  const [filter, setFilter] = useState<DevicesFilter>({ limit: 10, offset: 0 });
  const [searchInput, setSearchInput] = useState('');
  const [kindFilter, setKindFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedDevice, setSelectedDevice] = useState<DeviceDto | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Form fields for new device
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<DeviceKind>('PRESSURE_SENSOR');
  const [newSectorId, setNewSectorId] = useState('');
  const [newMin, setNewMin] = useState('0');
  const [newMax, setNewMax] = useState('100');
  const [newInterval, setNewInterval] = useState('300');
  const [formError, setFormError] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<'INFO' | 'CHART' | 'CREDENTIALS'>('INFO');
  const [newlyGeneratedSecret, setNewlyGeneratedSecret] = useState<{ secret: string; deviceCode: string } | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const { data, isLoading, isError, error, refetch, dataUpdatedAt, isFetching } = useDevices(filter);
  const { data: sectorsData } = useSectors({ limit: 100, offset: 0 });
  const createMutation = useCreateDevice();
  const updateMutation = useUpdateDevice(selectedDevice?.id ?? '');

  const createCredMutation = useCreateDeviceCredential(selectedDevice?.id ?? '');
  const revokeCredMutation = useRevokeDeviceCredential(selectedDevice?.id ?? '');
  const { data: credentialsData, isLoading: isCredsLoading } = useDeviceCredentials(selectedDevice?.id ?? null);
  const { data: telemetryData } = useTelemetryMeasurements({
    deviceId: selectedDevice?.id,
    metric: selectedDevice?.metrics[0],
    limit: 50,
  });

  if (!session) return null;
  const canWrite = hasPermission(session.user.role, 'devices:write');
  const canCredentials = hasPermission(session.user.role, 'devices:credentials');
  const timeZone = session.organization.timezone;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilter((prev) => ({
      ...prev,
      search: searchInput.trim() || undefined,
      kind: (kindFilter as DeviceKind) || undefined,
      status: (statusFilter as 'ACTIVE' | 'INACTIVE') || undefined,
      offset: 0,
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const minVal = parseFloat(newMin);
    const maxVal = parseFloat(newMax);

    if (isNaN(minVal) || isNaN(maxVal) || maxVal <= minVal) {
      setFormError('O valor máximo da faixa deve ser maior que o mínimo.');
      return;
    }

    try {
      await createMutation.mutateAsync({
        code: newCode.trim(),
        name: newName.trim(),
        kind: newKind,
        metrics: newKind === 'PRESSURE_SENSOR' ? ['PRESSURE'] : ['FLOW'],
        sectorId: newSectorId || null,
        rangePressureMin: newKind === 'PRESSURE_SENSOR' ? minVal : null,
        rangePressureMax: newKind === 'PRESSURE_SENSOR' ? maxVal : null,
        rangeFlowMin: newKind === 'FLOW_METER' ? minVal : null,
        rangeFlowMax: newKind === 'FLOW_METER' ? maxVal : null,
        expectedIntervalSeconds: parseInt(newInterval, 10) || 300,
        status: 'ACTIVE',
      });
      setIsCreateOpen(false);
      setNewCode('');
      setNewName('');
      setNewSectorId('');
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao cadastrar dispositivo.');
    }
  };

  const toggleStatus = async (device: DeviceDto) => {
    const nextStatus = device.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await updateMutation.mutateAsync({ status: nextStatus });
    setSelectedDevice((prev) => (prev ? { ...prev, status: nextStatus } : null));
  };

  return (
    <div>
      <PageHeader
        title="Dispositivos e Sensores"
        description="Instrumentos de campo para medição de pressão hidráulica e vazão volumétrica."
        actions={
          canWrite ? (
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus aria-hidden className="size-4" />
              Novo dispositivo
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-3">
          <TextField
            label="Buscar"
            placeholder="Código ou nome…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <SelectField
            label="Tipo"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
          >
            <option value="">Todos os tipos</option>
            <option value="PRESSURE_SENSOR">Sensor de Pressão</option>
            <option value="FLOW_METER">Medidor de Vazão</option>
          </SelectField>
          <SelectField
            label="Situação"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Todas</option>
            <option value="ACTIVE">Ativo</option>
            <option value="INACTIVE">Inativo</option>
          </SelectField>
          <Button type="submit" variant="secondary" className="mt-6">
            <Search aria-hidden className="size-4" />
            Filtrar
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
        <LoadingState label="Carregando dispositivos…" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => { void refetch(); }} title="Falha ao carregar dispositivos" />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="Nenhum dispositivo encontrado"
          description={filter.search || filter.kind || filter.status ? 'Tente ajustar os filtros.' : 'Cadastre o primeiro sensor na rede.'}
          action={
            canWrite && !filter.search ? (
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus aria-hidden className="size-4" />
                Cadastrar primeiro dispositivo
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
                  <th scope="col" className="px-5 py-3.5">Nome / Tipo</th>
                  <th scope="col" className="px-5 py-3.5">Faixa Operacional</th>
                  <th scope="col" className="px-5 py-3.5">Intervalo</th>
                  <th scope="col" className="px-5 py-3.5">Situação</th>
                  <th scope="col" className="px-5 py-3.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((device) => {
                  const isPressure = device.kind === 'PRESSURE_SENSOR';
                  const Icon = isPressure ? Gauge : Activity;
                  return (
                    <tr key={device.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-4 font-mono font-bold text-slate-900">{device.code}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`grid size-7 place-items-center rounded-lg ${isPressure ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            <Icon aria-hidden className="size-4" />
                          </span>
                          <div>
                            <p className="font-semibold text-slate-900">{device.name}</p>
                            <p className="text-xs text-slate-600">{KIND_LABELS[device.kind]}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs">
                        {isPressure
                          ? `${device.rangePressureMin ?? 0} a ${device.rangePressureMax ?? 0} mca`
                          : `${device.rangeFlowMin ?? 0} a ${device.rangeFlowMax ?? 0} m³/h`}
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-700">
                        {device.expectedIntervalSeconds} s ({Math.round(device.expectedIntervalSeconds / 60)} min)
                      </td>
                      <td className="px-5 py-4">
                        {device.status === 'ACTIVE' ? (
                          <Badge tone="ok">Ativo</Badge>
                        ) : (
                          <Badge tone="warn">Inativo</Badge>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Button variant="ghost" className="text-xs" onClick={() => setSelectedDevice(device)}>
                          Detalhes
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs text-slate-600">
            <span>
              Mostrando {data.items.length} de {data.page.total} dispositivo(s)
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

      {/* Modal de Detalhes */}
      <Modal open={selectedDevice !== null} onClose={() => setSelectedDevice(null)} title={selectedDevice ? `Dispositivo: ${selectedDevice.name}` : ''}>
        {selectedDevice ? (
          <div className="space-y-4 text-sm">
            {/* Abas de Navegação no Modal */}
            <div className="flex border-b border-slate-200 text-xs font-semibold gap-1">
              <button
                type="button"
                onClick={() => setModalTab('INFO')}
                className={`pb-2.5 px-3 border-b-2 transition-colors ${modalTab === 'INFO' ? 'border-brand-700 text-brand-900 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                Geral & Parâmetros
              </button>
              <button
                type="button"
                onClick={() => setModalTab('CHART')}
                className={`pb-2.5 px-3 border-b-2 transition-colors ${modalTab === 'CHART' ? 'border-brand-700 text-brand-900 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                Curva de Telemetria
              </button>
              <button
                type="button"
                onClick={() => setModalTab('CREDENTIALS')}
                className={`pb-2.5 px-3 border-b-2 transition-colors ${modalTab === 'CREDENTIALS' ? 'border-brand-700 text-brand-900 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                Comunicação IoT / Chaves
              </button>
            </div>

            {modalTab === 'INFO' && (
              <div className="space-y-4">
                <div className="rounded-xl bg-slate-50 p-4">
                  <dl className="space-y-2">
                    <div className="flex justify-between">
                      <dt className="text-slate-700">Código</dt>
                      <dd className="font-mono font-bold text-slate-900">{selectedDevice.code}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-700">Tipo</dt>
                      <dd className="font-medium text-slate-900">{KIND_LABELS[selectedDevice.kind]}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-700">Métricas</dt>
                      <dd className="font-mono text-xs text-slate-900">{selectedDevice.metrics.join(', ')}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-700">Faixa Físico-Operacional</dt>
                      <dd className="font-mono text-xs font-semibold text-slate-900">
                        {selectedDevice.kind === 'PRESSURE_SENSOR'
                          ? `${selectedDevice.rangePressureMin ?? 0} a ${selectedDevice.rangePressureMax ?? 0} mca`
                          : `${selectedDevice.rangeFlowMin ?? 0} a ${selectedDevice.rangeFlowMax ?? 0} m³/h`}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-700">Intervalo de Transmissão</dt>
                      <dd className="text-slate-900">{selectedDevice.expectedIntervalSeconds} segundos</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-700">Situação</dt>
                      <dd>{selectedDevice.status === 'ACTIVE' ? <Badge tone="ok">Ativo</Badge> : <Badge tone="warn">Inativo</Badge>}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-700">Origem</dt>
                      <dd>{selectedDevice.isFictional ? <Badge tone="warn">Fictício (seed)</Badge> : <Badge tone="ok">Real</Badge>}</dd>
                    </div>
                  </dl>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  <Link
                    to="/mapa"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900"
                  >
                    <MapPin className="size-3.5" />
                    Localizar no Mapa GIS
                  </Link>

                  {canWrite ? (
                    <Button
                      variant="secondary"
                      onClick={() => { void toggleStatus(selectedDevice); }}
                      loading={updateMutation.isPending}
                    >
                      <SlidersHorizontal aria-hidden className="size-4" />
                      {selectedDevice.status === 'ACTIVE' ? 'Desativar dispositivo' : 'Ativar dispositivo'}
                    </Button>
                  ) : null}
                </div>
              </div>
            )}

            {modalTab === 'CHART' && (
              <div className="space-y-4">
                <p className="text-xs text-slate-500">
                  Histórico de telemetria das últimas horas. Mostra leituras registradas e faixas de corte.
                </p>
                <TelemetryChart
                  measurements={telemetryData?.items ?? []}
                  metric={selectedDevice.kind === 'PRESSURE_SENSOR' ? 'PRESSURE' : 'FLOW'}
                  minThreshold={selectedDevice.kind === 'PRESSURE_SENSOR' ? selectedDevice.rangePressureMin : selectedDevice.rangeFlowMin}
                  maxThreshold={selectedDevice.kind === 'PRESSURE_SENSOR' ? selectedDevice.rangePressureMax : selectedDevice.rangeFlowMax}
                  title={`Hidrograma Recente: ${selectedDevice.name}`}
                />
              </div>
            )}

            {modalTab === 'CREDENTIALS' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3.5 text-xs text-brand-900 leading-relaxed">
                  <strong>Comunicação Direta IoT:</strong> Transmissões de telemetria de campo usam chave de 256 bits com SHA-256 no cabeçalho <code className="bg-brand-100 px-1 py-0.5 rounded font-mono">X-Device-Key</code> no endpoint <code className="bg-brand-100 px-1 py-0.5 rounded font-mono">/api/telemetry/device-ingest</code>.
                </div>

                {canCredentials && (
                  <div className="flex justify-end">
                    <Button
                      onClick={() => {
                        void (async () => {
                          const res = await createCredMutation.mutateAsync('Chave de Campo');
                          setNewlyGeneratedSecret({ secret: res.secret, deviceCode: selectedDevice.code });
                          setCopiedSecret(false);
                        })();
                      }}
                      loading={createCredMutation.isPending}
                      loadingLabel="Gerando Chave…"
                      className="text-xs"
                    >
                      <Key className="size-3.5" />
                      Gerar Nova Chave IoT
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase">Chaves Registradas</h4>
                  {isCredsLoading ? (
                    <p className="text-xs text-slate-400">Carregando credenciais…</p>
                  ) : !credentialsData || credentialsData.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">Nenhuma chave gerada para este sensor.</p>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase font-bold text-slate-600">
                          <tr>
                            <th className="px-3 py-2">Identificador</th>
                            <th className="px-3 py-2">Criada em</th>
                            <th className="px-3 py-2">Último Uso</th>
                            <th className="px-3 py-2">Status</th>
                            {canCredentials && <th className="px-3 py-2 text-right">Ação</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {credentialsData.map((c) => (
                            <tr key={c.id}>
                              <td className="px-3 py-2 font-mono font-medium text-slate-800">
                                {c.id.substring(0, 8)}…
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                {c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleString('pt-BR') : 'Nunca utilizada'}
                              </td>
                              <td className="px-3 py-2">
                                {c.revokedAt ? (
                                  <Badge tone="warn">Revogada</Badge>
                                ) : (
                                  <Badge tone="ok">Ativa</Badge>
                                )}
                              </td>
                              {canCredentials && (
                                <td className="px-3 py-2 text-right">
                                  {!c.revokedAt && (
                                    <button
                                      type="button"
                                      onClick={() => void revokeCredMutation.mutateAsync(c.id)}
                                      className="text-red-600 hover:text-red-800 font-semibold text-[11px]"
                                      title="Revogar chave"
                                    >
                                      Revogar
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-200">
              <Button variant="ghost" onClick={() => setSelectedDevice(null)}>
                Fechar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Modal de Exibição do Segredo Gerado */}
      <Modal
        open={Boolean(newlyGeneratedSecret)}
        onClose={() => setNewlyGeneratedSecret(null)}
        title="Chave de Comunicação IoT Gerada"
      >
        {newlyGeneratedSecret && (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 font-medium">
              Atenção: Esta chave só será exibida <strong>uma única vez</strong>. Copie-a e configure no firmware do sensor ou gateway de campo.
            </div>

            <div>
              <label className="block font-bold text-slate-800 mb-1">Chave Secreta de 256 bits (Header X-Device-Key):</label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={newlyGeneratedSecret.secret}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 select-all"
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(newlyGeneratedSecret.secret);
                    setCopiedSecret(true);
                  }}
                >
                  {copiedSecret ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                  {copiedSecret ? 'Copiado!' : 'Copiar'}
                </Button>
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-800 mb-1">Comando cURL de Teste / Exemplo:</label>
              <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] text-emerald-400 font-mono">
{`curl -X POST http://localhost:3000/api/telemetry/device-ingest \\
  -H "X-Device-Key: ${newlyGeneratedSecret.secret}" \\
  -H "Content-Type: application/json" \\
  -d '{"items": [{"metric": "PRESSURE", "value": 34.2}]}'`}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setNewlyGeneratedSecret(null)}>
                Concluir & Fechar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Criação */}
      <Modal open={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Cadastrar Novo Dispositivo">
        <form onSubmit={(e) => { void handleCreate(e); }} className="space-y-4">
          {formError ? (
            <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {formError}
            </div>
          ) : null}

          <TextField
            label="Código do dispositivo"
            required
            placeholder="Ex: DEMO-P02"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            hint="Identificador do instrumento de campo."
          />

          <TextField
            label="Nome descritivo"
            required
            placeholder="Ex: Sensor de Pressão - Válvula 01"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />

          <SelectField
            label="Tipo de Instrumento"
            value={newKind}
            onChange={(e) => {
              const k = e.target.value as DeviceKind;
              setNewKind(k);
              if (k === 'PRESSURE_SENSOR') {
                setNewMin('0');
                setNewMax('100');
              } else {
                setNewMin('0');
                setNewMax('500');
              }
            }}
          >
            <option value="PRESSURE_SENSOR">Sensor de Pressão (mca)</option>
            <option value="FLOW_METER">Medidor de Vazão (m³/h)</option>
          </SelectField>

          {sectorsData && sectorsData.items.length > 0 ? (
            <SelectField
              label="Setor vinculado (opcional)"
              value={newSectorId}
              onChange={(e) => setNewSectorId(e.target.value)}
            >
              <option value="">Sem setor vinculado</option>
              {sectorsData.items.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.code} - {sec.name}
                </option>
              ))}
            </SelectField>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={newKind === 'PRESSURE_SENSOR' ? 'Pressão Mín (mca)' : 'Vazão Mín (m³/h)'}
              required
              type="number"
              step="any"
              value={newMin}
              onChange={(e) => setNewMin(e.target.value)}
            />
            <TextField
              label={newKind === 'PRESSURE_SENSOR' ? 'Pressão Máx (mca)' : 'Vazão Máx (m³/h)'}
              required
              type="number"
              step="any"
              value={newMax}
              onChange={(e) => setNewMax(e.target.value)}
            />
          </div>

          <TextField
            label="Intervalo esperado entre leituras (segundos)"
            type="number"
            min={10}
            max={86400}
            value={newInterval}
            onChange={(e) => setNewInterval(e.target.value)}
            hint="Padrão: 300 segundos (5 minutos)."
          />

          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={createMutation.isPending} loadingLabel="Salvando…">
              Cadastrar dispositivo
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
