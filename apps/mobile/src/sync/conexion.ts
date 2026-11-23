import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { verificarServidor } from '../api/cliente';
import { useSync } from '../store/sync';
import { pedirSyncAhora } from './disparador';

export const INTERVALO_CONEXION_MS = 20_000;

export function useConexionBackend(db: SQLiteDatabase, activo: boolean): void {
  useEffect(() => {
    if (!activo) return;

    let vigente = true;
    let comprobando = false;

    async function comprobar() {
      if (!vigente || comprobando) return;
      comprobando = true;
      try {
        const conectado = await verificarServidor(db);
        if (!vigente) return;
        const anterior = useSync.getState().conectado;
        useSync.setState({ conectado });
        if (conectado && anterior === false) pedirSyncAhora();
      } catch {
        if (vigente) useSync.setState({ conectado: false });
      } finally {
        comprobando = false;
      }
    }

    const suscripcionApp = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void comprobar();
    });

    function alCambiarVisibilidad() {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void comprobar();
      }
    }

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', alCambiarVisibilidad);
    }

    const intervalo = setInterval(() => void comprobar(), INTERVALO_CONEXION_MS);
    void comprobar();

    return () => {
      vigente = false;
      clearInterval(intervalo);
      suscripcionApp.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      }
    };
  }, [db, activo]);
}
