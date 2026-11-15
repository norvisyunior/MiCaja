export type Rol = 'admin' | 'dependiente';

export interface Usuario {
  id: number;
  uuid?: string;
  nombre: string;
  usuario: string;
  rol: Rol;
  activo: boolean;
  version?: number;
  deletedAt?: string | null;
}

export interface Categoria {
  id: number;
  uuid?: string;
  nombre: string;
  color: string;
  orden: number;
  activo: boolean;
  version?: number;
  deletedAt?: string | null;
}

export interface Producto {
  id: number;
  uuid?: string;
  categoriaId: number | null;
  nombre: string;
  precio: number;
  emoji: string;
  color: string;
  imagen: string | null;
  orden: number;
  activo: boolean;
  stock: number;
  stockMinimo: number;
  version?: number;
  deletedAt?: string | null;
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
  uuid?: string;
  servidorId?: string | null;
  numero: number;
  numeroServidor?: number | null;
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
  uuid?: string;
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
