import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icono } from './Iconos';

export type TonoToast = 'exito' | 'error' | 'info';

interface Toast {
  id: string;
  mensaje: string;
  tono: TonoToast;
}

interface ToastContextValue {
  mostrarToast: (mensaje: string, tono?: TonoToast) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const contador = useRef(0);

  const quitar = useCallback((id: string) => {
    setToasts((actuales) => actuales.filter((toast) => toast.id !== id));
  }, []);

  const mostrarToast = useCallback(
    (mensaje: string, tono: TonoToast = 'exito') => {
      contador.current += 1;
      const id = `toast-${contador.current}`;
      setToasts((actuales) => [...actuales.slice(-3), { id, mensaje, tono }]);
      window.setTimeout(() => quitar(id), 4500);
    },
    [quitar]
  );

  const valor = useMemo(() => ({ mostrarToast }), [mostrarToast]);

  return (
    <ToastContext.Provider value={valor}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tono}`} role="status">
            <span className="toast__icono">
              <Icono nombre={toast.tono === 'error' ? 'alerta' : 'check'} tamano={16} />
            </span>
            <span>{toast.mensaje}</span>
            <button
              type="button"
              className="toast__cerrar"
              onClick={() => quitar(toast.id)}
              aria-label="Cerrar aviso"
            >
              <Icono nombre="cerrar" tamano={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const contexto = useContext(ToastContext);
  if (!contexto) throw new Error('useToast debe usarse dentro de ToastProvider');
  return contexto;
}
