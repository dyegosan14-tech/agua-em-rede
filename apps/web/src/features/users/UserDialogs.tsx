import {
  createUserRequestSchema,
  resetPasswordRequestSchema,
  updateUserRequestSchema,
  type CreateUserRequest,
  type ResetPasswordRequest,
  type UpdateUserRequest,
  type UserDto,
} from '@aer/contracts';
import { ROLES, ROLE_LABELS } from '@aer/domain';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type FieldValues, type Path, type UseFormSetError } from 'react-hook-form';
import { Button, CheckboxField, Modal, SelectField, TextField } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { useCreateUser, useResetPassword, useRevokeSessions, useUpdateUser } from './users-api';

/** Leva erros de validação devolvidos pela API (path + mensagem) para os campos do formulário. */
function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields: readonly string[]): boolean {
  if (!(error instanceof ApiError) || !error.details) return false;
  let applied = false;
  for (const detail of error.details) {
    if (fields.includes(detail.path)) {
      setError(detail.path as Path<T>, { message: detail.message });
      applied = true;
    }
  }
  return applied;
}

function FormError({ error, hasFieldErrors }: { error: unknown; hasFieldErrors: boolean }) {
  if (!error || hasFieldErrors) return null;
  const message = error instanceof ApiError ? (error.isNetwork ? 'Sem conexão com o servidor. Tente novamente.' : error.message) : 'Não foi possível concluir a ação.';
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-900">
      {message}
    </p>
  );
}

function Actions({ onCancel, submitLabel, loading, loadingLabel, danger }: { onCancel: () => void; submitLabel: string; loading: boolean; loadingLabel: string; danger?: boolean }) {
  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" variant={danger ? 'danger' : 'primary'} loading={loading} loadingLabel={loadingLabel}>
        {submitLabel}
      </Button>
    </div>
  );
}

const roleOptions = ROLES.map((role) => (
  <option key={role} value={role}>
    {ROLE_LABELS[role]}
  </option>
));

export function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateUser();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CreateUserRequest>({ resolver: zodResolver(createUserRequestSchema), defaultValues: { role: 'VIEWER' } });
  const hasFieldErrors = Object.keys(errors).length > 0;

  return (
    <Modal open={open} onClose={onClose} title="Novo usuário">
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) =>
            create.mutate(values, {
              onSuccess: onClose,
              onError: (error) => applyServerErrors(error, setError, ['email', 'name', 'role', 'password']),
            }),
          )(event);
        }}
      >
        <TextField label="Nome" autoComplete="off" error={errors.name?.message} {...register('name')} />
        <TextField label="E-mail" type="email" autoComplete="off" error={errors.email?.message} {...register('email')} />
        <SelectField label="Perfil" error={errors.role?.message} {...register('role')}>
          {roleOptions}
        </SelectField>
        <TextField
          label="Senha inicial"
          type="password"
          autoComplete="new-password"
          hint="Mínimo de 12 caracteres. Informe-a ao usuário por um canal seguro; ele poderá alterá-la em “Minha conta”."
          error={errors.password?.message}
          {...register('password')}
        />
        <FormError error={create.error} hasFieldErrors={hasFieldErrors} />
        <Actions onCancel={onClose} submitLabel="Criar usuário" loading={create.isPending} loadingLabel="Criando…" />
      </form>
    </Modal>
  );
}

export function EditUserDialog({ user, isSelf, onClose }: { user: UserDto | null; isSelf: boolean; onClose: () => void }) {
  return (
    <Modal open={user !== null} onClose={onClose} title="Editar usuário">
      {user ? <EditUserForm key={user.id} user={user} isSelf={isSelf} onClose={onClose} /> : null}
    </Modal>
  );
}

function EditUserForm({ user, isSelf, onClose }: { user: UserDto; isSelf: boolean; onClose: () => void }) {
  const update = useUpdateUser(user.id);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<UpdateUserRequest>({
    resolver: zodResolver(updateUserRequestSchema),
    defaultValues: { name: user.name, role: user.role, isActive: user.isActive },
  });
  const hasFieldErrors = Object.keys(errors).length > 0;

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          // Envia só o que mudou: o perfil e a situação não são tocados se o usuário só corrigiu o nome.
          const changes: UpdateUserRequest = {
            ...(values.name !== user.name ? { name: values.name } : {}),
            ...(values.role !== user.role ? { role: values.role } : {}),
            ...(values.isActive !== user.isActive ? { isActive: values.isActive } : {}),
          };
          if (Object.keys(changes).length === 0) {
            onClose();
            return;
          }
          update.mutate(changes, {
            onSuccess: onClose,
            onError: (error) => applyServerErrors(error, setError, ['name', 'role', 'isActive']),
          });
        })(event);
      }}
    >
      <p className="text-sm text-slate-700">{user.email}</p>
      <TextField label="Nome" error={errors.name?.message} {...register('name')} />
      <SelectField label="Perfil" disabled={isSelf} hint={isSelf ? 'Você não pode alterar o próprio perfil.' : 'Mudar o perfil encerra as sessões do usuário.'} error={errors.role?.message} {...register('role')}>
        {roleOptions}
      </SelectField>
      <CheckboxField label="Usuário ativo" hint={isSelf ? 'Você não pode desativar a própria conta.' : 'Desativar impede o acesso e encerra as sessões.'} disabled={isSelf} {...register('isActive')} />
      <FormError error={update.error} hasFieldErrors={hasFieldErrors} />
      <Actions onCancel={onClose} submitLabel="Salvar" loading={update.isPending} loadingLabel="Salvando…" />
    </form>
  );
}

export function ResetPasswordDialog({ user, onClose }: { user: UserDto | null; onClose: () => void }) {
  return (
    <Modal open={user !== null} onClose={onClose} title="Redefinir senha">
      {user ? <ResetPasswordForm key={user.id} user={user} onClose={onClose} /> : null}
    </Modal>
  );
}

function ResetPasswordForm({ user, onClose }: { user: UserDto; onClose: () => void }) {
  const reset = useResetPassword(user.id);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ResetPasswordRequest>({ resolver: zodResolver(resetPasswordRequestSchema) });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        void handleSubmit((values) =>
          reset.mutate(values, {
            onSuccess: onClose,
            onError: (error) => applyServerErrors(error, setError, ['newPassword']),
          }),
        )(event);
      }}
    >
      <p className="text-sm text-slate-800">
        Defina uma nova senha para <strong>{user.name}</strong>. Todas as sessões abertas dessa pessoa serão encerradas.
      </p>
      <TextField label="Nova senha" type="password" autoComplete="new-password" hint="Mínimo de 12 caracteres." error={errors.newPassword?.message} {...register('newPassword')} />
      <FormError error={reset.error} hasFieldErrors={Boolean(errors.newPassword)} />
      <Actions onCancel={onClose} submitLabel="Redefinir senha" loading={reset.isPending} loadingLabel="Salvando…" danger />
    </form>
  );
}

export function RevokeSessionsDialog({ user, onClose }: { user: UserDto | null; onClose: () => void }) {
  return (
    <Modal open={user !== null} onClose={onClose} title="Encerrar sessões">
      {user ? <RevokeSessionsForm key={user.id} user={user} onClose={onClose} /> : null}
    </Modal>
  );
}

function RevokeSessionsForm({ user, onClose }: { user: UserDto; onClose: () => void }) {
  const revoke = useRevokeSessions(user.id);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        revoke.mutate(undefined, { onSuccess: onClose });
      }}
    >
      <p className="text-sm text-slate-800">
        Encerrar todas as sessões abertas de <strong>{user.name}</strong>? A pessoa precisará entrar novamente.
      </p>
      <FormError error={revoke.error} hasFieldErrors={false} />
      <Actions onCancel={onClose} submitLabel="Encerrar sessões" loading={revoke.isPending} loadingLabel="Encerrando…" danger />
    </form>
  );
}
