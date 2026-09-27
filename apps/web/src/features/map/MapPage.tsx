import { useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  Droplets,
  Filter,
  Flame,
  Gauge,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type { AlertDto, DeviceDto, NetworkAssetDto, SectorDto } from '@aer/contracts';
import { NetworkMap } from '../../components/NetworkMap';
import { ErrorState, LoadingState } from '../../components/states';
import { Badge, Button, PageHeader, SelectField } from '../../components/ui';
import { useAlerts } from '../alerts/alerts-api';
import { useDevices } from '../devices/devices-api';
import { useNetworkAssets } from '../network-assets/network-assets-api';
import { useSectors } from '../sectors/sectors-api';

export function MapPage() {
  // Filtros avançados
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSectorId, setSelectedSectorId] = useState<string>('');
  const [kindFilter, setKindFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');

  // Seleções no mapa
  const [activeDevice, setActiveDevice] = useState<DeviceDto | null>(null);
  const [activeSector, setActiveSector] = useState<SectorDto | null>(null);
  const [activeAsset, setActiveAsset] = useState<NetworkAssetDto | null>(null);
  const [activeAlert, setActiveAlert] = useState<AlertDto | null>(null);

  // Consultas à API
  const {
    data: sectorsData,
    isLoading: isSectorsLoading,
    isError: isSectorsError,
    error: sectorsError,
    refetch: refetchSectors,
  } = useSectors({ limit: 100, offset: 0 });

  const {
    data: devicesData,
    isLoading: isDevicesLoading,
    isError: isDevicesError,
    error: devicesError,
    refetch: refetchDevices,
  } = useDevices({
    sectorId: selectedSectorId || undefined,
    kind: (kindFilter as DeviceDto['kind']) || undefined,
    limit: 200,
    offset: 0,
  });

  const {
    data: assetsData,
    isLoading: isAssetsLoading,
    refetch: refetchAssets,
  } = useNetworkAssets({
    sectorId: selectedSectorId || undefined,
    limit: 200,
  });

  const {
    data: alertsData,
    isLoading: isAlertsLoading,
    refetch: refetchAlerts,
  } = useAlerts({ limit: 200, offset: 0 });

  const isLoading = isSectorsLoading || isDevicesLoading || isAssetsLoading || isAlertsLoading;
  const isError = isSectorsError || isDevicesError;

  // Mapa de alertas abertos por dispositivo
  const activeAlertsByDeviceId = useMemo(() => {
    const map = new Map<string, AlertDto[]>();
    alertsData?.items
      ?.filter((a) => a.status !== 'RESOLVED' && a.status !== 'DISMISSED')
      .forEach((alert) => {
        if (!alert.deviceId) return;
        const list = map.get(alert.deviceId) ?? [];
        list.push(alert);
        map.set(alert.deviceId, list);
      });
    return map;
  }, [alertsData]);

  // Dispositivos filtrados por status e busca de texto
  const filteredDevices = useMemo(() => {
    let items = devicesData?.items ?? [];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (d) =>
          d.code.toLowerCase().includes(q) ||
          d.name.toLowerCase().includes(q) ||
          (d.kind === 'PRESSURE_SENSOR' && 'pressão'.includes(q)) ||
          (d.kind === 'FLOW_METER' && 'vazão'.includes(q)),
      );
    }

    if (statusFilter === 'ALERT') {
      items = items.filter((d) => (activeAlertsByDeviceId.get(d.id)?.length ?? 0) > 0);
    } else if (statusFilter === 'ACTIVE') {
      items = items.filter((d) => d.status === 'ACTIVE');
    } else if (statusFilter === 'INACTIVE') {
      items = items.filter((d) => d.status === 'INACTIVE');
    }

    if (severityFilter) {
      items = items.filter((d) => {
        const devAlerts = activeAlertsByDeviceId.get(d.id) ?? [];
        return devAlerts.some((a) => a.severity === severityFilter);
      });
    }

    return items;
  }, [devicesData, searchQuery, statusFilter, severityFilter, activeAlertsByDeviceId]);

  // Setores filtrados
  const filteredSectors = useMemo(() => {
    let items = sectorsData?.items ?? [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((s) => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    }
    return items;
  }, [sectorsData, searchQuery]);

  // Seleções do mapa
  const handleDeviceSelect = (dev: DeviceDto) => {
    setActiveDevice(dev);
    setActiveAsset(null);
    const sec = sectorsData?.items.find((s) => s.id === dev.sectorId);
    if (sec) setActiveSector(sec);
    const devAlerts = activeAlertsByDeviceId.get(dev.id);
    if (devAlerts && devAlerts[0]) setActiveAlert(devAlerts[0]);
    else setActiveAlert(null);
  };

  const handleSectorSelect = (sec: SectorDto) => {
    setActiveSector(sec);
    setActiveDevice(null);
    setActiveAsset(null);
  };

  const handleAssetSelect = (asset: NetworkAssetDto) => {
    setActiveAsset(asset);
    setActiveDevice(null);
    const sec = sectorsData?.items.find((s) => s.id === asset.sectorId);
    if (sec) setActiveSector(sec);
  };

  const handleAlertSelect = (alert: AlertDto) => {
    setActiveAlert(alert);
    if (alert.deviceId) {
      const dev = devicesData?.items.find((d) => d.id === alert.deviceId);
      if (dev) setActiveDevice(dev);
    }
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedSectorId('');
    setKindFilter('');
    setStatusFilter('');
    setSeverityFilter('');
  };

  const hasActiveFilters = Boolean(
    searchQuery || selectedSectorId || kindFilter || statusFilter || severityFilter,
  );

  // Métricas
  const pressureCount = filteredDevices.filter((d) => d.kind === 'PRESSURE_SENSOR').length;
  const flowCount = filteredDevices.filter((d) => d.kind === 'FLOW_METER').length;
  const alertSensorsCount = filteredDevices.filter(
    (d) => (activeAlertsByDeviceId.get(d.id)?.length ?? 0) > 0,
  ).length;
  const pipesCount = assetsData?.items.filter((a) => a.kind === 'PIPE').length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mapa Geográfico da Rede (GIS)"
        description="Monitoramento geoespacial em tempo real: setores de manobra, malha de adutoras, telemetria e mapa de calor de anomalias na RMR."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              void refetchSectors();
              void refetchDevices();
              void refetchAssets();
              void refetchAlerts();
            }}
          >
            <RefreshCw className="size-4" />
            Atualizar Malha
          </Button>
        }
      />

      {/* Barra de Filtros Avançados */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-4">
        {/* Linha 1: Busca e Seletores Rápidos */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5 items-center">
          {/* Campo de Busca Livre */}
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar código, sensor, rua ou setor..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-8 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Filtro de Setor */}
          <div>
            <SelectField
              label=""
              value={selectedSectorId}
              onChange={(e) => setSelectedSectorId(e.target.value)}
            >
              <option value="">Todos os Setores ({sectorsData?.items.length ?? 0})</option>
              {sectorsData?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} - {s.name}
                </option>
              ))}
            </SelectField>
          </div>

          {/* Filtro de Tipo de Instrumento */}
          <div>
            <SelectField
              label=""
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
            >
              <option value="">Todos os Instrumentos</option>
              <option value="PRESSURE_SENSOR">Sensores de Pressão (mca)</option>
              <option value="FLOW_METER">Medidores de Vazão (m³/h)</option>
            </SelectField>
          </div>

          {/* Filtro de Status Operacional */}
          <div>
            <SelectField
              label=""
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Todos os Status</option>
              <option value="ALERT">⚠ Em Alerta / Anomalia</option>
              <option value="ACTIVE">✓ Operação Normal (Ativo)</option>
              <option value="INACTIVE">✕ Inativo / Sem Comunicação</option>
            </SelectField>
          </div>
        </div>

        {/* Linha 2: Filtro de Severidade e Indicadores Rápidos */}
        <div className="flex flex-wrap items-center justify-between border-t border-slate-100 pt-3 text-xs gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-600 flex items-center gap-1">
              <Filter className="size-3.5 text-slate-400" /> Severidade:
            </span>
            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => {
              const isSelected = severityFilter === sev;
              const labels = {
                CRITICAL: 'Crítico',
                HIGH: 'Alto',
                MEDIUM: 'Médio',
                LOW: 'Baixo',
              };
              return (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSeverityFilter(isSelected ? '' : sev)}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition-colors ${
                    isSelected
                      ? sev === 'CRITICAL'
                        ? 'bg-red-600 text-white'
                        : sev === 'HIGH'
                        ? 'bg-amber-600 text-white'
                        : 'bg-brand-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {labels[sev]}
                </button>
              );
            })}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="ml-2 font-bold text-brand-700 hover:underline"
              >
                Limpar todos os filtros
              </button>
            )}
          </div>

          {/* Contadores da Malha */}
          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="text-slate-600">
              Exibindo <b className="text-slate-900">{filteredDevices.length}</b> nós na tela
            </span>
            {alertSensorsCount > 0 && (
              <span className="flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-red-800 font-bold">
                <AlertTriangle className="size-3.5" />
                {alertSensorsCount} com alerta
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Cards de Métricas no Topo */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Sensores de Pressão</span>
            <Gauge className="size-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-blue-600">{pressureCount}</div>
          <div className="mt-1 text-[11px] text-slate-500">Pontos em monitoramento contínuo</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Medidores de Vazão</span>
            <Activity className="size-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-600">{flowCount}</div>
          <div className="mt-1 text-[11px] text-slate-500">Macromedidores e pitometrias</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Adutoras e Tubulações</span>
            <Droplets className="size-4 text-cyan-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-cyan-700">{pipesCount} trechos</div>
          <div className="mt-1 text-[11px] text-slate-500">Redes primárias cadastradas</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider">Risco Hidráulico</span>
            <Flame className="size-4 text-red-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-red-600">
            {alertSensorsCount > 0 ? `${alertSensorsCount} Anomalias` : 'Estável'}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {alertSensorsCount > 0 ? 'Foco em detecção rápida' : 'Nenhuma violação crítica'}
          </div>
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Carregando malha espacial, ativos de rede e dados de telemetria..." />
      ) : isError ? (
        <ErrorState
          error={sectorsError ?? devicesError}
          onRetry={() => {
            void refetchSectors();
            void refetchDevices();
            void refetchAssets();
            void refetchAlerts();
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Mapa Principal Aprimorado */}
          <div className="lg:col-span-2">
            <NetworkMap
              sectors={filteredSectors}
              devices={filteredDevices}
              networkAssets={assetsData?.items ?? []}
              alerts={alertsData?.items ?? []}
              selectedDeviceId={activeDevice?.id}
              selectedSectorId={activeSector?.id}
              selectedAssetId={activeAsset?.id}
              onSelectDevice={handleDeviceSelect}
              onSelectSector={handleSectorSelect}
              onSelectAsset={handleAssetSelect}
              onSelectAlert={handleAlertSelect}
              className="h-[640px] w-full rounded-2xl shadow-md"
            />
          </div>

          {/* Painel Lateral de Detalhes e Ações */}
          <div className="space-y-4">
            {activeDevice ? (
              <div className="rounded-2xl border border-brand-200 bg-white p-5 shadow-xs space-y-4 animate-in fade-in duration-200">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-mono font-bold text-slate-600">{activeDevice.code}</span>
                    <h3 className="text-base font-bold text-slate-900">{activeDevice.name}</h3>
                  </div>
                  <Badge tone={activeDevice.status === 'ACTIVE' ? 'ok' : 'warn'}>
                    {activeDevice.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>

                {/* Banner de Alerta Ativo se houver */}
                {activeAlertsByDeviceId.get(activeDevice.id)?.length ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-red-900">
                      <AlertTriangle className="size-4 text-red-600" />
                      Anomalia em Aberto
                    </div>
                    <p className="text-red-700">
                      {activeAlertsByDeviceId.get(activeDevice.id)![0]?.title}
                    </p>
                    <div className="text-[10px] text-red-600">
                      Detectado em:{' '}
                      {new Date(
                        activeAlertsByDeviceId.get(activeDevice.id)![0]!.firstDetectedAt,
                      ).toLocaleString('pt-BR')}
                    </div>
                  </div>
                ) : null}

                {/* Card do Instrumento */}
                <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 p-3 text-xs">
                  {activeDevice.kind === 'PRESSURE_SENSOR' ? (
                    <Gauge className="size-5 text-blue-600 shrink-0" />
                  ) : (
                    <Activity className="size-5 text-emerald-600 shrink-0" />
                  )}
                  <div>
                    <div className="font-semibold text-slate-800">
                      {activeDevice.kind === 'PRESSURE_SENSOR'
                        ? 'Sensor de Pressão Hidráulica'
                        : 'Medidor de Vazão Volumétrica'}
                    </div>
                    <div className="text-slate-500 font-mono text-[11px]">
                      Faixa Operacional:{' '}
                      {activeDevice.kind === 'PRESSURE_SENSOR'
                        ? `${activeDevice.rangePressureMin ?? 0} a ${activeDevice.rangePressureMax ?? 0} mca`
                        : `${activeDevice.rangeFlowMin ?? 0} a ${activeDevice.rangeFlowMax ?? 0} m³/h`}
                    </div>
                  </div>
                </div>

                {/* Barra Gráfica de Faixa Permitida */}
                {activeDevice.kind === 'PRESSURE_SENSOR' && (
                  <div className="space-y-1.5 rounded-xl bg-slate-50/80 p-3 text-xs border border-slate-100">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-700">
                      <span>Faixa Segura de Pressão</span>
                      <span className="font-mono text-blue-700">
                        {activeDevice.rangePressureMin ?? 10} - {activeDevice.rangePressureMax ?? 45} mca
                      </span>
                    </div>
                    <div className="relative h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div className="absolute inset-y-0 left-[20%] right-[20%] bg-emerald-500/70" />
                      <div className="absolute inset-y-0 left-0 w-[20%] bg-red-400" />
                      <div className="absolute inset-y-0 right-0 w-[20%] bg-red-400" />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-400">
                      <span>Subpressão (&lt;{activeDevice.rangePressureMin ?? 10})</span>
                      <span className="text-emerald-700 font-bold">Faixa Ideal</span>
                      <span>Sobrepressão (&gt;{activeDevice.rangePressureMax ?? 45})</span>
                    </div>
                  </div>
                )}

                <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                  <div className="flex justify-between">
                    <span>Intervalo de Envio:</span>
                    <span className="font-bold text-slate-800">{activeDevice.expectedIntervalSeconds}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Última Transmissão:</span>
                    <span className="font-mono text-slate-800">
                      {activeDevice.lastReceivedAt
                        ? new Date(activeDevice.lastReceivedAt).toLocaleString('pt-BR')
                        : 'Sem telemetria recente'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Origem dos Dados:</span>
                    <span>{activeDevice.isFictional ? 'Simulado / Piloto' : 'Instrumento Real'}</span>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  className="w-full justify-center text-xs"
                  onClick={() => setActiveDevice(null)}
                >
                  Fechar Detalhes
                </Button>
              </div>
            ) : activeAsset ? (
              <div className="rounded-2xl border border-cyan-200 bg-white p-5 shadow-xs space-y-4 animate-in fade-in duration-200">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-mono font-bold text-cyan-800">{activeAsset.code}</span>
                    <h3 className="text-base font-bold text-slate-900">{activeAsset.name}</h3>
                  </div>
                  <Badge tone="info">
                    {activeAsset.kind === 'PIPE' ? 'Tubulação' : 'Válvula'}
                  </Badge>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Tipo de Ativo:</span>
                    <span className="font-bold text-slate-800">
                      {activeAsset.kind === 'PIPE'
                        ? 'Rede de Distribuição / Adutora'
                        : 'Válvula Redutora de Pressão (VRP)'}
                    </span>
                  </div>
                  {activeAsset.properties?.diameterMm ? (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Diâmetro Nominal:</span>
                      <span className="font-mono font-bold text-cyan-800">
                        DN {String(activeAsset.properties.diameterMm)} mm
                      </span>
                    </div>
                  ) : null}
                  {activeAsset.properties?.material ? (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Material Construtivo:</span>
                      <span className="text-slate-800 font-medium">
                        {String(activeAsset.properties.material)}
                      </span>
                    </div>
                  ) : null}
                </div>

                <Button
                  variant="secondary"
                  className="w-full justify-center text-xs"
                  onClick={() => setActiveAsset(null)}
                >
                  Limpar Seleção
                </Button>
              </div>
            ) : activeSector ? (
              <div className="rounded-2xl border border-brand-200 bg-white p-5 shadow-xs space-y-4 animate-in fade-in duration-200">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-mono font-bold text-slate-600">{activeSector.code}</span>
                    <h3 className="text-base font-bold text-slate-900">{activeSector.name}</h3>
                  </div>
                  <Badge tone="ok">Bacia Hidráulica</Badge>
                </div>

                {activeSector.description && (
                  <p className="text-xs text-slate-600 leading-relaxed">{activeSector.description}</p>
                )}

                <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-700">Regime de Abastecimento:</span>
                    <span className="font-mono font-bold text-brand-900">
                      {activeSector.supplySchedule.length > 0
                        ? `${activeSector.supplySchedule.length} janela(s) programada(s)`
                        : 'Abastecimento Contínuo'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Sensores Instalados:</span>
                    <span className="font-bold text-slate-900">
                      {devicesData?.items.filter((d) => d.sectorId === activeSector.id).length ?? 0} unidades
                    </span>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  className="w-full justify-center text-xs"
                  onClick={() => setActiveSector(null)}
                >
                  Limpar Seleção
                </Button>
              </div>
            ) : activeAlert ? (
              <div className="rounded-2xl border border-red-200 bg-white p-5 shadow-xs space-y-4 animate-in fade-in duration-200">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-mono font-bold text-red-700">Alerta de Anomalia</span>
                    <h3 className="text-base font-bold text-slate-900">{activeAlert.title}</h3>
                  </div>
                  <Badge tone={activeAlert.severity === 'CRITICAL' ? 'critical' : 'warn'}>
                    {activeAlert.severity}
                  </Badge>
                </div>

                <div className="rounded-xl bg-red-50 p-3 text-xs space-y-2 border border-red-100">
                  <div className="flex justify-between">
                    <span className="text-red-800 font-semibold">Prioridade Operacional:</span>
                    <span className="font-mono font-bold text-red-900">Score {activeAlert.priorityScore}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-700">Detectado em:</span>
                    <span className="font-mono text-red-900">
                      {new Date(activeAlert.firstDetectedAt).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-700">Total de Ocorrências:</span>
                    <span className="font-bold text-red-900">{activeAlert.occurrences}x</span>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  className="w-full justify-center text-xs"
                  onClick={() => setActiveAlert(null)}
                >
                  Fechar Alerta
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center text-slate-500 space-y-3">
                <div className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                  <MapPin className="size-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">Nenhum Elemento Selecionado</h4>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    Clique em qualquer ponto de sensor, trecho de tubulação ou setor no mapa para inspecionar métricas, limites e anomalias.
                  </p>
                </div>
              </div>
            )}

            {/* Painel Operacional de Resumo Rápido */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs text-xs space-y-3">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <Sparkles className="size-4 text-brand-600" />
                Guia Operacional do Mapa GIS
              </span>
              <ul className="space-y-2 text-slate-600 leading-relaxed list-disc list-inside">
                <li>
                  <b className="text-slate-800">Mapa de Calor (Heatmap)</b>: Pressione o botão superior direito para sintetizar zonas térmicas de estresse de pressão e anomalias.
                </li>
                <li>
                  <b className="text-slate-800">Camadas & Estilos</b>: Alterne entre a visão Clara e o modo Escuro CCO para alta visibilidade noturna das adutoras.
                </li>
                <li>
                  <b className="text-slate-800">Alertas Pulsantes</b>: Nós com círculos pulsantes vermelhos indicam anomalias ativas que exigem despacho de ordem de serviço.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
