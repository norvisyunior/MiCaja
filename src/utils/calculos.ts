export const NOMBRES_FORMA_PAGO: Record<string, string> = {
  efectivo: 'Efectivo',
  transfermovil: 'Transfermóvil',
  enzona: 'EnZona',
  transferencia: 'Transferencia',
  mixto: 'Mixto',
};

export const FORMAS_PAGO = [
  'efectivo',
  'transfermovil',
  'enzona',
  'transferencia',
  'mixto',
] as const;

export interface LineaVenta {
  productoId: number | null;
  nombre: string;
  emoji: string;
  color: string;
  precio: number;
  cantidad: number;
}

export function subtotalVenta(lineas: LineaVenta[]): number {
  return lineas.reduce((acc, l) => acc + l.precio * l.cantidad, 0);
}

export function totalVenta(lineas: LineaVenta[], descuentoPct: number): number {
  const sub = subtotalVenta(lineas);
  return Math.max(0, sub - sub * (descuentoPct / 100));
}

export function montoDescuento(lineas: LineaVenta[], descuentoPct: number): number {
  return subtotalVenta(lineas) * (descuentoPct / 100);
}

export function cantidadItems(lineas: LineaVenta[]): number {
  return lineas.reduce((acc, l) => acc + l.cantidad, 0);
}

export function redondear(monto: number): number {
  return Math.round(monto * 100) / 100;
}
