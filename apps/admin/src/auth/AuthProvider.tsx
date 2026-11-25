import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  api,
  EVENTO_SESION_EXPIRADA,
  leerSesionGuardada,
  limpiarSesion,
} from '../api/client';
import type { Admin } from '../api/types';
import { useToast } from '../components/Toast';

interface AuthContextValue {
  admin: Admin | null;
  login: (email: string, password: string) => Promise<void>;
  salir: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(
    () => leerSesionGuardada()?.admin ?? null
  );
  const { mostrarToast } = useToast();

  const login = useCallback(async (email: string, password: string) => {
    const adminLogueado = await api.login(email, password);
    setAdmin(adminLogueado);
  }, []);

  const salir = useCallback(() => {
    limpiarSesion();
    setAdmin(null);
  }, []);

  useEffect(() => {
    function alExpirarSesion() {
      setAdmin(null);
      mostrarToast('Tu sesión expiró. Entra de nuevo.', 'info');
    }

    window.addEventListener(EVENTO_SESION_EXPIRADA, alExpirarSesion);
    return () => window.removeEventListener(EVENTO_SESION_EXPIRADA, alExpirarSesion);
  }, [mostrarToast]);

  const valor = useMemo(() => ({ admin, login, salir }), [admin, login, salir]);

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return contexto;
}

export function RequireAuth() {
  const { admin } = useAuth();
  const ubicacion = useLocation();

  if (!admin) {
    return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />;
  }

  return <Outlet />;
}
