import { PERMISSIONS, ROLES } from '@aer/domain';
import { z } from 'zod';
import { dateTimeSchema, emailSchema, passwordSchema, uuidSchema } from './common';

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe a senha.').max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const sessionUserSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  name: z.string(),
  role: z.enum(ROLES),
});

export const sessionOrganizationSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  /** Organização de demonstração: a interface exibe o banner "Ambiente demonstrativo — dados simulados". */
  isDemo: z.boolean(),
  timezone: z.string(),
});

export const sessionResponseSchema = z.object({
  user: sessionUserSchema,
  organization: sessionOrganizationSchema,
  permissions: z.array(z.enum(PERMISSIONS)),
  /** Token CSRF da sessão: enviar no cabeçalho x-csrf-token em toda requisição de escrita. */
  csrfToken: z.string(),
  expiresAt: dateTimeSchema,
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual.').max(128),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'A nova senha deve ser diferente da atual.',
  });
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const organizationResponseSchema = sessionOrganizationSchema;
