import { changePasswordRequestSchema, type ChangePasswordRequest } from '@aer/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Button, PageHeader, TextField } from '../components/ui';
import { ApiError, api } from '../lib/api';

export function AccountPage() {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordRequest>({ resolver: zodResolver(changePasswordRequestSchema) });

  const change = useMutation({
    mutationFn: (input: ChangePasswordRequest) => api<{ revokedSessions: number }>('/auth/change-password', { method: 'POST', body: input }),
    onSuccess: () => reset(),
    onError: (error) => {
      if (error instanceof ApiError) {
        for (const detail of error.details ?? []) {
          if (detail.path === 'currentPassword' || detail.path === 'newPassword') setError(detail.path, { message: detail.message });
        }
      }
    },
  });

  return (
    <>
      <PageHeader title="Minha conta" description="Altere sua senha. As demais sessões abertas com sua conta serão encerradas." />
      <form
        noValidate
        onSubmit={(event) => {
          void handleSubmit((values) => change.mutate(values))(event);
        }}
        className="max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5"
      >
        <TextField label="Senha atual" type="password" autoComplete="current-password" error={errors.currentPassword?.message} {...register('currentPassword')} />
        <TextField label="Nova senha" type="password" autoComplete="new-password" hint="Mínimo de 12 caracteres." error={errors.newPassword?.message} {...register('newPassword')} />

        {change.isError && !(change.error instanceof ApiError && change.error.details?.length) ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-900">
            {change.error instanceof ApiError ? change.error.message : 'Não foi possível alterar a senha.'}
          </p>
        ) : null}
        {change.isSuccess ? (
          <p role="status" className="rounded-lg border border-aqua-300 bg-aqua-50 p-3 text-sm font-medium text-aqua-900">
            Senha alterada. {change.data.revokedSessions > 0 ? `${change.data.revokedSessions} outra(s) sessão(ões) foram encerradas.` : 'Não havia outras sessões abertas.'}
          </p>
        ) : null}

        <Button type="submit" loading={change.isPending} loadingLabel="Salvando…">
          Alterar senha
        </Button>
      </form>
    </>
  );
}
