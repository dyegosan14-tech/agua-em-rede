import { ROLES } from '@aer/domain';
import { z } from 'zod';
import { dateTimeSchema, emailSchema, pageInfoSchema, paginationQuerySchema, passwordSchema, uuidSchema } from './common';

const nameSchema = z.string().trim().min(1, 'Informe o nome.').max(200);

export const userSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  name: z.string(),
  role: z.enum(ROLES),
  isActive: z.boolean(),
  lastLoginAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
});
export type UserDto = z.infer<typeof userSchema>;

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: z.enum(ROLES).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  search: z.string().trim().min(1).max(100).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const listUsersResponseSchema = z.object({
  items: z.array(userSchema),
  page: pageInfoSchema,
});

export const createUserRequestSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  role: z.enum(ROLES),
  password: passwordSchema,
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const updateUserRequestSchema = z
  .object({
    name: nameSchema.optional(),
    role: z.enum(ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export const resetPasswordRequestSchema = z.object({ newPassword: passwordSchema });
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const revokeSessionsResponseSchema = z.object({ revokedSessions: z.number().int() });
