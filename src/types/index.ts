export type Rol = 'admin' | 'dependiente';

export interface Usuario {
  id: number;
  nombre: string;
  rol: Rol;
  pin: string;
  activo: boolean;
}

export interface Categoria {
  id: number;
  nombre: string;
  color: string;
  orden: number;
  activo: boolean;
}

export interface Producto {
  id: number;
  categoriaId: number | null;
  nombre: string;
  precio: number;
  emoji: string;
  color: string;
  orden: number;
  activo: boolean;
  stock: number;
  stockMinimo: number;
}

export type FormaPago =
  | 'efectivo'
  | 'transfermovil'
  | 'enzona'
  | 'transferencia'
  | 'mixto';

export interface VentaItem {
  id: number;
  ventaId: number;
  productoId: number | null;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
  subtotal: number;
}

export interface Venta {
  id: number;
  numero: number;
  turnoId: number | null;
  usuarioId: number;
  fechaIso: string;
  subtotal: number;
  descuentoPct: number;
  total: number;
  formaPago: FormaPago;
  montoEfectivo: number;
  montoDigital: number;
  anulada: boolean;
  motivoAnulacion: string | null;
  anuladaPor: number | null;
  anuladaEn: string | null;
  items: VentaItem[];
  usuarioNombre?: string;
}

export interface TurnoCaja {
  id: number;
  usuarioId: number;
  apertura: string;
  cierre: string | null;
  ventasCount: number;
  totalEsperado: number;
  desglose: Record<string, number>;
  dineroReal: number | null;
  diferencia: number | null;
  estado: 'abierto' | 'cerrado';
}

export interface Settings {
  nombreNegocio: string;
  moneda: string;
  simboloMoneda: string;
  diaVenta: string;
  numeroVentaDia: number;
  tema: 'claro' | 'oscuro';
}
