/** Origem de um dado operacional. Dados SIMULATED nunca entram em indicadores reais por padrão. */
export const DATA_ORIGINS = ['REAL', 'SIMULATED'] as const;
export type DataOrigin = (typeof DATA_ORIGINS)[number];
