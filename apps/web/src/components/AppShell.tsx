import {
  AlertTriangle,
  CircleUserRound,
  Droplets,
  Gauge,
  House,
  Layers,
  LogOut,
  TrendingUp,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@aer/domain';
import { NavLink, Outlet } from 'react-router';
import { useLogout, useSession } from '../features/auth/session';
import { OfflineBanner } from './states';
import { Button } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Início', icon: House, end: true },
  { to: '/indicadores', label: 'Indicadores & KPIs', icon: TrendingUp, permission: 'analytics:read' },
  { to: '/alertas', label: 'Alertas', icon: AlertTriangle, permission: 'alerts:read' },
  { to: '/ordens-servico', label: 'Ordens de Serviço', icon: Wrench, permission: 'work-orders:read' },
  { to: '/setores', label: 'Setores', icon: Layers, permission: 'sectors:read' },
  { to: '/dispositivos', label: 'Dispositivos', icon: Gauge, permission: 'devices:read' },
  { to: '/usuarios', label: 'Usuários', icon: Users, permission: 'users:read' },
  { to: '/conta', label: 'Minha conta', icon: CircleUserRound },
];

/** Banner persistente exibido em organizações de demonstração (dados fictícios/simulados). */
function DemoBanner() {
  return (
    <div role="note" className="sticky top-0 z-30 bg-amber-300 px-4 py-2 text-center text-sm font-bold text-amber-950">
      Ambiente demonstrativo — dados simulados
    </div>
  );
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-brand-700 text-white' : 'text-brand-50 hover:bg-brand-800'
  }`;

const bottomLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium ${
    isActive ? 'text-brand-800' : 'text-slate-700'
  }`;

export function AppShell() {
  const { data: session } = useSession();
  const logout = useLogout();
  if (!session) return null;

  const items = NAV_ITEMS.filter((item) => !item.permission || session.permissions.includes(item.permission));

  return (
    <div className="min-h-dvh">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>
      {session.organization.isDemo ? <DemoBanner /> : null}
      <OfflineBanner />

      <div className="lg:flex">
        <aside className="hidden w-64 shrink-0 flex-col bg-brand-900 p-4 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh">
          <div className="mb-6 flex items-center gap-3 px-1">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-700 text-aqua-300">
              <Droplets aria-hidden className="size-5" />
            </span>
            <span className="text-lg font-bold">Água em Rede</span>
          </div>
          <nav aria-label="Navegação principal" className="flex flex-1 flex-col gap-1">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end ?? false} className={linkClass}>
                <item.icon aria-hidden className="size-5" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-brand-700 pt-4">
            <p className="truncate text-sm font-semibold">{session.user.name}</p>
            <p className="truncate text-xs text-brand-100">{session.organization.name}</p>
            <Button variant="ghost" loading={logout.isPending} loadingLabel="Saindo…" onClick={() => logout.mutate()} className="mt-3 w-full justify-start text-white! hover:bg-brand-800!">
              <LogOut aria-hidden className="size-5" />
              Sair
            </Button>
          </div>
        </aside>

        <main id="conteudo" tabIndex={-1} className="min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-10 lg:pb-10">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-300 bg-white pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
      >
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end ?? false} className={bottomLinkClass}>
            <item.icon aria-hidden className="size-5" />
            {item.label}
          </NavLink>
        ))}
        <button type="button" onClick={() => logout.mutate()} className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium text-slate-700">
          <LogOut aria-hidden className="size-5" />
          Sair
        </button>
      </nav>
    </div>
  );
}
