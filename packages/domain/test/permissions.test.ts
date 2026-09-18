import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES, hasPermission, permissionsFor } from '../src';

describe('matriz de permissões', () => {
  it('ADMIN possui todas as permissões', () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission('ADMIN', permission)).toBe(true);
    }
  });

  it('somente ADMIN gerencia usuários, lê auditoria e emite credenciais de dispositivo', () => {
    for (const permission of ['users:manage', 'users:read', 'audit:read', 'devices:credentials'] as const) {
      expect(ROLES.filter((role) => hasPermission(role, permission))).toEqual(['ADMIN']);
    }
  });

  it('OPERATOR distribui ordens e trata alertas, mas não administra usuários nem regras', () => {
    expect(hasPermission('OPERATOR', 'work-orders:assign')).toBe(true);
    expect(hasPermission('OPERATOR', 'alerts:transition')).toBe(true);
    expect(hasPermission('OPERATOR', 'users:manage')).toBe(false);
    expect(hasPermission('OPERATOR', 'rules:write')).toBe(false);
  });

  it('TECHNICIAN só enxerga ordens atribuídas e não vê indicadores nem alertas', () => {
    expect(hasPermission('TECHNICIAN', 'work-orders:read-assigned')).toBe(true);
    expect(hasPermission('TECHNICIAN', 'work-orders:read')).toBe(false);
    expect(hasPermission('TECHNICIAN', 'analytics:read')).toBe(false);
    expect(hasPermission('TECHNICIAN', 'alerts:read')).toBe(false);
  });

  it('VIEWER é somente leitura: nenhuma permissão de escrita ou transição', () => {
    const writes = permissionsFor('VIEWER').filter((p) => /(write|manage|transition|create|assign|execute|import|run|credentials)$/.test(p));
    expect(writes).toEqual([]);
  });

  it('não há permissões duplicadas', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });
});
