import type { Role } from './roles';

/**
 * Matriz de permissões do produto. Fica em um único lugar para que API e interface
 * concordem sobre o que cada perfil pode fazer. A API é sempre a autoridade: a interface
 * usa a matriz apenas para ocultar/desabilitar ações que seriam recusadas.
 *
 * Etapa 1: a matriz completa já está definida, mas somente as permissões de org/usuários/
 * auditoria têm rotas que as aplicam. As demais passam a ser exigidas conforme os módulos
 * correspondentes forem entregues.
 */
export const PERMISSIONS = [
  'org:read',
  'users:read',
  'users:manage',
  'users:list-assignable',
  'audit:read',
  'sectors:read',
  'sectors:write',
  'assets:read',
  'assets:write',
  'devices:read',
  'devices:write',
  'devices:credentials',
  'maintenance-windows:write',
  'telemetry:read',
  'telemetry:import',
  'rules:read',
  'rules:write',
  'alerts:read',
  'alerts:transition',
  'work-orders:read',
  'work-orders:read-assigned',
  'work-orders:create',
  'work-orders:assign',
  'work-orders:execute',
  'analytics:read',
  'simulator:run',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const OPERATOR: readonly Permission[] = [
  'org:read',
  'users:list-assignable',
  'sectors:read',
  'assets:read',
  'devices:read',
  'maintenance-windows:write',
  'telemetry:read',
  'telemetry:import',
  'rules:read',
  'alerts:read',
  'alerts:transition',
  'work-orders:read',
  'work-orders:create',
  'work-orders:assign',
  'analytics:read',
  'simulator:run',
];

const TECHNICIAN: readonly Permission[] = [
  'org:read',
  'sectors:read',
  'assets:read',
  'devices:read',
  'work-orders:read-assigned',
  'work-orders:execute',
];

const VIEWER: readonly Permission[] = [
  'org:read',
  'sectors:read',
  'assets:read',
  'devices:read',
  'telemetry:read',
  'rules:read',
  'alerts:read',
  'work-orders:read',
  'analytics:read',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  OPERATOR,
  TECHNICIAN,
  VIEWER,
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
