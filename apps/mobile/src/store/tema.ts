import { create } from 'zustand';
import { paletas, type ModoTema, type PaletaColores } from '../theme';

interface EstadoTema {
  modo: ModoTema;
  colores: PaletaColores;
  fijar: (modo: ModoTema) => void;
  alternar: () => void;
}

export const useTema = create<EstadoTema>((set) => ({
  modo: 'claro',
  colores: paletas.claro,
  fijar: (modo) => set({ modo, colores: paletas[modo] }),
  alternar: () =>
    set((s) => {
      const modo: ModoTema = s.modo === 'claro' ? 'oscuro' : 'claro';
      return { modo, colores: paletas[modo] };
    }),
}));
