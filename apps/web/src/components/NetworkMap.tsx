import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { AlertDto, DeviceDto, NetworkAssetDto, SectorDto } from '@aer/contracts';
import L from 'leaflet';
import {
  Layers,
  Flame,
  SlidersHorizontal,
  Maximize2,
  Check,
} from 'lucide-react';

export interface NetworkMapProps {
  sectors?: SectorDto[];
  devices?: DeviceDto[];
  networkAssets?: NetworkAssetDto[];
  alerts?: AlertDto[];
  selectedDeviceId?: string | null;
  selectedSectorId?: string | null;
  selectedAssetId?: string | null;
  onSelectDevice?: (device: DeviceDto) => void;
  onSelectSector?: (sector: SectorDto) => void;
  onSelectAsset?: (asset: NetworkAssetDto) => void;
  onSelectAlert?: (alert: AlertDto) => void;
  className?: string;
  center?: [number, number];
  zoom?: number;
  showHeatmapByDefault?: boolean;
}

const DEFAULT_CENTER: [number, number] = [-8.0476, -34.887]; // Recife, PE
const SECTOR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

type BasemapId = 'voyager' | 'dark' | 'osm';

const BASEMAP_TILES: Record<BasemapId, { url: string; attribution: string; name: string }> = {
  voyager: {
    name: 'CartoDB Voyager (Claro)',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
  },
  dark: {
    name: 'CartoDB Dark Matter (Escuro CCO)',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
  },
  osm: {
    name: 'OpenStreetMap Padrão',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
};

function escapeHtml(str: string): string {
  return str.replace(/[&<>'"]/g, (tag) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[tag] ?? tag));
}

export function NetworkMap({
  sectors = [],
  devices = [],
  networkAssets = [],
  alerts = [],
  selectedDeviceId,
  selectedSectorId,
  selectedAssetId,
  onSelectDevice,
  onSelectSector,
  onSelectAsset,
  onSelectAlert,
  className = 'h-[620px] w-full rounded-2xl',
  center = DEFAULT_CENTER,
  zoom = 13,
  showHeatmapByDefault = false,
}: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseTileLayerRef = useRef<L.TileLayer | null>(null);
  const layersGroupRef = useRef<L.FeatureGroup | null>(null);

  // Estados de controle de visualização
  const [basemap, setBasemap] = useState<BasemapId>('voyager');
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [isHeatmapActive, setIsHeatmapActive] = useState(showHeatmapByDefault);
  const [heatmapIntensity, setHeatmapIntensity] = useState(0.8);
  const [heatmapRadius, setHeatmapRadius] = useState(48);

  // Visibilidade de camadas
  const [layerVisibility, setLayerVisibility] = useState({
    sectors: true,
    pipes: true,
    valves: true,
    pressureSensors: true,
    flowMeters: true,
    activeAlerts: true,
  });

  const toggleLayer = (key: keyof typeof layerVisibility) => {
    setLayerVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Mapeamento de alertas por dispositivo
  const activeAlertsByDeviceId = useMemo(() => {
    const map = new Map<string, AlertDto[]>();
    alerts
      .filter((a) => a.status !== 'RESOLVED' && a.status !== 'DISMISSED')
      .forEach((alert) => {
        if (!alert.deviceId) return;
        const list = map.get(alert.deviceId) ?? [];
        list.push(alert);
        map.set(alert.deviceId, list);
      });
    return map;
  }, [alerts]);

  // Inicializa mapa base do Leaflet
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) {
      mapRef.current.setView(center, zoom);
      return;
    }

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: false, // reposicionado para não conflitar
      attributionControl: true,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const tileInfo = BASEMAP_TILES[basemap];
    const tileLayer = L.tileLayer(tileInfo.url, {
      attribution: tileInfo.attribution,
      maxZoom: 19,
    }).addTo(map);

    baseTileLayerRef.current = tileLayer;

    const featureGroup = L.featureGroup().addTo(map);
    layersGroupRef.current = featureGroup;
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [center, zoom, basemap]);

  // Atualiza tile layer quando usuário troca o mapa base
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (baseTileLayerRef.current) {
      map.removeLayer(baseTileLayerRef.current);
    }

    const tileInfo = BASEMAP_TILES[basemap];
    const newTile = L.tileLayer(tileInfo.url, {
      attribution: tileInfo.attribution,
      maxZoom: 19,
    }).addTo(map);

    baseTileLayerRef.current = newTile;
    newTile.bringToBack();
  }, [basemap]);

  // Desenha o Mapa de Calor no Canvas HTML5
  const renderHeatmap = useCallback(() => {
    const canvas = canvasRef.current;
    const map = mapRef.current;
    if (!canvas || !map || !isHeatmapActive) {
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const size = map.getSize();
    canvas.width = size.x;
    canvas.height = size.y;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, size.x, size.y);

    // Constrói os pontos de calor térmico a partir de alertas e anomalias de sensores
    const heatPoints: { lat: number; lon: number; weight: number }[] = [];

    devices.forEach((dev) => {
      const loc = dev.location as { coordinates?: [number, number] } | null;
      if (!loc || !Array.isArray(loc.coordinates) || loc.coordinates.length < 2) return;
      const [lon, lat] = loc.coordinates;
      if (typeof lon !== 'number' || typeof lat !== 'number') return;

      const devAlerts = activeAlertsByDeviceId.get(dev.id) ?? [];
      let weight = 0.2; // base ambient

      if (devAlerts.length > 0) {
        const hasCritical = devAlerts.some((a) => a.severity === 'CRITICAL');
        const hasHigh = devAlerts.some((a) => a.severity === 'HIGH');
        const hasMedium = devAlerts.some((a) => a.severity === 'MEDIUM');

        if (hasCritical) weight = 1.0;
        else if (hasHigh) weight = 0.8;
        else if (hasMedium) weight = 0.6;
        else weight = 0.45;
      } else if (dev.status === 'INACTIVE') {
        weight = 0.4;
      }

      heatPoints.push({ lat, lon, weight });
    });

    if (heatPoints.length === 0) return;

    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = heatmapIntensity;

    const currentZoom = map.getZoom();
    const radiusMultiplier = Math.max(0.6, Math.min(2.2, currentZoom / 13));
    const effectiveRadius = heatmapRadius * radiusMultiplier;

    heatPoints.forEach((pt) => {
      const pixel = map.latLngToContainerPoint([pt.lat, pt.lon]);
      if (pixel.x < -120 || pixel.x > size.x + 120 || pixel.y < -120 || pixel.y > size.y + 120) return;

      const grad = ctx.createRadialGradient(pixel.x, pixel.y, 0, pixel.x, pixel.y, effectiveRadius);

      if (pt.weight >= 0.8) {
        // Risco Crítico / Vazamento severo: vermelho radiante -> laranja -> amarelo
        grad.addColorStop(0, 'rgba(239, 68, 68, 0.95)');
        grad.addColorStop(0.3, 'rgba(249, 115, 22, 0.75)');
        grad.addColorStop(0.65, 'rgba(234, 179, 8, 0.35)');
        grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
      } else if (pt.weight >= 0.5) {
        // Risco Médio / Atenção operacional: âmbar -> amarelo dourado
        grad.addColorStop(0, 'rgba(245, 158, 11, 0.85)');
        grad.addColorStop(0.4, 'rgba(234, 179, 8, 0.5)');
        grad.addColorStop(0.75, 'rgba(132, 204, 22, 0.25)');
        grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      } else {
        // Pressão normal / Cobertura saudável da rede
        grad.addColorStop(0, 'rgba(6, 182, 212, 0.55)');
        grad.addColorStop(0.5, 'rgba(59, 130, 246, 0.25)');
        grad.addColorStop(1, 'rgba(59, 130, 246, 0)');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pixel.x, pixel.y, effectiveRadius, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [devices, activeAlertsByDeviceId, isHeatmapActive, heatmapIntensity, heatmapRadius]);

  // Listener para redesenhar o heatmap ao mover ou dar zoom no mapa
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handler = () => {
      renderHeatmap();
    };

    map.on('move', handler);
    map.on('zoom', handler);
    map.on('resize', handler);

    renderHeatmap();

    return () => {
      map.off('move', handler);
      map.off('zoom', handler);
      map.off('resize', handler);
    };
  }, [renderHeatmap]);

  // Renderiza as camadas vetoriais e marcadores (Setores, Tubulações, Válvulas, Sensores e Alertas)
  useEffect(() => {
    const map = mapRef.current;
    const group = layersGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // 1. Camada de Polígonos de Setores (Bacias de Abastecimento)
    if (layerVisibility.sectors) {
      sectors.forEach((sector, idx) => {
        if (!sector.geometry) return;
        const color = SECTOR_COLORS[idx % SECTOR_COLORS.length] ?? '#3b82f6';
        const isSelected = selectedSectorId === sector.id;

        try {
          const geoLayer = L.geoJSON(sector.geometry, {
            style: {
              color,
              weight: isSelected ? 4 : 2,
              opacity: isSelected ? 1 : 0.7,
              fillColor: color,
              fillOpacity: isSelected ? 0.35 : 0.12,
            },
          });

          geoLayer.bindTooltip(
            `<div class="font-sans text-xs">
              <strong class="text-brand-900">${escapeHtml(sector.code)}</strong>
              <div class="text-slate-600">${escapeHtml(sector.name)}</div>
            </div>`,
            { permanent: false, direction: 'center', className: 'geo-sector-tooltip' },
          );

          geoLayer.on('click', () => {
            onSelectSector?.(sector);
          });

          group.addLayer(geoLayer);
        } catch {
          // Ignora formatos geométricos inválidos
        }
      });
    }

    // 2. Camada de Tubulações / Adutoras Principais
    if (layerVisibility.pipes) {
      const pipes = networkAssets.filter((a) => a.kind === 'PIPE');
      pipes.forEach((pipe) => {
        if (!pipe.geometry) return;
        const isSelected = selectedAssetId === pipe.id;
        const diameter = (pipe.properties?.diameterMm as number) ?? 200;
        const weight = Math.min(8, Math.max(3, Math.round(diameter / 50)));

        try {
          const pipeLayer = L.geoJSON(pipe.geometry, {
            style: {
              color: isSelected ? '#38bdf8' : basemap === 'dark' ? '#0ea5e9' : '#0284c7',
              weight: isSelected ? weight + 3 : weight,
              opacity: isSelected ? 1 : 0.85,
              dashArray: isSelected ? '8, 8' : undefined,
            },
          });

          pipeLayer.bindTooltip(
            `<div class="font-sans text-xs">
              <strong class="text-blue-700 font-mono">${escapeHtml(pipe.code)}</strong>
              <div class="text-slate-800 font-semibold">${escapeHtml(pipe.name)}</div>
              <div class="text-slate-500 text-[10px]">Diâmetro: ${diameter} mm</div>
            </div>`,
            { permanent: false, direction: 'top' },
          );

          pipeLayer.on('click', () => {
            onSelectAsset?.(pipe);
          });

          group.addLayer(pipeLayer);
        } catch {
          // Ignora
        }
      });
    }

    // 3. Camada de Válvulas e Registros da Rede
    if (layerVisibility.valves) {
      const valves = networkAssets.filter((a) => a.kind === 'VALVE');
      valves.forEach((valve) => {
        const geom = valve.geometry as { coordinates?: [number, number] } | null;
        if (!geom || !Array.isArray(geom.coordinates) || geom.coordinates.length < 2) return;
        const [lon, lat] = geom.coordinates;
        if (typeof lon !== 'number' || typeof lat !== 'number') return;

        const isSelected = selectedAssetId === valve.id;

        const valveIcon = L.divIcon({
          html: `
            <div class="relative flex items-center justify-center transition-transform hover:scale-125 cursor-pointer">
              <div class="size-6 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-[9px] shadow-sm border border-white ${
                isSelected ? 'ring-3 ring-amber-300 scale-125' : ''
              }">
                V
              </div>
            </div>
          `,
          className: 'custom-valve-icon',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const marker = L.marker([lat, lon], { icon: valveIcon });
        marker.bindTooltip(
          `<div class="p-1 font-sans text-xs">
            <span class="font-mono font-bold text-amber-700">${escapeHtml(valve.code)}</span>
            <div class="font-semibold text-slate-800">${escapeHtml(valve.name)}</div>
            <div class="text-slate-500 text-[10px]">Válvula de Controle / Registro</div>
          </div>`,
          { permanent: false, direction: 'top' },
        );

        marker.on('click', () => {
          onSelectAsset?.(valve);
        });

        group.addLayer(marker);
      });
    }

    // 4. Camada de Sensores de Pressão e Medidores de Vazão
    devices.forEach((dev) => {
      const isPressure = dev.kind === 'PRESSURE_SENSOR';
      if (isPressure && !layerVisibility.pressureSensors) return;
      if (!isPressure && !layerVisibility.flowMeters) return;

      const loc = dev.location as { coordinates?: [number, number] } | null;
      if (!loc || !Array.isArray(loc.coordinates) || loc.coordinates.length < 2) return;
      const [lon, lat] = loc.coordinates;
      if (typeof lon !== 'number' || typeof lat !== 'number') return;

      const isSelected = selectedDeviceId === dev.id;
      const isActive = dev.status === 'ACTIVE';
      const devAlerts = activeAlertsByDeviceId.get(dev.id) ?? [];
      const hasActiveAlert = devAlerts.length > 0;
      const criticalAlert = devAlerts.find((a) => a.severity === 'CRITICAL');

      let bgClass = 'bg-blue-600';
      if (!isActive) bgClass = 'bg-slate-400';
      else if (criticalAlert) bgClass = 'bg-red-600';
      else if (hasActiveAlert) bgClass = 'bg-amber-500';
      else if (!isPressure) bgClass = 'bg-emerald-600';

      const ringClass = isSelected
        ? 'ring-4 ring-brand-400 ring-offset-2 scale-125'
        : 'ring-2 ring-white shadow-md hover:scale-115';

      // Anel pulsante se houver alerta crítico e a camada de alertas estiver ligada
      const pulsatingRing =
        hasActiveAlert && layerVisibility.activeAlerts
          ? `<span class="absolute -inset-1.5 rounded-full ${
              criticalAlert ? 'bg-red-500/50' : 'bg-amber-500/50'
            } animate-ping"></span>`
          : '';

      const iconHtml = `
        <div class="relative flex items-center justify-center transition-transform">
          ${pulsatingRing}
          <div class="relative size-8 rounded-full ${bgClass} text-white flex items-center justify-center font-bold text-[10px] ${ringClass}">
            ${isPressure ? 'P' : 'Q'}
          </div>
          ${
            hasActiveAlert
              ? `<span class="absolute -top-1 -right-1 size-3.5 rounded-full bg-red-600 text-[8px] font-black text-white flex items-center justify-center ring-1 ring-white">!</span>`
              : isActive
              ? `<span class="absolute -top-1 -right-1 size-2.5 rounded-full bg-emerald-400 ring-1 ring-white"></span>`
              : ''
          }
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-sensor-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([lat, lon], { icon: customIcon });

      const alertBadgeHtml = hasActiveAlert
        ? `<div class="mt-1 flex items-center gap-1 rounded bg-red-50 p-1 text-[10px] font-semibold text-red-700 border border-red-200">
            <span>⚠</span>
            <span>${devAlerts.length} alerta(s) ativo(s)</span>
          </div>`
        : '';

      const popupContent = `
        <div class="p-1 font-sans text-xs space-y-1.5 min-w-[180px]">
          <div class="flex items-center justify-between border-b border-slate-100 pb-1">
            <span class="font-mono font-bold text-slate-900">${escapeHtml(dev.code)}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold ${
              isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
            }">
              ${isActive ? 'ATIVO' : 'INATIVO'}
            </span>
          </div>
          <div class="font-medium text-slate-800">${escapeHtml(dev.name)}</div>
          <div class="text-slate-500">
            ${
              isPressure
                ? 'Faixa: ' + (dev.rangePressureMin ?? 0) + ' a ' + (dev.rangePressureMax ?? 0) + ' mca'
                : 'Faixa: ' + (dev.rangeFlowMin ?? 0) + ' a ' + (dev.rangeFlowMax ?? 0) + ' m³/h'
            }
          </div>
          ${alertBadgeHtml}
          ${
            dev.lastMeasurementAt
              ? `<div class="text-[10px] text-slate-400">Última leitura: ${new Date(
                  dev.lastMeasurementAt,
                ).toLocaleTimeString('pt-BR')}</div>`
              : ''
          }
        </div>
      `;

      marker.bindPopup(popupContent);

      marker.on('click', () => {
        onSelectDevice?.(dev);
        if (devAlerts[0]) {
          onSelectAlert?.(devAlerts[0]);
        }
      });

      group.addLayer(marker);
    });
  }, [
    sectors,
    devices,
    networkAssets,
    selectedDeviceId,
    selectedSectorId,
    selectedAssetId,
    layerVisibility,
    activeAlertsByDeviceId,
    basemap,
    onSelectDevice,
    onSelectSector,
    onSelectAsset,
    onSelectAlert,
  ]);

  // Função para re-enquadrar todo o Recife
  const handleFitBounds = () => {
    const map = mapRef.current;
    const group = layersGroupRef.current;
    if (!map || !group) return;

    if (group.getLayers().length > 0) {
      const bounds = group.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }
    } else {
      map.setView(DEFAULT_CENTER, 13);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
      {/* Contêiner Leaflet */}
      <div ref={containerRef} className={className} />

      {/* Canvas Overlay do Mapa de Calor */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-[450] transition-opacity duration-300"
      />

      {/* Barra de Ferramentas Flutuante Superior Direita */}
      <div className="absolute top-4 right-4 z-[1000] flex items-center gap-2">
        {/* Botão de Ativação Rápida do Mapa de Calor */}
        <button
          type="button"
          onClick={() => setIsHeatmapActive(!isHeatmapActive)}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold shadow-md transition-all backdrop-blur-md ${
            isHeatmapActive
              ? 'border-red-400 bg-red-600 text-white shadow-red-200 hover:bg-red-700'
              : 'border-slate-200 bg-white/95 text-slate-700 hover:bg-slate-50'
          }`}
          title="Alternar camada de mapa de calor térmico de anomalias e vazamentos"
        >
          <Flame className={`size-4 ${isHeatmapActive ? 'animate-bounce' : 'text-amber-500'}`} />
          <span>{isHeatmapActive ? 'Calor Ativo' : 'Mapa de Calor'}</span>
        </button>

        {/* Botão de Enquadramento Geral */}
        <button
          type="button"
          onClick={handleFitBounds}
          className="flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-700 shadow-md backdrop-blur-md hover:bg-slate-50"
          title="Ajustar zoom à malha de Recife"
        >
          <Maximize2 className="size-4" />
        </button>

        {/* Botão de Camadas e Filtros Espaciais */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowLayerMenu(!showLayerMenu)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold shadow-md transition-all backdrop-blur-md ${
              showLayerMenu
                ? 'border-brand-500 bg-brand-700 text-white'
                : 'border-slate-200 bg-white/95 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Layers className="size-4" />
            <span>Camadas & Estilo</span>
          </button>

          {/* Menu Dropdown de Camadas & Estilo */}
          {showLayerMenu && (
            <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur-md z-[1010] space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <SlidersHorizontal className="size-3.5 text-brand-700" />
                  Camadas da Infraestrutura
                </span>
                <button
                  type="button"
                  onClick={() => setShowLayerMenu(false)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>

              {/* Toggles de Camadas */}
              <div className="space-y-2 text-xs">
                <label className="flex items-center justify-between cursor-pointer select-none">
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded border border-blue-500 bg-blue-500/20" />
                    <span className="text-slate-700">Setores / Zonas Hidráulicas</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={layerVisibility.sectors}
                    onChange={() => toggleLayer('sectors')}
                    className="rounded text-brand-700 focus:ring-brand-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer select-none">
                  <div className="flex items-center gap-2">
                    <span className="h-1 w-3 rounded bg-blue-600" />
                    <span className="text-slate-700">Tubulações & Adutoras</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={layerVisibility.pipes}
                    onChange={() => toggleLayer('pipes')}
                    className="rounded text-brand-700 focus:ring-brand-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer select-none">
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-full bg-blue-600" />
                    <span className="text-slate-700">Sensores de Pressão (P)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={layerVisibility.pressureSensors}
                    onChange={() => toggleLayer('pressureSensors')}
                    className="rounded text-brand-700 focus:ring-brand-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer select-none">
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-full bg-emerald-600" />
                    <span className="text-slate-700">Medidores de Vazão (Q)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={layerVisibility.flowMeters}
                    onChange={() => toggleLayer('flowMeters')}
                    className="rounded text-brand-700 focus:ring-brand-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer select-none">
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded bg-amber-500 text-[8px] text-white flex items-center justify-center font-bold">
                      V
                    </span>
                    <span className="text-slate-700">Válvulas & Registros</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={layerVisibility.valves}
                    onChange={() => toggleLayer('valves')}
                    className="rounded text-brand-700 focus:ring-brand-500"
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer select-none">
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-full bg-red-600" />
                    <span className="text-slate-700">Alertas Pulsantes em Tempo Real</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={layerVisibility.activeAlerts}
                    onChange={() => toggleLayer('activeAlerts')}
                    className="rounded text-brand-700 focus:ring-brand-500"
                  />
                </label>
              </div>

              {/* Controles do Mapa de Calor (se ativado) */}
              {isHeatmapActive && (
                <div className="border-t border-slate-100 pt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-red-700 flex items-center gap-1">
                      <Flame className="size-3" /> Intensidade do Calor:
                    </span>
                    <span className="font-mono text-slate-600">{Math.round(heatmapIntensity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1"
                    step="0.05"
                    value={heatmapIntensity}
                    onChange={(e) => setHeatmapIntensity(Number(e.target.value))}
                    className="w-full accent-red-600"
                  />

                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Raio de Difusão:</span>
                    <span className="font-mono text-slate-600">{heatmapRadius}px</span>
                  </div>
                  <input
                    type="range"
                    min="24"
                    max="80"
                    step="4"
                    value={heatmapRadius}
                    onChange={(e) => setHeatmapRadius(Number(e.target.value))}
                    className="w-full accent-red-600"
                  />
                </div>
              )}

              {/* Seletor de Mapa Base */}
              <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs">
                <span className="font-bold text-slate-900 block">Estilo de Mapa Base:</span>
                <div className="grid grid-cols-1 gap-1">
                  {(Object.keys(BASEMAP_TILES) as BasemapId[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setBasemap(key)}
                      className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                        basemap === key
                          ? 'bg-brand-50 font-bold text-brand-900'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>{BASEMAP_TILES[key].name}</span>
                      {basemap === key && <Check className="size-3.5 text-brand-700" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Legenda Dinâmica Inferior Esquerda */}
      <div className="absolute bottom-4 left-4 z-[1000] rounded-xl border border-slate-200/90 bg-white/95 p-3 text-xs shadow-lg backdrop-blur-md space-y-2">
        <span className="font-bold text-slate-900 block">
          {isHeatmapActive ? 'Escala de Risco Térmico' : 'Rede de Distribuição'}
        </span>

        {isHeatmapActive ? (
          <div className="space-y-1.5">
            <div className="h-2 w-44 rounded-full bg-gradient-to-r from-cyan-400 via-amber-400 to-red-600" />
            <div className="flex justify-between text-[10px] font-semibold text-slate-600">
              <span>Normal</span>
              <span>Atenção</span>
              <span className="text-red-700">Crítico / Vazamento</span>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-blue-600 ring-1 ring-white" />
              <span className="text-slate-700">Sensor de Pressão (mca)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-emerald-600 ring-1 ring-white" />
              <span className="text-slate-700">Medidor de Vazão (m³/h)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1 w-3 rounded bg-blue-600" />
              <span className="text-slate-700">Adutora / Tubulação</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-3 rounded bg-amber-500 text-[8px] text-white flex items-center justify-center font-bold">
                V
              </span>
              <span className="text-slate-700">Válvula de Manobra</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-3 rounded border border-blue-500 bg-blue-500/20" />
              <span className="text-slate-700">Bacia de Pressão (Setor)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
