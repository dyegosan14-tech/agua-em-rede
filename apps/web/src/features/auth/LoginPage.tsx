import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema, type LoginRequest } from '@aer/contracts';
import { Droplets } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Button, TextField } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { useLogin, useSession } from './session';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginRequest>({ resolver: zodResolver(loginRequestSchema) });

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (session.data) return <Navigate to={from} replace />;

  const submitError = login.error instanceof ApiError ? login.error : null;

  return (
    <main className="grid min-h-dvh place-items-center bg-gradient-to-br from-brand-900 via-brand-800 to-aqua-800 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-brand-700 text-aqua-300">
            <Droplets aria-hidden className="size-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Água em Rede</h1>
            <p className="text-sm text-slate-700">Monitoramento e redução de perdas</p>
          </div>
        </div>

        <form
          noValidate
          onSubmit={(event) => {
            void handleSubmit((values) =>
              login.mutate(values, {
                onSuccess: () => void navigate(from, { replace: true }),
              }),
            )(event);
          }}
          className="space-y-4"
        >
          <TextField label="E-mail" type="email" autoComplete="username" inputMode="email" error={errors.email?.message} {...register('email')} />
          <TextField label="Senha" type="password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />

          {submitError ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-900">
              {submitError.isNetwork ? 'Sem conexão com o servidor. Verifique sua rede e tente de novo.' : submitError.message}
            </p>
          ) : null}

          <Button type="submit" loading={login.isPending} loadingLabel="Entrando…" className="w-full">
            Entrar
          </Button>
        </form>
      </div>
    </main>
  );
}
