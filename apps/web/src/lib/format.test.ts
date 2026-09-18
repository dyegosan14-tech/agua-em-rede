import { describe, expect, it } from 'vitest';
import { formatDateTime, formatTime } from './format';

describe('formatação de datas', () => {
  it('converte UTC para America/Recife (UTC-3) independentemente do fuso da máquina', () => {
    expect(formatDateTime('2026-06-15T15:30:00.000Z')).toBe('15/06/2026 12:30');
    // Virada de dia: 01:00 UTC ainda é o dia anterior em Recife.
    expect(formatDateTime('2026-06-15T01:00:00.000Z')).toBe('14/06/2026 22:00');
  });

  it('respeita o fuso informado e trata valores ausentes ou inválidos', () => {
    expect(formatDateTime('2026-06-15T15:30:00.000Z', 'UTC')).toBe('15/06/2026 15:30');
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('não é data')).toBe('—');
  });

  it('formata somente a hora', () => {
    expect(formatTime('2026-06-15T15:30:45.000Z')).toBe('12:30:45');
  });
});
