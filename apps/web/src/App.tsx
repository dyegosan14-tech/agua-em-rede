import { Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { RequireAuth, RequirePermission } from './features/auth/guards';
import { LoginPage } from './features/auth/LoginPage';
import { UsersPage } from './features/users/UsersPage';
import { AccountPage } from './pages/AccountPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="conta" element={<AccountPage />} />
          <Route element={<RequirePermission permission="users:read" />}>
            <Route path="usuarios" element={<UsersPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
