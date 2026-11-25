import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { DashboardPage } from './pages/DashboardPage';
import { EmpresaDetallePage } from './pages/EmpresaDetallePage';
import { EmpresasPage } from './pages/EmpresasPage';
import { LicenciaDetallePage } from './pages/LicenciaDetallePage';
import { LicenciasPage } from './pages/LicenciasPage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route index element={<DashboardPage />} />
                <Route path="empresas" element={<EmpresasPage />} />
                <Route path="empresas/:id" element={<EmpresaDetallePage />} />
                <Route path="licencias" element={<LicenciasPage />} />
                <Route path="licencias/:id" element={<LicenciaDetallePage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
