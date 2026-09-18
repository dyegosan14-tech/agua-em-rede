import type { UserDto } from '@aer/contracts';
import { ROLES, ROLE_LABELS } from '@aer/domain';
import { KeyRound, LogOut, Pencil, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, ErrorState, FreshnessNote, LoadingState } from '../../components/states';
import { Badge, Button, PageHeader, SelectField, TextField } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { useDebouncedValue } from '../../lib/hooks';
import { useSession } from '../auth/session';
import { CreateUserDialog, EditUserDialog, ResetPasswordDialog, RevokeSessionsDialog } from './UserDialogs';
import { useUsers } from './users-api';

const PAGE_SIZE = 20;

export function UsersPage() {
  const { data: session } = useSession();
  const timeZone = session?.organization.timezone ?? 'America/Recife';

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const debouncedSearch = useDebouncedValue(search.trim());

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [resetting, setResetting] = useState<UserDto | null>(null);
  const [revoking, setRevoking] = useState<UserDto | null>(null);

  const users = useUsers({
    limit: PAGE_SIZE,
    offset,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(role ? { role: role as (typeof ROLES)[number] } : {}),
    ...(status ? { isActive: status as 'true' | 'false' } : {}),
  });

  const hasFilters = Boolean(debouncedSearch || role || status);
  const clearFilters = () => {
    setSearch('');
    setRole('');
    setStatus('');
    setOffset(0);
  };

  const rows = users.data?.items ?? [];
  const total = users.data?.page.total ?? 0;

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Pessoas com acesso à sua organização. Mudanças de perfil e desativações encerram as sessões abertas."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden className="size-4" />
            Novo usuário
          </Button>
        }
      />

      <form role="search" aria-label="Filtrar usuários" onSubmit={(event) => event.preventDefault()} className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative lg:col-span-2">
          <TextField label="Buscar por nome ou e-mail" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0); }} />
          <Search aria-hidden className="pointer-events-none absolute bottom-3 right-3 size-4 text-slate-500" />
        </div>
        <SelectField label="Perfil" value={role} onChange={(event) => { setRole(event.target.value); setOffset(0); }}>
          <option value="">Todos</option>
          {ROLES.map((item) => (
            <option key={item} value={item}>
              {ROLE_LABELS[item]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Situação" value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }}>
          <option value="">Todas</option>
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
        </SelectField>
      </form>

      <FreshnessNote updatedAt={users.dataUpdatedAt} isFetching={users.isFetching} failed={users.isError && users.data !== undefined} timeZone={timeZone} />

      {users.isPending ? (
        <LoadingState label="Carregando usuários…" />
      ) : users.isError && !users.data ? (
        <ErrorState error={users.error} onRetry={() => void users.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'Nenhum usuário corresponde aos filtros' : 'Nenhum usuário cadastrado'}
          description={hasFilters ? 'Ajuste ou limpe os filtros para ver mais resultados.' : undefined}
          action={hasFilters ? <Button variant="secondary" onClick={clearFilters}>Limpar filtros</Button> : undefined}
        />
      ) : (
        <>
          <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Lista de usuários da organização</caption>
              <thead className="bg-slate-100 text-slate-800">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Nome</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Perfil</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Situação</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Último acesso</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">
                        {user.name} {user.id === session?.user.id ? <Badge>Você</Badge> : null}
                      </p>
                      <p className="text-slate-700">{user.email}</p>
                    </td>
                    <td className="px-4 py-3">{ROLE_LABELS[user.role]}</td>
                    <td className="px-4 py-3">{user.isActive ? <Badge tone="ok">Ativo</Badge> : <Badge tone="warn">Inativo</Badge>}</td>
                    <td className="px-4 py-3 text-slate-800">{formatDateTime(user.lastLoginAt, timeZone)}</td>
                    <td className="px-4 py-3">
                      <RowActions user={user} onEdit={setEditing} onReset={setResetting} onRevoke={setRevoking} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-3 space-y-3 md:hidden">
            {rows.map((user) => (
              <li key={user.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-900">
                  {user.name} {user.id === session?.user.id ? <Badge>Você</Badge> : null}
                </p>
                <p className="text-sm text-slate-700">{user.email}</p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span>{ROLE_LABELS[user.role]}</span>
                  {user.isActive ? <Badge tone="ok">Ativo</Badge> : <Badge tone="warn">Inativo</Badge>}
                </p>
                <p className="mt-1 text-xs text-slate-700">Último acesso: {formatDateTime(user.lastLoginAt, timeZone)}</p>
                <div className="mt-3">
                  <RowActions user={user} onEdit={setEditing} onReset={setResetting} onRevoke={setRevoking} />
                </div>
              </li>
            ))}
          </ul>

          <nav aria-label="Paginação" className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-800">
            <span>
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} de {total}
            </span>
            <span className="flex gap-2">
              <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                Anterior
              </Button>
              <Button variant="secondary" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                Próxima
              </Button>
            </span>
          </nav>
        </>
      )}

      <CreateUserDialog open={creating} onClose={() => setCreating(false)} />
      <EditUserDialog user={editing} isSelf={editing?.id === session?.user.id} onClose={() => setEditing(null)} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
      <RevokeSessionsDialog user={revoking} onClose={() => setRevoking(null)} />
    </>
  );
}

function RowActions({ user, onEdit, onReset, onRevoke }: { user: UserDto; onEdit: (u: UserDto) => void; onReset: (u: UserDto) => void; onRevoke: (u: UserDto) => void }) {
  return (
    <div className="flex flex-wrap justify-end gap-x-0 gap-y-1 max-md:justify-start [&>button]:px-2 lg:flex-nowrap">
      <Button variant="ghost" onClick={() => onEdit(user)} aria-label={`Editar ${user.name}`}>
        <Pencil aria-hidden className="size-4" />
        Editar
      </Button>
      <Button variant="ghost" onClick={() => onReset(user)} aria-label={`Redefinir senha de ${user.name}`}>
        <KeyRound aria-hidden className="size-4" />
        Senha
      </Button>
      <Button variant="ghost" onClick={() => onRevoke(user)} aria-label={`Encerrar sessões de ${user.name}`}>
        <LogOut aria-hidden className="size-4" />
        Sessões
      </Button>
    </div>
  );
}
