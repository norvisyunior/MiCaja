export type EmpresaEstado = 'pendiente' | 'activa' | 'suspendida' | 'cancelada';
export type LicenciaEstado = 'pendiente' | 'activa' | 'vencida' | 'suspendida';
export type DispositivoEstado = 'activo' | 'inactivo' | 'bloqueado';
export type Plataforma = 'android' | 'ios' | 'web';

export interface Admin {
  id: string;
  email: string;
  nombre: string;
  rol: string;
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
  licenciaId: string | null;
  licenciaEstado: LicenciaEstado | null;
  venceEn: string | null;
  graceDias: number | null;
  planCodigo: string | null;
  dispositivos: number;
}

export interface Dispositivo {
  id: string;
  nombre: string;
  plataforma: Plataforma;
  appVersion: string;
  estado: DispositivoEstado;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface EmpresaDetalle extends Empresa {
  planFeatures: string[];
  licenciaFeatures: string[];
  dispositivosLista: Dispositivo[];
  dispositivosTotal: number;
  dispositivosPagina: number;
  conteos: {
    usuarios: number;
    productos: number;
    ventas: number;
  };
}

export interface Licencia {
  id: string;
  empresaId: string;
  empresaNombre: string;
  empresaEstado?: EmpresaEstado;
  propietario?: string;
  email?: string | null;
  telefono?: string | null;
  planCodigo: string;
  planNombre?: string;
  planFeatures?: string[];
  maxDispositivos?: number | null;
  estado: LicenciaEstado;
  activadaEn: string | null;
  venceEn: string;
  graceDias: number;
  features?: string[];
  codigoExpiraEn: string | null;
  codigoUsadoEn: string | null;
  dispositivos: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Evento {
  id: string;
  tipo: string;
  payload: Record<string, unknown>;
  createdAt: string;
  empresaId?: string;
  empresaNombre?: string;
}

export interface LicenciaAtencion {
  id: string;
  empresaId: string;
  empresaNombre: string;
  estado: LicenciaEstado;
  planCodigo: string;
  venceEn: string;
  graceDias: number;
  finGracia: string;
}

export interface Resumen {
  conteos: {
    empresasTotal: number;
    empresasActivas: number;
    empresasPendientes: number;
    empresasSuspendidas: number;
    empresasCanceladas: number;
    licenciasTotal: number;
    licenciasActivas: number;
    licenciasVencidas: number;
    licenciasSuspendidas: number;
    licenciasPendientes: number;
    licenciasEnGracia: number;
    licenciasPorVencer: number;
    dispositivosActivos: number;
    dispositivos24h: number;
  };
  atencion: LicenciaAtencion[];
  eventos: Evento[];
}

export interface CrearEmpresaInput {
  nombre: string;
  propietario: string;
  email?: string;
  telefono?: string;
  planCodigo: string;
  venceEn?: string;
  graceDias: number;
}

export interface CrearEmpresaResultado {
  empresa: { id: string; nombre: string };
  licencia: {
    id: string;
    estado: LicenciaEstado;
    venceEn: string;
    graceDias: number;
  };
  codigoActivacion: string;
  codigoExpiraEn: string;
}

export interface CodigoResultado {
  codigo: string;
  expira: string;
  venceEn?: string;
}

export interface ActualizarLicenciaInput {
  planCodigo?: string;
  venceEn?: string;
  graceDias?: number;
  estado?: LicenciaEstado;
}

export interface ActivarLicenciaInput {
  planCodigo?: string;
  venceEn?: string;
  graceDias?: number;
}

export interface LoginResultado {
  token: string;
  admin: Admin;
}

interface EmpresaFila {
  id: string;
  nombre: string;
  propietario: string;
  email: string | null;
  telefono: string | null;
  estado: EmpresaEstado;
  plan_id: string | null;
  created_at: string;
  updated_at: string;
  licencia_id: string | null;
  licencia_estado: LicenciaEstado | null;
  vence_en: string | null;
  grace_dias: number | null;
  plan_codigo: string | null;
  dispositivos: number;
}

interface DispositivoFila {
  id: string;
  nombre: string;
  plataforma: Plataforma;
  app_version: string;
  estado: DispositivoEstado;
  last_seen_at: string | null;
  last_sync_at: string | null;
  created_at: string;
}

interface LicenciaFila {
  id: string;
  empresa_id: string;
  empresa_nombre: string;
  empresa_estado?: EmpresaEstado;
  propietario?: string;
  email?: string | null;
  telefono?: string | null;
  plan_codigo: string;
  plan_nombre?: string;
  plan_features?: string[];
  max_dispositivos?: number | null;
  estado: LicenciaEstado;
  activada_en: string | null;
  vence_en: string;
  grace_dias: number;
  features?: string[];
  codigo_expira_en: string | null;
  codigo_usado_en: string | null;
  dispositivos: number;
  created_at?: string;
  updated_at?: string;
}

interface EventoFila {
  id: string;
  tipo: string;
  payload: Record<string, unknown>;
  created_at: string;
  empresa_id?: string;
  empresa_nombre?: string;
}

interface PlanFila {
  id: string;
  codigo: string;
  nombre: string;
  max_dispositivos: number | null;
  features: string[];
  precio_mensual: string | number;
  activo: boolean;
}

export function mapaPlan(fila: PlanFila): Plan {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    maxDispositivos: fila.max_dispositivos,
    features: fila.features ?? [],
    precioMensual: Number(fila.precio_mensual),
    activo: fila.activo,
  };
}

export function mapaEmpresa(fila: EmpresaFila): Empresa {
  return {
    id: fila.id,
    nombre: fila.nombre,
    propietario: fila.propietario,
    email: fila.email,
    telefono: fila.telefono,
    estado: fila.estado,
    planId: fila.plan_id,
    createdAt: fila.created_at,
    updatedAt: fila.updated_at,
    licenciaId: fila.licencia_id,
    licenciaEstado: fila.licencia_estado,
    venceEn: fila.vence_en,
    graceDias: fila.grace_dias,
    planCodigo: fila.plan_codigo,
    dispositivos: fila.dispositivos,
  };
}

export function mapaDispositivo(fila: DispositivoFila): Dispositivo {
  return {
    id: fila.id,
    nombre: fila.nombre,
    plataforma: fila.plataforma,
    appVersion: fila.app_version,
    estado: fila.estado,
    lastSeenAt: fila.last_seen_at,
    lastSyncAt: fila.last_sync_at,
    createdAt: fila.created_at,
  };
}

export function mapaLicencia(fila: LicenciaFila): Licencia {
  return {
    id: fila.id,
    empresaId: fila.empresa_id,
    empresaNombre: fila.empresa_nombre,
    empresaEstado: fila.empresa_estado,
    propietario: fila.propietario,
    email: fila.email,
    telefono: fila.telefono,
    planCodigo: fila.plan_codigo,
    planNombre: fila.plan_nombre,
    planFeatures: fila.plan_features,
    maxDispositivos: fila.max_dispositivos,
    estado: fila.estado,
    activadaEn: fila.activada_en,
    venceEn: fila.vence_en,
    graceDias: fila.grace_dias,
    features: fila.features,
    codigoExpiraEn: fila.codigo_expira_en,
    codigoUsadoEn: fila.codigo_usado_en,
    dispositivos: fila.dispositivos,
    createdAt: fila.created_at,
    updatedAt: fila.updated_at,
  };
}

export function mapaEvento(fila: EventoFila): Evento {
  return {
    id: fila.id,
    tipo: fila.tipo,
    payload: fila.payload ?? {},
    createdAt: fila.created_at,
    empresaId: fila.empresa_id,
    empresaNombre: fila.empresa_nombre,
  };
}

export function mapaEmpresaDetalle(respuesta: {
  empresa: EmpresaFila & {
    plan_features: string[] | null;
    licencia_features: string[] | null;
  };
  dispositivos: DispositivoFila[];
  dispositivosTotal: number;
  dispositivosPagina: number;
  conteos: { usuarios: number; productos: number; ventas: number };
}): EmpresaDetalle {
  return {
    ...mapaEmpresa(respuesta.empresa),
    planFeatures: respuesta.empresa.plan_features ?? [],
    licenciaFeatures: respuesta.empresa.licencia_features ?? [],
    dispositivosLista: respuesta.dispositivos.map(mapaDispositivo),
    dispositivosTotal: respuesta.dispositivosTotal,
    dispositivosPagina: respuesta.dispositivosPagina,
    conteos: respuesta.conteos,
  };
}

export function mapaResumen(respuesta: {
  conteos: {
    empresas_total: number;
    empresas_activas: number;
    empresas_pendientes: number;
    empresas_suspendidas: number;
    empresas_canceladas: number;
    licencias_total: number;
    licencias_activas: number;
    licencias_vencidas: number;
    licencias_suspendidas: number;
    licencias_pendientes: number;
    licencias_en_gracia: number;
    licencias_por_vencer: number;
    dispositivos_activos: number;
    dispositivos_24h: number;
  };
  atencion: Array<{
    id: string;
    empresa_id: string;
    empresa_nombre: string;
    estado: LicenciaEstado;
    plan_codigo: string;
    vence_en: string;
    grace_dias: number;
    fin_gracia: string;
  }>;
  eventos: EventoFila[];
}): Resumen {
  const c = respuesta.conteos;
  return {
    conteos: {
      empresasTotal: c.empresas_total,
      empresasActivas: c.empresas_activas,
      empresasPendientes: c.empresas_pendientes,
      empresasSuspendidas: c.empresas_suspendidas,
      empresasCanceladas: c.empresas_canceladas,
      licenciasTotal: c.licencias_total,
      licenciasActivas: c.licencias_activas,
      licenciasVencidas: c.licencias_vencidas,
      licenciasSuspendidas: c.licencias_suspendidas,
      licenciasPendientes: c.licencias_pendientes,
      licenciasEnGracia: c.licencias_en_gracia,
      licenciasPorVencer: c.licencias_por_vencer,
      dispositivosActivos: c.dispositivos_activos,
      dispositivos24h: c.dispositivos_24h,
    },
    atencion: respuesta.atencion.map((fila) => ({
      id: fila.id,
      empresaId: fila.empresa_id,
      empresaNombre: fila.empresa_nombre,
      estado: fila.estado,
      planCodigo: fila.plan_codigo,
      venceEn: fila.vence_en,
      graceDias: fila.grace_dias,
      finGracia: fila.fin_gracia,
    })),
    eventos: respuesta.eventos.map(mapaEvento),
  };
}

export type {
  DispositivoFila,
  EmpresaFila,
  EventoFila,
  LicenciaFila,
  PlanFila,
};
