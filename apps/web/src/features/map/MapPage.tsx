import { useState } from 'react';
import { Activity, Filter, Gauge, MapPin, RefreshCw } from 'lucide-react';
import type { DeviceDto, SectorDto } from '@aer/contracts';
import { NetworkMap } from '../../components/NetworkMap';
import { ErrorState, LoadingState } from '../../components/states';
import { Badge, Button, PageHeader, SelectField } from '../../components/ui';
import { useDevices } from '../devices/devices-api';
import { useSectors } from '../sectors/sectors-api';

export function MapPage() {
  const [selectedSectorId, setSelectedSectorId] = useState<string>('');
  const [kindFilter, setKindFilter] = useState<string>('');
  const [activeDevice, setActiveDevice] = useState<DeviceDto | null>(null);
  const [activeSector, setActiveSector] = useState<SectorDto | null>(null);

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
    limit: 100,
    offset: 0,
  });

  const isLoading = isSectorsLoading || isDevicesLoading;
  const isError = isSectorsError || isDevicesError;

  const handleDeviceSelect = (dev: DeviceDto) => {
    setActiveDevice(dev);
    // Encontra o setor correspondente
    const sec = sectorsData?.items.find((s) => s.id === dev.sectorId);
    if (sec) setActiveSector(sec);
  };

  const handleSectorSelect = (sec: SectorDto) => {
    setActiveSector(sec);
    setSelectedSectorId(sec.id);
  };

  const pressureCount = devicesData?.items.filter((d) => d.kind === 'PRESSURE_SENSOR').length ?? 0;
  const flowCount = devicesData?.items.filter((d) => d.kind === 'FLOW_METER').length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mapa Geográfico da Rede (GIS)"
        description="Visualização espacial de setores de manobra, sensores de pressão e medidores de vazão da Região Metropolitana do Recife."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              void refetchSectors();
              void refetchDevices();
            }}
          >
            <RefreshCw className="size-4" />
            Atualizar Mapa
          </Button>
        }
      />

      {/* Barra de Filtros e Indicadores Espaciais */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {/* Painel de Filtros */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs lg:col-span-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Filter className="size-4 text-slate-500" />
            Filtros:
          </div>

          <div className="w-56">
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

          <div className="w-52">
            <SelectField
              label=""
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
            >
              <option value="">Todos os Instrumentos</option>
              <option value="PRESSURE_SENSOR">Sensores de Pressão</option>
              <option value="FLOW_METER">Medidores de Vazão</option>
            </SelectField>
          </div>

          {(selectedSectorId || kindFilter) && (
            <button
              type="button"
              onClick={() => {
                setSelectedSectorId('');
                setKindFilter('');
              }}
              className="text-xs font-semibold text-brand-700 hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* Resumo Rápido */}
        <div className="flex items-center justify-around rounded-2xl border border-slate-200 bg-white p-4 shadow-xs text-center">
          <div>
            <div className="text-xl font-extrabold text-blue-600">{pressureCount}</div>
            <div className="text-[10px] uppercase font-semibold text-slate-500">Pressão</div>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div>
            <div className="text-xl font-extrabold text-emerald-600">{flowCount}</div>
            <div className="text-[10px] uppercase font-semibold text-slate-500">Vazão</div>
          </div>
          <div className="h-8 w-px bg-slate-200" />
          <div>
            <div className="text-xl font-extrabold text-brand-900">{sectorsData?.items.length ?? 0}</div>
            <div className="text-[10px] uppercase font-semibold text-slate-500">Setores</div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Carregando malha espacial de Recife…" />
      ) : isError ? (
        <ErrorState
          error={sectorsError ?? devicesError}
          onRetry={() => {
            void refetchSectors();
            void refetchDevices();
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Mapa Principal */}
          <div className="lg:col-span-2">
            <NetworkMap
              sectors={sectorsData?.items ?? []}
              devices={devicesData?.items ?? []}
              selectedDeviceId={activeDevice?.id}
              selectedSectorId={activeSector?.id}
              onSelectDevice={handleDeviceSelect}
              onSelectSector={handleSectorSelect}
              className="h-[620px] w-full rounded-2xl shadow-sm"
            />
          </div>

          {/* Painel Lateral de Detalhes do Elemento Selecionado */}
          <div className="space-y-4">
            {activeDevice ? (
              <div className="rounded-2xl border border-brand-200 bg-white p-5 shadow-xs space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-mono font-bold text-slate-700">{activeDevice.code}</span>
                    <h3 className="text-base font-bold text-slate-900">{activeDevice.name}</h3>
                  </div>
                  <Badge tone={activeDevice.status === 'ACTIVE' ? 'ok' : 'warn'}>
                    {activeDevice.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                  {activeDevice.kind === 'PRESSURE_SENSOR' ? (
                    <Gauge className="size-5 text-blue-600 shrink-0" />
                  ) : (
                    <Activity className="size-5 text-emerald-600 shrink-0" />
                  )}
                  <div>
                    <div className="font-semibold text-slate-800">
                      {activeDevice.kind === 'PRESSURE_SENSOR' ? 'Sensor de Pressão Hidráulica' : 'Medidor de Vazão Volumétrica'}
                    </div>
                    <div className="text-slate-500 font-mono">
                      Faixa: {activeDevice.kind === 'PRESSURE_SENSOR'
                        ? `${activeDevice.rangePressureMin ?? 0} a ${activeDevice.rangePressureMax ?? 0} mca`
                        : `${activeDevice.rangeFlowMin ?? 0} a ${activeDevice.rangeFlowMax ?? 0} m³/h`}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                  <div className="flex justify-between">
                    <span>Intervalo de Transmissão:</span>
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
                    <span>{activeDevice.isFictional ? 'Simulado / Demo' : 'Instrumento Real'}</span>
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
            ) : activeSector ? (
              <div className="rounded-2xl border border-brand-200 bg-white p-5 shadow-xs space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-mono font-bold text-slate-700">{activeSector.code}</span>
                    <h3 className="text-base font-bold text-slate-900">{activeSector.name}</h3>
                  </div>
                  <Badge tone="ok">Setor Ativo</Badge>
                </div>

                {activeSector.description && (
                  <p className="text-xs text-slate-600">{activeSector.description}</p>
                )}

                <div className="rounded-xl bg-slate-50 p-3 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-700">Regime de Manobra:</span>
                    <span className="font-mono font-bold text-brand-900">
                      {activeSector.supplySchedule.length > 0
                        ? `${activeSector.supplySchedule.length} janela(s)`
                        : 'Contínuo'}
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
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 space-y-3">
                <div className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                  <MapPin className="size-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">Nenhum Ponto Selecionado</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Clique em um sensor no mapa ou em um setor para inspecionar parâmetros, histórico e alertas.
                  </p>
                </div>
              </div>
            )}

            {/* Guia Rápido de Interpretação */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs text-xs space-y-2">
              <span className="font-bold text-slate-800 block">Dica Operacional:</span>
              <p className="text-slate-600 leading-relaxed">
                Os setores com traçado azul delimitam as Zonas de Pressão de Recife. Em caso de anomalia, o sensor piscará com anel pulsante vermelho no mapa.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
