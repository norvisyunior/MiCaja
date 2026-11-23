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
  tienePin?: boolean;
  tieneCodigoRecuperacion?: boolean;
  bloqueado?: boolean;
  bloqueadoHasta?: string | null;
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
  costo: number | null;
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
  costoUnitario: number | null;
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
  reembolsoEfectivo: number;
  reembolsoDigital: number;
  items: VentaItem[];
  usuarioNombre?: string;
}

export interface TurnoCaja {
  id: number;
  uuid?: string;
  usuarioId: number;
  apertura: string;
  cierre: string | null;
  fondoInicial: number;
  efectivoEsperado: number;
  observacionDiferencia: string | null;
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

export type CategoriaGasto =
  | 'transporte'
  | 'servicios'
  | 'salarios'
  | 'electricidad'
  | 'alquiler'
  | 'otros';

export const CATEGORIAS_GASTO: readonly CategoriaGasto[] = [
  'transporte',
  'servicios',
  'salarios',
  'electricidad',
  'alquiler',
  'otros',
];

export type TipoMovimientoCaja = 'entrada' | 'retiro' | 'gasto' | 'otra_salida';

export interface MovimientoCaja {
  id: number;
  uuid: string;
  turnoId: number | null;
  usuarioId: number | null;
  tipo: TipoMovimientoCaja;
  monto: number;
  descripcion: string;
  gastoId: number | null;
  version: number;
  deletedAt: string | null;
}

export interface ConteoInventario {
  id: number;
  uuid: string;
  turnoId: number | null;
  productoId: number;
  cantidadSistema: number;
  cantidadContada: number;
  diferencia: number;
  motivo: string | null;
  usuarioId: number | null;
  version: number;
  deletedAt: string | null;
}

export interface Gasto {
  id: number;
  uuid: string;
  categoria: CategoriaGasto;
  concepto: string;
  monto: number;
  fecha: string;
  formaPago: string;
  movimientoCajaId: number | null;
  version: number;
  deletedAt: string | null;
}
