import { ROLE_LABELS } from '@aer/domain';
import { PageHeader } from '../components/ui';
import { Badge } from '../components/ui';
import { useSession } from '../features/auth/session';
import { formatDateTime } from '../lib/format';

const ROLE_DESCRIPTIONS = {
  ADMIN: 'Acesso completo: usuários, configurações, monitoramento, alertas e ordens de serviço.',
  OPERATOR: 'Monitoramento, tratamento de alertas e distribuição de ordens de serviço.',
  TECHNICIAN: 'Consulta e atualização das ordens de serviço atribuídas a você.',
  VIEWER: 'Consulta de painéis e indicadores, sem permissão de alteração.',
} as const;

export function HomePage() {
  const { data: session } = useSession();
  if (!session) return null;
  const { user, organization } = session;
  const timeZone = organization.timezone;

  return (
    <>
      <PageHeader title={`Olá, ${user.name.split(' ')[0] ?? user.name}`} description="Visão geral da sua conta nesta plataforma." />

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="perfil" className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 id="perfil" className="text-base font-semibold text-slate-900">
            Seu acesso
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-700">Perfil</dt>
              <dd>
                <Badge tone="info">{ROLE_LABELS[user.role]}</Badge>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-700">E-mail</dt>
              <dd className="truncate font-medium text-slate-900">{user.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-700">Organização</dt>
              <dd className="text-right font-medium text-slate-900">{organization.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-700">Sessão válida até</dt>
              <dd className="font-medium text-slate-900">{formatDateTime(session.expiresAt, timeZone)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-slate-700">{ROLE_DESCRIPTIONS[user.role]}</p>
        </section>

        <section aria-labelledby="escopo" className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 id="escopo" className="text-base font-semibold text-slate-900">
            Estado desta versão
          </h2>
          <p className="mt-3 text-sm text-slate-800">
            Disponível agora: autenticação por sessão, gestão de usuários, trilha de auditoria e a estrutura de dados da plataforma.
          </p>
          <p className="mt-2 text-sm text-slate-800">
            Ainda <strong>não</strong> disponíveis: mapa, telemetria, alertas, ordens de serviço, aplicação de campo e indicadores. Nenhuma
            medição é exibida nesta versão.
          </p>
        </section>
      </div>
    </>
  );
}
