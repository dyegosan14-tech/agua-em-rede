import { useEffect, useRef } from 'react';
import type { DeviceDto, SectorDto } from '@aer/contracts';
import L from 'leaflet';

interface NetworkMapProps {
  sectors?: SectorDto[];
  devices?: DeviceDto[];
  selectedDeviceId?: string | null;
  selectedSectorId?: string | null;
  onSelectDevice?: (device: DeviceDto) => void;
  onSelectSector?: (sector: SectorDto) => void;
  className?: string;
  center?: [number, number];
  zoom?: number;
}

const DEFAULT_CENTER: [number, number] = [-8.0476, -34.887]; // Recife, PE
const SECTOR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export function NetworkMap({
  sectors = [],
  devices = [],
  selectedDeviceId,
  selectedSectorId,
  onSelectDevice,
  onSelectSector,
  className = 'h-[500px] w-full rounded-2xl',
  center = DEFAULT_CENTER,
  zoom = 13,
}: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersGroupRef = useRef<L.FeatureGroup | null>(null);

  // Inicializa o mapa
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) {
      mapRef.current.setView(center, zoom);
      return;
    }

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const featureGroup = L.featureGroup().addTo(map);
    layersGroupRef.current = featureGroup;
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [center, zoom]);

  // Atualiza camadas geográficas quando setores ou dispositivos mudam
  useEffect(() => {
    const map = mapRef.current;
    const group = layersGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // 1. Renderiza Polígonos de Setores
    sectors.forEach((sector, idx) => {
      if (!sector.geometry) return;
      const color = SECTOR_COLORS[idx % SECTOR_COLORS.length] ?? '#3b82f6';
      const isSelected = selectedSectorId === sector.id;

      try {
        const geoLayer = L.geoJSON(sector.geometry, {
          style: {
            color,
            weight: isSelected ? 4 : 2,
            opacity: isSelected ? 1 : 0.8,
            fillColor: color,
            fillOpacity: isSelected ? 0.35 : 0.15,
          },
        });

        geoLayer.bindTooltip(
          `<strong>${sector.code}</strong><br/>${sector.name}`,
          { permanent: false, direction: 'center', className: 'text-xs font-sans' },
        );

        geoLayer.on('click', () => {
          onSelectSector?.(sector);
        });

        group.addLayer(geoLayer);
      } catch {
        // Ignora geometria com formato não convencional
      }
    });

    // 2. Renderiza Marcadores de Dispositivos
    devices.forEach((dev) => {
      const loc = dev.location as { coordinates?: [number, number] } | null;
      if (!loc || !Array.isArray(loc.coordinates) || loc.coordinates.length < 2) return;

      const [lon, lat] = loc.coordinates;
      if (typeof lon !== 'number' || typeof lat !== 'number') return;

      const isPressure = dev.kind === 'PRESSURE_SENSOR';
      const isSelected = selectedDeviceId === dev.id;
      const isActive = dev.status === 'ACTIVE';

      const bgClass = !isActive
        ? 'bg-slate-400'
        : isPressure
        ? 'bg-blue-600'
        : 'bg-emerald-600';

      const ringClass = isSelected
        ? 'ring-4 ring-brand-400 ring-offset-2 scale-125'
        : 'ring-2 ring-white shadow-md hover:scale-110';

      const iconHtml = `
        <div class="relative flex items-center justify-center transition-transform">
          <div class="size-8 rounded-full ${bgClass} text-white flex items-center justify-center font-bold text-[10px] ${ringClass}">
            ${isPressure ? 'P' : 'Q'}
          </div>
          ${isActive ? `<span class="absolute -top-1 -right-1 size-2.5 rounded-full bg-emerald-400 ring-1 ring-white"></span>` : ''}
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-sensor-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([lat, lon], { icon: customIcon });

      const popupContent = `
        <div class="p-1 font-sans text-xs space-y-1.5 min-w-[160px]">
          <div class="flex items-center justify-between border-b border-slate-100 pb-1">
            <span class="font-mono font-bold text-slate-900">${dev.code}</span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold ${isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}">
              ${isActive ? 'ATIVO' : 'INATIVO'}
            </span>
          </div>
          <div class="font-medium text-slate-800">${dev.name}</div>
          <div class="text-slate-500">
            ${isPressure ? 'Pressão: ' + (dev.rangePressureMin ?? 0) + ' a ' + (dev.rangePressureMax ?? 0) + ' mca' : 'Vazão: ' + (dev.rangeFlowMin ?? 0) + ' a ' + (dev.rangeFlowMax ?? 0) + ' m³/h'}
          </div>
          ${dev.lastMeasurementAt ? `<div class="text-[10px] text-slate-400">Última leitura: ${new Date(dev.lastMeasurementAt).toLocaleTimeString('pt-BR')}</div>` : ''}
        </div>
      `;

      marker.bindPopup(popupContent);

      marker.on('click', () => {
        onSelectDevice?.(dev);
      });

      group.addLayer(marker);
    });

    // Ajusta o enquadramento se houver elementos carregados
    if (group.getLayers().length > 0) {
      const bounds = group.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
      }
    }
  }, [sectors, devices, selectedDeviceId, selectedSectorId, onSelectDevice, onSelectSector]);

  return (
    <div className="relative overflow-hidden border border-slate-200 bg-slate-100 shadow-sm">
      <div ref={containerRef} className={className} />

      {/* Legenda Flutuante */}
      <div className="absolute bottom-4 left-4 z-[1000] rounded-xl border border-slate-200/90 bg-white/95 p-3 text-xs shadow-lg backdrop-blur-xs">
        <span className="font-bold text-slate-900 block mb-2">Rede de Abastecimento</span>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-blue-600 ring-1 ring-white"></span>
            <span className="text-slate-700">Sensor de Pressão (mca)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-emerald-600 ring-1 ring-white"></span>
            <span className="text-slate-700">Medidor de Vazão (m³/h)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="size-3 rounded border border-blue-500 bg-blue-500/20"></span>
            <span className="text-slate-700">Polígono do Setor</span>
          </div>
        </div>
      </div>
    </div>
  );
}
