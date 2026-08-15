import { create } from 'zustand';
import type { LineaVenta } from '../utils/calculos';
import { subtotalVenta, totalVenta } from '../utils/calculos';

interface EstadoCarrito {
  lineas: LineaVenta[];
  descuentoPct: number;
  agregar: (p: {
    productoId: number;
    nombre: string;
    emoji: string;
    color: string;
    precio: number;
  }) => void;
  aumentar: (index: number) => void;
  disminuir: (index: number) => void;
  quitarLinea: (index: number) => void;
  vaciar: () => void;
  setDescuento: (pct: number) => void;
}

export const useCarrito = create<EstadoCarrito>((set) => ({
  lineas: [],
  descuentoPct: 0,
  agregar: (p) =>
    set((estado) => {
      const existente = estado.lineas.find((l) => l.productoId === p.productoId);
      if (existente) {
        return {
          lineas: estado.lineas.map((l) =>
            l.productoId === p.productoId ? { ...l, cantidad: l.cantidad + 1 } : l
          ),
        };
      }
      return {
        lineas: [...estado.lineas, { ...p, cantidad: 1 }],
      };
    }),
  aumentar: (index) =>
    set((estado) => ({
      lineas: estado.lineas.map((l, i) =>
        i === index ? { ...l, cantidad: l.cantidad + 1 } : l
      ),
    })),
  disminuir: (index) =>
    set((estado) => ({
      lineas: estado.lineas
        .map((l, i) => (i === index ? { ...l, cantidad: l.cantidad - 1 } : l))
        .filter((l) => l.cantidad > 0),
    })),
  quitarLinea: (index) =>
    set((estado) => ({
      lineas: estado.lineas.filter((_, i) => i !== index),
    })),
  vaciar: () => set({ lineas: [], descuentoPct: 0 }),
  setDescuento: (pct) => set({ descuentoPct: Math.max(0, Math.min(100, pct)) }),
}));

export function usarTotales() {
  const lineas = useCarrito((s) => s.lineas);
  const descuentoPct = useCarrito((s) => s.descuentoPct);
  return {
    subtotal: subtotalVenta(lineas),
    total: totalVenta(lineas, descuentoPct),
    descuentoPct,
    cantidad: lineas.reduce((acc, l) => acc + l.cantidad, 0),
  };
}
