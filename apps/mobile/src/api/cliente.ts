import type { SQLiteDatabase } from 'expo-sqlite';
import { leerTokenDispositivo, leerUrlServidor } from './config';

export class ErrorApi extends Error {
  constructor(
    public readonly codigo: string,
    mensaje: string,
    public readonly estado: number,
    public readonly detalles?: unknown
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

export async function verificarServidor(db: SQLiteDatabase): Promise<boolean> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 5_000);

  try {
    const base = await leerUrlServidor(db);
    const respuesta = await fetch(`${base}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controlador.signal,
    });
    return respuesta.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(temporizador);
  }
}

export interface RespuestaRegistro {
  empresa: { id: string; nombre: string };
  licencia: {
    id: string;
    estado: string;
    vence_en: string;
    grace_dias: number;
  };
  codigoActivacion: string;
  codigoExpiraEn: string;
}

export interface RespuestaActivacion {
  token: string;
  licencia: string;
  empresa: { id: string; nombre: string };
  dispositivo: { id: string; nombre: string; plataforma: string };
  venceEn: string;
  features: string[];
  via?: 'codigo' | 'invitacion' | 'login';
  rol?: string;
}

export interface UsuarioRemotoLogin {
  id: string;
  nombre: string;
  usuario: string;
  rol: 'propietario' | 'admin' | 'dependiente';
  activo: boolean;
  version: number;
}

/**
 * El login entrega sesión y licencia solo si el NEGOCIO ya está activado.
 * Un negocio pendiente puede entrar a la caja, pero `licencia`/`token`
 * vienen vacíos y la app debe mostrarlo sin licencia hasta su activación.
 */
export interface RespuestaLoginUsuario
  extends Omit<RespuestaActivacion, 'token' | 'licencia'> {
  token?: string;
  licencia?: string;
  estadoLicencia?: string;
  via: 'login';
  rol: 'propietario' | 'admin' | 'dependiente';
  usuario: UsuarioRemotoLogin;
}

export interface OperacionSync {
  operationId: string;
  tipo: string;
  timestamp: number;
  payload: unknown;
}

export interface ResultadoSync {
  operationId: string;
  estado: 'aplicada' | 'rechazada' | 'conflicto';
  error?: string;
  resultado?: unknown;
}

export interface RespuestaPush {
  results: ResultadoSync[];
  serverTime: string;
}

export interface CambioSync {
  tipo: string;
  id: string;
  version?: number;
  updatedAt: string;
  data: Record<string, unknown>;
}

export interface RespuestaPull {
  cambios: CambioSync[];
  /** El servidor tiene más cambios pendientes de entregar. */
  hayMas?: boolean;
  /**
   * Cursor opaco para reanudar el pull. Guarda, por tabla, el `updated_at`
   * exacto y el último id entregado; el cliente solo debe devolverlo tal cual.
   */
  cursor?: string | null;
  licencia: {
    estado: string;
    venceEn: string;
    graceDias: number;
    token: string | null;
  } | null;
  /** true cuando el servidor entregó datos sin token de licencia. */
  soloLectura?: boolean;
  serverTime: string;
}

export interface RespuestaLicencia {
  estado: string;
  venceEn: string;
  graceDias: number;
  features: string[];
  token: string | null;
  emitidaEn: string | null;
  dispositivoEstado: string;
}

export interface RentabilidadCategoria {
  categoria: string;
  total: number;
  cantidad: number;
}

export interface RentabilidadProducto {
  productoId: string | null;
  nombre: string;
  cantidad: number;
  ventas: number;
  costo: number;
  ganancia: number;
  margenPct: number | null;
  sinCosto: boolean;
}

export interface ReporteRentabilidad {
  desde: string;
  hasta: string;
  ventas: {
    cantidad: number;
    total: number;
    subtotal: number;
    ticketPromedio: number;
  };
  costoVentas: number;
  gananciaBruta: number;
  gastos: {
    total: number;
    porCategoria: RentabilidadCategoria[];
  };
  gananciaNeta: number;
  margenPct: number | null;
  lineasSinCosto: number;
  ventasSinCosto: number;
  ranking: RentabilidadProducto[];
}

interface ErrorServidor {
  error?: string;
  message?: string;
  details?: unknown;
}

async function solicitar<T>(
  db: SQLiteDatabase,
  ruta: string,
  init: RequestInit,
  conToken = true
): Promise<T> {
  const base = await leerUrlServidor(db);
  const token = conToken ? await leerTokenDispositivo(db) : null;
  if (conToken && !token) {
    throw new ErrorApi('SIN_ACTIVACION', 'Este dispositivo aún no está activado.', 401);
  }

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 15_000);

  try {
    const respuesta = await fetch(`${base}${ruta}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
      signal: controlador.signal,
    });

    const texto = await respuesta.text();
    let cuerpo: unknown = null;
    if (texto) {
      try {
        cuerpo = JSON.parse(texto);
      } catch {
        cuerpo = null;
      }
    }

    if (!respuesta.ok) {
      const error = (cuerpo ?? {}) as ErrorServidor;
      throw new ErrorApi(
        error.error ?? `HTTP_${respuesta.status}`,
        error.message ?? 'El servidor rechazó la solicitud.',
        respuesta.status,
        error.details
      );
    }

    return (cuerpo ?? {}) as T;
  } catch (error) {
    if (error instanceof ErrorApi) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ErrorApi('TIEMPO_AGOTADO', 'El servidor tardó demasiado en responder.', 0);
    }
    throw new ErrorApi(
      'SIN_CONEXION',
      'No se pudo conectar con el servidor. Revisa la dirección y tu conexión.',
      0
    );
  } finally {
    clearTimeout(temporizador);
  }
}

export async function registrarCuenta(
  db: SQLiteDatabase,
  input: {
    nombre: string;
    propietario: string;
    email?: string;
    telefono?: string;
  }
): Promise<RespuestaRegistro> {
  return solicitar<RespuestaRegistro>(
    db,
    '/api/registro',
    {
      method: 'POST',
      body: JSON.stringify({ ...input, planCodigo: 'basico' }),
    },
    false
  );
}

export async function activarDispositivo(
  db: SQLiteDatabase,
  input: {
    codigo: string;
    fingerprint: string;
    nombre: string;
    plataforma: string;
    appVersion: string;
    reemplazarA?: string;
  }
): Promise<RespuestaActivacion> {
  return solicitar<RespuestaActivacion>(
    db,
    '/api/activar',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    false
  );
}

export async function loginUsuarioGlobal(
  db: SQLiteDatabase,
  input: {
    usuario: string;
    pin: string;
    fingerprint: string;
    nombre: string;
    plataforma: string;
    appVersion: string;
    reemplazarA?: string;
    cambiarEmpresa?: boolean;
  }
): Promise<RespuestaLoginUsuario> {
  return solicitar<RespuestaLoginUsuario>(
    db,
    '/api/auth/usuario',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    false
  );
}

export interface InfoDispositivo {
  id: string;
  nombre: string;
  plataforma: string;
  estado: string;
  esEste: boolean;
  emitidaEn: string | null;
  lastSeenAt: string | null;
}

export interface RespuestaDispositivos {
  dispositivos: InfoDispositivo[];
}

export interface RespuestaDesvincular {
  dispositivo: InfoDispositivo;
}

export interface RespuestaInvitacion {
  id: string;
  rol: string;
  codigo: string;
  expiraEn: string;
}

export async function listarDispositivosRemotos(
  db: SQLiteDatabase
): Promise<RespuestaDispositivos> {
  return solicitar<RespuestaDispositivos>(db, '/api/device/dispositivos', {
    method: 'GET',
  });
}

export async function desvincularDispositivo(
  db: SQLiteDatabase,
  input: { dispositivoId?: string; codigo?: string }
): Promise<RespuestaDesvincular> {
  return solicitar<RespuestaDesvincular>(db, '/api/device/desvincular', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function crearInvitacion(
  db: SQLiteDatabase,
  input: { rol?: string; expiraHoras?: number }
): Promise<RespuestaInvitacion> {
  return solicitar<RespuestaInvitacion>(db, '/api/device/invitaciones', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function pushOperaciones(
  db: SQLiteDatabase,
  deviceId: string,
  operaciones: OperacionSync[]
): Promise<RespuestaPush> {
  return solicitar<RespuestaPush>(db, '/api/sync/push', {
    method: 'POST',
    body: JSON.stringify({ deviceId, operations: operaciones }),
  });
}

export async function pullCambios(
  db: SQLiteDatabase,
  deviceId: string,
  cursor?: string | null
): Promise<RespuestaPull> {
  const params = new URLSearchParams({ deviceId, limit: '500' });
  if (cursor) params.set('cursor', cursor);
  return solicitar<RespuestaPull>(db, `/api/sync/pull?${params.toString()}`, {
    method: 'GET',
  });
}

/** Pull de solo lectura: disponible solo mientras la licencia está vencida. */
export async function pullConsulta(
  db: SQLiteDatabase,
  deviceId: string,
  cursor?: string | null
): Promise<RespuestaPull> {
  const params = new URLSearchParams({ deviceId, limit: '500' });
  if (cursor) params.set('cursor', cursor);
  return solicitar<RespuestaPull>(db, `/api/sync/pull-consulta?${params.toString()}`, {
    method: 'GET',
  });
}

export async function obtenerLicenciaRemota(db: SQLiteDatabase): Promise<RespuestaLicencia> {
  return solicitar<RespuestaLicencia>(db, '/api/device/licencia', { method: 'GET' });
}

export async function obtenerRentabilidad(
  db: SQLiteDatabase,
  desde: string,
  hasta: string
): Promise<ReporteRentabilidad> {
  const params = new URLSearchParams({ desde, hasta });
  return solicitar<ReporteRentabilidad>(
    db,
    `/api/reportes/rentabilidad?${params.toString()}`,
    { method: 'GET' }
  );
}

export async function enviarHeartbeat(
  db: SQLiteDatabase
): Promise<{ ok: boolean; serverTime: string }> {
  return solicitar<{ ok: boolean; serverTime: string }>(db, '/api/device/heartbeat', {
    method: 'POST',
  });
}
