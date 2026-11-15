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
  licencia: {
    estado: string;
    venceEn: string;
    graceDias: number;
    token: string | null;
  } | null;
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
  since?: string
): Promise<RespuestaPull> {
  const params = new URLSearchParams({ deviceId });
  if (since) params.set('since', since);
  return solicitar<RespuestaPull>(db, `/api/sync/pull?${params.toString()}`, {
    method: 'GET',
  });
}

export async function obtenerLicenciaRemota(db: SQLiteDatabase): Promise<RespuestaLicencia> {
  return solicitar<RespuestaLicencia>(db, '/api/device/licencia', { method: 'GET' });
}

export async function enviarHeartbeat(
  db: SQLiteDatabase
): Promise<{ ok: boolean; serverTime: string }> {
  return solicitar<{ ok: boolean; serverTime: string }>(db, '/api/device/heartbeat', {
    method: 'POST',
  });
}
