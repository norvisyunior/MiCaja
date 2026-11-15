import { create } from 'zustand';
import type { ResultadoLicencia } from '../licencias/verificar';

interface EstadoSync {
  sincronizando: boolean;
  pendientes: number;
  fallidas: number;
  ultimaSync: string | null;
  error: string | null;
  licencia: ResultadoLicencia | null;
  fijarSincronizando: (valor: boolean) => void;
  fijarPendientes: (pendientes: number, fallidas: number) => void;
  fijarUltimaSync: (fecha: string | null) => void;
  fijarError: (error: string | null) => void;
  fijarLicencia: (licencia: ResultadoLicencia | null) => void;
}

export const useSync = create<EstadoSync>((set) => ({
  sincronizando: false,
  pendientes: 0,
  fallidas: 0,
  ultimaSync: null,
  error: null,
  licencia: null,
  fijarSincronizando: (sincronizando) => set({ sincronizando }),
  fijarPendientes: (pendientes, fallidas) => set({ pendientes, fallidas }),
  fijarUltimaSync: (ultimaSync) => set({ ultimaSync }),
  fijarError: (error) => set({ error }),
  fijarLicencia: (licencia) => set({ licencia }),
}));
