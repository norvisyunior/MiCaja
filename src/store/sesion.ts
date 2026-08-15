import { create } from 'zustand';
import type { Usuario } from '../types';

interface EstadoSesion {
  usuario: Usuario | null;
  iniciar: (usuario: Usuario) => void;
  cerrar: () => void;
}

export const useSesion = create<EstadoSesion>((set) => ({
  usuario: null,
  iniciar: (usuario) => set({ usuario }),
  cerrar: () => set({ usuario: null }),
}));
