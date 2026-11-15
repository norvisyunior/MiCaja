export const EMPRESA_ESTADOS = ['pendiente', 'activa', 'suspendida', 'cancelada'] as const;
export type EmpresaEstado = (typeof EMPRESA_ESTADOS)[number];

export const LICENCIA_ESTADOS = ['pendiente', 'activa', 'vencida', 'suspendida'] as const;
export type LicenciaEstado = (typeof LICENCIA_ESTADOS)[number];

export const DISPOSITIVO_ESTADOS = ['activo', 'inactivo', 'bloqueado'] as const;
export type DispositivoEstado = (typeof DISPOSITIVO_ESTADOS)[number];

export const USUARIO_ROLES = ['propietario', 'admin', 'dependiente'] as const;
export type UsuarioRol = (typeof USUARIO_ROLES)[number];

export const FORMAS_PAGO = ['efectivo', 'transfermovil', 'enzona', 'transferencia', 'mixto'] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number];

export const PLATAFORMAS = ['android', 'ios', 'web'] as const;
export type Plataforma = (typeof PLATAFORMAS)[number];

export const SYNC_ESTADOS = ['pendiente', 'aplicada', 'rechazada', 'conflicto'] as const;
export type SyncEstado = (typeof SYNC_ESTADOS)[number];

export const LICENSE_FEATURES = [
  'ventas',
  'inventario',
  'reportes',
  'backup',
  'multiusuario',
] as const;
export type LicenseFeature = (typeof LICENSE_FEATURES)[number];

export interface Empresa {
  id: string;
  nombre: string;
  propietario: string;
  email: string | null;
  telefono: string | null;
  estado: EmpresaEstado;
  planId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Plan {
  id: string;
  codigo: string;
  nombre: string;
  maxDispositivos: number | null;
  features: string[];
  precioMensual: number;
  activo: boolean;
}

export interface Licencia {
  id: string;
  empresaId: string;
  planId: string;
  estado: LicenciaEstado;
  activadaEn: string | null;
  venceEn: string;
  graceDias: number;
  features: string[];
}

export interface Dispositivo {
  id: string;
  empresaId: string;
  nombre: string;
  plataforma: Plataforma;
  appVersion: string;
  estado: DispositivoEstado;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
}
