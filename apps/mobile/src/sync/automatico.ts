import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { leerTokenDispositivo } from '../api/config';
import { registrarDisparadorSync } from './disparador';
import { refrescarEstadoSync, sincronizarSilencioso } from './motor';
import { crearProgramadorSync } from './programador';

const INTERVALO_MS = 60_000;

export function useSyncAutomatico(db: SQLiteDatabase, activo: boolean): void {
  useEffect(() => {
    if (!activo) return;

    let vigente = true;

    const programador = crearProgramadorSync({
      sincronizar: async () => {
        if (!vigente) return;
        try {
          if (await leerTokenDispositivo(db)) {
            await sincronizarSilencioso(db);
          }
        } catch {
          return;
        }
      },
    });
    const desregistrarDisparador = registrarDisparadorSync(() => programador.solicitar());

    async function iniciar() {
      try {
        await refrescarEstadoSync(db);
      } catch {
        // El estado local queda intacto; se reintenta en el siguiente ciclo.
      }
      if (vigente) programador.solicitar();
    }

    const suscripcionApp = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') programador.solicitar();
    });

    function alCambiarVisibilidad() {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        programador.solicitar();
      }
    }

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', alCambiarVisibilidad);
    }

    const intervalo = setInterval(() => {
      if (vigente) programador.solicitar();
    }, INTERVALO_MS);

    void iniciar();

    return () => {
      vigente = false;
      desregistrarDisparador();
      clearInterval(intervalo);
      suscripcionApp.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      }
      programador.detener();
    };
  }, [db, activo]);
}
