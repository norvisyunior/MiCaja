import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import * as Network from 'expo-network';
import type { NetworkState } from 'expo-network';
import { leerTokenDispositivo } from '../api/config';
import { registrarDisparadorSync } from './disparador';
import { refrescarEstadoSync, sincronizarSilencioso } from './motor';
import { crearProgramadorSync } from './programador';

const INTERVALO_MS = 60_000;

function estaConectado(estado: NetworkState): boolean | null {
  if (estado.isConnected === false || estado.isInternetReachable === false) return false;
  return true;
}

export function useSyncAutomatico(db: SQLiteDatabase, activo: boolean): void {
  useEffect(() => {
    if (!activo) return;

    let vigente = true;
    let conectado: boolean | null = null;

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
        const estado = await Network.getNetworkStateAsync();
        if (!vigente) return;
        conectado = estaConectado(estado);
        if (conectado !== false) programador.solicitar();
      } catch {
        if (vigente) programador.solicitar();
      }
    }

    const suscripcionRed = Network.addNetworkStateListener((estado) => {
      const siguiente = estaConectado(estado);
      const reconectado = conectado === false && siguiente !== false;
      conectado = siguiente;
      if (reconectado) programador.solicitar();
    });

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
      if (conectado !== false) programador.solicitar();
    }, INTERVALO_MS);

    void iniciar();

    return () => {
      vigente = false;
      desregistrarDisparador();
      clearInterval(intervalo);
      suscripcionRed.remove();
      suscripcionApp.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      }
      programador.detener();
    };
  }, [db, activo]);
}
