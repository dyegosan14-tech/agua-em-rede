export const ROLES = ['ADMIN', 'OPERATOR', 'TECHNICIAN', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  OPERATOR: 'Operador',
  TECHNICIAN: 'Técnico',
  VIEWER: 'Visualizador',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
