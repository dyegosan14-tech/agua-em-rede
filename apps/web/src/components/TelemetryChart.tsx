import { useState } from 'react';
import type { MeasurementDto } from '@aer/contracts';

interface TelemetryChartProps {
  measurements: MeasurementDto[];
  metric: 'PRESSURE' | 'FLOW';
  minThreshold?: number | null;
  maxThreshold?: number | null;
  title?: string;
}

export function TelemetryChart({
  measurements,
  metric,
  minThreshold,
  maxThreshold,
  title,
}: TelemetryChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    value: number;
    time: string;
    quality: string;
  } | null>(null);

  // Ordena medições por data crescente
  const sorted = [...measurements]
    .filter((m) => m.metric === metric)
    .sort((a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime());

  if (sorted.length === 0) {
    return (
      <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-500">
        Nenhuma leitura de {metric === 'PRESSURE' ? 'pressão' : 'vazão'} registrada para este intervalo.
      </div>
    );
  }

  const unit = metric === 'PRESSURE' ? 'mca' : 'm3/h';
  const color = metric === 'PRESSURE' ? '#2563eb' : '#059669'; // blue vs emerald
  const gradientId = `grad-${metric.toLowerCase()}`;

  // Coordenadas SVG
  const width = 800;
  const height = 220;
  const paddingX = 50;
  const paddingY = 30;

  const values = sorted.map((s) => s.value);
  const minVal = Math.min(...values, minThreshold ?? Infinity, 0);
  const maxVal = Math.max(...values, maxThreshold ?? -Infinity) * 1.15 || 50;

  const getX = (index: number) => {
    if (sorted.length <= 1) return paddingX;
    return paddingX + (index / (sorted.length - 1)) * (width - 2 * paddingX);
  };

  const getY = (val: number) => {
    const range = maxVal - minVal || 1;
    return height - paddingY - ((val - minVal) / range) * (height - 2 * paddingY);
  };

  // Caminho SVG para a linha
  const points = sorted.map((s, idx) => ({
    x: getX(idx),
    y: getY(s.value),
    value: s.value,
    time: new Date(s.measuredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    quality: s.quality,
  }));

  const pathD = points.reduce(
    (acc, curr, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`,
    '',
  );

  const areaD = `${pathD} L ${points[points.length - 1]?.x.toFixed(1)} ${height - paddingY} L ${paddingX} ${height - paddingY} Z`;

  return (
    <div className="space-y-2">
      {title && (
        <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
          <span>{title}</span>
          <span className="font-mono text-slate-500">Unidade: {unit}</span>
        </div>
      )}

      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none overflow-visible">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Linhas de Grade Horizontais */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const v = minVal + pct * (maxVal - minVal);
            const y = getY(v);
            return (
              <g key={pct}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text x={paddingX - 8} y={y + 3} textAnchor="end" className="text-[10px] fill-slate-400 font-mono">
                  {v.toFixed(0)}
                </text>
              </g>
            );
          })}

          {/* Linha de Limiar Mínimo */}
          {minThreshold !== undefined && minThreshold !== null && (
            <g>
              <line
                x1={paddingX}
                y1={getY(minThreshold)}
                x2={width - paddingX}
                y2={getY(minThreshold)}
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="6 3"
              />
              <text
                x={width - paddingX}
                y={getY(minThreshold) - 4}
                textAnchor="end"
                className="text-[9px] fill-amber-600 font-bold"
              >
                Mínimo ({minThreshold} {unit})
              </text>
            </g>
          )}

          {/* Linha de Limiar Máximo */}
          {maxThreshold !== undefined && maxThreshold !== null && (
            <g>
              <line
                x1={paddingX}
                y1={getY(maxThreshold)}
                x2={width - paddingX}
                y2={getY(maxThreshold)}
                stroke="#ef4444"
                strokeWidth="1.5"
                strokeDasharray="6 3"
              />
              <text
                x={width - paddingX}
                y={getY(maxThreshold) - 4}
                textAnchor="end"
                className="text-[9px] fill-red-600 font-bold"
              >
                Máximo ({maxThreshold} {unit})
              </text>
            </g>
          )}

          {/* Área preenchida */}
          <path d={areaD} fill={`url(#${gradientId})`} />

          {/* Linha principal */}
          <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Pontos de dados */}
          {points.map((pt, i) => (
            <circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r={pt.quality === 'BAD' ? 5 : 3.5}
              fill={pt.quality === 'BAD' ? '#ef4444' : color}
              stroke="#ffffff"
              strokeWidth="2"
              className="cursor-pointer transition-transform hover:scale-150"
              onMouseEnter={() => setHoveredPoint(pt)}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          ))}
        </svg>

        {/* Tooltip flutuante */}
        {hoveredPoint && (
          <div
            className="pointer-events-none absolute z-20 rounded-lg bg-slate-900/90 px-2.5 py-1.5 text-[11px] text-white shadow-md backdrop-blur-xs"
            style={{
              left: `${(hoveredPoint.x / width) * 100}%`,
              top: `${(hoveredPoint.y / height) * 100}%`,
              transform: 'translate(-50%, -120%)',
            }}
          >
            <div className="font-bold text-aqua-300">
              {hoveredPoint.value.toFixed(1)} {unit}
            </div>
            <div className="text-[10px] text-slate-300">{hoveredPoint.time}</div>
            {hoveredPoint.quality === 'BAD' && (
              <div className="text-[9px] font-bold text-red-400">Qualidade Ruim (Fora da Faixa)</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
