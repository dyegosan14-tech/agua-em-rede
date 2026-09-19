import { Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { AlertsPage } from './features/alerts/AlertsPage';
import { AnalyticsPage } from './features/analytics/AnalyticsPage';
import { RequireAuth, RequirePermission } from './features/auth/guards';
import { LoginPage } from './features/auth/LoginPage';
import { DevicesPage } from './features/devices/DevicesPage';
import { SectorsPage } from './features/sectors/SectorsPage';
import { UsersPage } from './features/users/UsersPage';
import { WorkOrdersPage } from './features/work-orders/WorkOrdersPage';
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
          <Route element={<RequirePermission permission="analytics:read" />}>
            <Route path="indicadores" element={<AnalyticsPage />} />
          </Route>
          <Route element={<RequirePermission permission="alerts:read" />}>
            <Route path="alertas" element={<AlertsPage />} />
          </Route>
          <Route element={<RequirePermission permission="work-orders:read" />}>
            <Route path="ordens-servico" element={<WorkOrdersPage />} />
          </Route>
          <Route element={<RequirePermission permission="sectors:read" />}>
            <Route path="setores" element={<SectorsPage />} />
          </Route>
          <Route element={<RequirePermission permission="devices:read" />}>
            <Route path="dispositivos" element={<DevicesPage />} />
          </Route>
          <Route element={<RequirePermission permission="users:read" />}>
            <Route path="usuarios" element={<UsersPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
