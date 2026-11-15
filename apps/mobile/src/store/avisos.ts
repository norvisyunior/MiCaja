import { create } from 'zustand';

export interface BotonAviso {
  texto: string;
  estilo?: 'normal' | 'cancel' | 'peligro';
  onPress?: () => void;
}

export interface Aviso {
  id: number;
  titulo: string;
  mensaje?: string;
  botones: BotonAviso[];
}

interface EstadoAvisos {
  avisos: Aviso[];
  mostrar: (titulo: string, mensaje?: string, botones?: BotonAviso[]) => void;
  cerrar: (id: number) => void;
}

let siguienteId = 1;

export const useAvisos = create<EstadoAvisos>((set) => ({
  avisos: [],
  mostrar: (titulo, mensaje, botones) => {
    const id = siguienteId++;
    const lista = botones && botones.length > 0 ? botones : [{ texto: 'Entendido' }];
    set((s) => ({ avisos: [...s.avisos, { id, titulo, mensaje, botones: lista }] }));
  },
  cerrar: (id) => set((s) => ({ avisos: s.avisos.filter((a) => a.id !== id) })),
}));
