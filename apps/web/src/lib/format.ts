/**
 * O banco e a API trabalham em UTC. A interface exibe sempre no fuso da organização
 * (padrão America/Recife), nunca no fuso do navegador.
 */
export const DEFAULT_TIMEZONE = 'America/Recife';

export function formatDateTime(iso: string | Date | null | undefined, timeZone: string = DEFAULT_TIMEZONE): string {
  if (!iso) return '—';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  // Montagem explícita: o separador entre data e hora varia conforme a versão do ICU (vírgula ou espaço).
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

export function formatTime(iso: string | Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
}
