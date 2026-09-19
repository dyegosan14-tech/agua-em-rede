import { Activity, ArrowRight, CheckCircle2, Gauge, Layers, Users } from 'lucide-react';
import { Link } from 'react-router';
import { ROLE_LABELS } from '@aer/domain';
import { Badge, PageHeader } from '../components/ui';
import { useSession } from '../features/auth/session';
import { useDashboardSummary } from '../features/dashboard/dashboard-api';
import { formatDateTime } from '../lib/format';

const ROLE_DESCRIPTIONS = {
  ADMIN: 'Acesso completo: usuários, configurações, monitoramento, setores, dispositivos, alertas e ordens.',
  OPERATOR: 'Monitoramento de campo, tratamento de setores, dispositivos, alertas e ordens de serviço.',
  TECHNICIAN: 'Consulta e execução técnica das ordens de serviço atribuídas.',
  VIEWER: 'Consulta e acompanhamento de indicadores e cadastros da rede.',
} as const;

export function HomePage() {
  const { data: session } = useSession();
  const { data: summary, isLoading: isSummaryLoading } = useDashboardSummary();

  if (!session) return null;
  const { user, organization, permissions } = session;
  const timeZone = organization.timezone;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Olá, ${user.name.split(' ')[0] ?? user.name}`}
        description="Painel de controle e monitoramento da rede de distribuição de água."
      />

      {/* Cartões de Indicadores Operacionais */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Setores */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">Setores de Rede</span>
            <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <Layers aria-hidden className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-slate-900">
              {isSummaryLoading ? '…' : summary?.sectorsCount ?? 0}
            </span>
            <p className="mt-1 text-xs text-slate-700">Zonas de abastecimento mapeadas</p>
          </div>
          {permissions.includes('sectors:read') ? (
            <Link
              to="/setores"
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900"
            >
              Ver setores <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          ) : null}
        </div>

        {/* Dispositivos */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">Dispositivos</span>
            <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <Gauge aria-hidden className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-slate-900">
              {isSummaryLoading ? '…' : summary?.devicesCount ?? 0}
            </span>
            <p className="mt-1 text-xs text-slate-700">
              {summary
                ? `${summary.pressureSensorsCount} de pressão · ${summary.flowMetersCount} de vazão`
                : 'Sensores instalados'}
            </p>
          </div>
          {permissions.includes('devices:read') ? (
            <Link
              to="/dispositivos"
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900"
            >
              Ver dispositivos <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          ) : null}
        </div>

        {/* Situação dos Sensores */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">Sensores Ativos</span>
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <Activity aria-hidden className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-slate-900">
              {isSummaryLoading ? '…' : summary?.activeDevicesCount ?? 0}
            </span>
            <p className="mt-1 text-xs text-emerald-700 font-medium">
              {summary && summary.devicesCount > 0
                ? `${Math.round((summary.activeDevicesCount / summary.devicesCount) * 100)}% da base ativa`
                : 'Prontos para telemetria'}
            </p>
          </div>
          <span className="mt-4 inline-block text-xs text-slate-600">Disponibilidade de rede</span>
        </div>

        {/* Usuários */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">Equipe</span>
            <span className="grid size-9 place-items-center rounded-xl bg-purple-50 text-purple-700">
              <Users aria-hidden className="size-5" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-slate-900">
              {isSummaryLoading ? '…' : summary?.usersCount ?? 0}
            </span>
            <p className="mt-1 text-xs text-slate-700">Usuários nesta organização</p>
          </div>
          {permissions.includes('users:read') ? (
            <Link
              to="/usuarios"
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900"
            >
              Gerenciar equipe <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Painel de Identidade e Acesso */}
        <section aria-labelledby="perfil" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <h2 id="perfil" className="text-base font-semibold text-slate-900">
            Seu Acesso e Organização
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <dt className="text-slate-700">Perfil Operacional</dt>
              <dd>
                <Badge tone="info">{ROLE_LABELS[user.role]}</Badge>
              </dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-slate-700">E-mail</dt>
              <dd className="truncate font-mono text-xs font-medium text-slate-900">{user.email}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-slate-700">Organização</dt>
              <dd className="text-right font-medium text-slate-900">{organization.name}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-slate-700">Fuso Oficial</dt>
              <dd className="font-mono text-xs font-medium text-slate-900">{timeZone}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-slate-700">Sessão válida até</dt>
              <dd className="font-medium text-slate-900">{formatDateTime(session.expiresAt, timeZone)}</dd>
            </div>
          </dl>
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
            {ROLE_DESCRIPTIONS[user.role]}
          </div>
        </section>

        {/* Estado da Plataforma */}
        <section aria-labelledby="escopo" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h2 id="escopo" className="text-base font-semibold text-slate-900">
              Desafio Recife & Indicadores
            </h2>
            <Badge tone="ok">Plataforma Completa</Badge>
          </div>

          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 aria-hidden className="size-4 shrink-0 text-emerald-600 mt-0.5" />
              <p>
                <strong>Meta de Redução de 30%</strong>: Acompanhamento em tempo real de perdas, volume recuperado e economia operacional (R$).
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <CheckCircle2 aria-hidden className="size-4 shrink-0 text-emerald-600 mt-0.5" />
              <p>
                <strong>Detecção de Rompimentos</strong>: Regras hidráulicas automáticas correlacionando surtos de vazão e quedas de pressão.
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <CheckCircle2 aria-hidden className="size-4 shrink-0 text-emerald-600 mt-0.5" />
              <p>
                <strong>Ordens de Serviço & MTTR</strong>: Gestão de resposta de campo e mensuração do tempo médio de reparo.
              </p>
            </div>

            {permissions.includes('analytics:read') ? (
              <div className="pt-2">
                <Link
                  to="/indicadores"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-2 text-xs font-bold text-brand-800 hover:bg-brand-100"
                >
                  Abrir Painel de Indicadores & KPIs <ArrowRight className="size-3.5" />
                </Link>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
