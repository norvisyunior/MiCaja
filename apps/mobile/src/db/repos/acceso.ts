import type { SQLiteDatabase } from 'expo-sqlite';
import type { Usuario } from '../../types';
import { crearPinHash, esPinIterado, esPinValido, verificarPin } from '../../utils/pin';
import {
  crearHashCodigoRecuperacion,
  generarCodigoRecuperacion,
  verificarCodigoRecuperacion,
} from '../../utils/recuperacion';
import { normalizarUsuario } from '../../utils/usuario';

export const MAX_INTENTOS_PIN = 5;
export const BLOQUEO_PIN_MS = 5 * 60 * 1000;

interface FilaAcceso {
  id: number;
  pin: string;
  activo: number;
  intentos_fallidos: number;
  bloqueado_hasta: string | null;
}

interface FilaAccesoCompleta extends FilaAcceso {
  nombre: string;
  usuario: string | null;
  rol: string;
  codigo_recuperacion: string | null;
}

export type ResultadoAcceso =
  | { ok: true }
  | { ok: false; motivo: 'inactivo' }
  | { ok: false; motivo: 'pin'; intentosRestantes: number }
  | { ok: false; motivo: 'bloqueado'; bloqueadoHasta: string };

export type ResultadoAccesoUsuario =
  | { ok: true; usuario: Usuario }
  | { ok: false; motivo: 'credenciales' }
  | { ok: false; motivo: 'inactivo' }
  | { ok: false; motivo: 'pin'; intentosRestantes: number }
  | { ok: false; motivo: 'bloqueado'; bloqueadoHasta: string };

export type ResultadoRecuperacion =
  | { ok: true; usuario: Usuario; codigoRecuperacion: string }
  | { ok: false; motivo: 'credenciales' }
  | { ok: false; motivo: 'inactivo' }
  | { ok: false; motivo: 'sin_recuperacion' }
  | { ok: false; motivo: 'nuevo_pin_invalido' }
  | { ok: false; motivo: 'codigo'; intentosRestantes: number }
  | { ok: false; motivo: 'bloqueado'; bloqueadoHasta: string };

export type ResultadoCambioPin =
  | ResultadoAcceso
  | { ok: false; motivo: 'nuevo_pin_invalido' };

export type ResultadoCodigoPropio =
  | { ok: true; codigo: string }
  | Exclude<ResultadoAcceso, { ok: true }>;

function milisegundosRestantes(hasta: string | null): number {
  if (!hasta) return 0;
  const tiempo = Date.parse(hasta);
  if (!Number.isFinite(tiempo)) return 0;
  return Math.max(0, tiempo - Date.now());
}

function construirUsuario(fila: FilaAccesoCompleta): Usuario {
  return {
    id: fila.id,
    nombre: fila.nombre,
    usuario: fila.usuario ?? '',
    rol: fila.rol === 'admin' ? 'admin' : 'dependiente',
    activo: true,
  };
}

type RevisionBloqueo =
  | { bloqueado: true; bloqueadoHasta: string }
  | { bloqueado: false; intentosPrevios: number };

async function revisarBloqueo(
  db: SQLiteDatabase,
  usuarioId: number,
  intentosFallidos: number,
  bloqueadoHasta: string | null
): Promise<RevisionBloqueo> {
  const restante = milisegundosRestantes(bloqueadoHasta);
  if (restante > 0 && bloqueadoHasta) {
    return { bloqueado: true, bloqueadoHasta };
  }

  // Si el bloqueo ya expiró, se empieza de nuevo el conteo de intentos.
  if (bloqueadoHasta && restante <= 0) {
    await db.runAsync(
      `UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?`,
      usuarioId
    );
    return { bloqueado: false, intentosPrevios: 0 };
  }

  return { bloqueado: false, intentosPrevios: intentosFallidos };
}

type ResultadoFalloPin =
  | { ok: false; motivo: 'pin'; intentosRestantes: number }
  | { ok: false; motivo: 'bloqueado'; bloqueadoHasta: string };

type ResultadoFalloCodigo =
  | { ok: false; motivo: 'codigo'; intentosRestantes: number }
  | { ok: false; motivo: 'bloqueado'; bloqueadoHasta: string };

async function registrarFallo(
  db: SQLiteDatabase,
  usuarioId: number,
  intentosPrevios: number,
  motivo: 'pin'
): Promise<ResultadoFalloPin>;
async function registrarFallo(
  db: SQLiteDatabase,
  usuarioId: number,
  intentosPrevios: number,
  motivo: 'codigo'
): Promise<ResultadoFalloCodigo>;
async function registrarFallo(
  db: SQLiteDatabase,
  usuarioId: number,
  intentosPrevios: number,
  motivo: 'pin' | 'codigo'
): Promise<ResultadoFalloPin | ResultadoFalloCodigo> {
  const intentos = intentosPrevios + 1;
  if (intentos >= MAX_INTENTOS_PIN) {
    const bloqueadoHasta = new Date(Date.now() + BLOQUEO_PIN_MS).toISOString();
    await db.runAsync(
      `UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?`,
      intentos,
      bloqueadoHasta,
      usuarioId
    );
    return { ok: false, motivo: 'bloqueado', bloqueadoHasta };
  }

  await db.runAsync(
    `UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = NULL WHERE id = ?`,
    intentos,
    usuarioId
  );
  if (motivo === 'codigo') {
    return { ok: false, motivo, intentosRestantes: MAX_INTENTOS_PIN - intentos };
  }
  return { ok: false, motivo, intentosRestantes: MAX_INTENTOS_PIN - intentos };
}

export async function verificarAcceso(
  db: SQLiteDatabase,
  usuarioId: number,
  pin: string
): Promise<ResultadoAcceso> {
  const fila = await db.getFirstAsync<FilaAcceso>(
    `SELECT id, pin, activo, intentos_fallidos, bloqueado_hasta
     FROM usuarios WHERE id = ? AND deleted_at IS NULL`,
    usuarioId
  );

  if (!fila) {
    return { ok: false, motivo: 'pin', intentosRestantes: 0 };
  }
  if (fila.activo !== 1) {
    return { ok: false, motivo: 'inactivo' };
  }

  const revision = await revisarBloqueo(
    db,
    fila.id,
    fila.intentos_fallidos,
    fila.bloqueado_hasta
  );
  if (revision.bloqueado) {
    return { ok: false, motivo: 'bloqueado', bloqueadoHasta: revision.bloqueadoHasta };
  }

  const coincide = await verificarPin(pin, fila.pin);

  if (coincide) {
    // Migración transparente: texto plano o hash simple suben al formato iterado.
    const pinFinal = esPinIterado(fila.pin) ? fila.pin : await crearPinHash(pin);
    await db.runAsync(
      `UPDATE usuarios
       SET pin = ?, intentos_fallidos = 0, bloqueado_hasta = NULL
       WHERE id = ?`,
      pinFinal,
      fila.id
    );
    return { ok: true };
  }

  return registrarFallo(db, fila.id, revision.intentosPrevios, 'pin');
}

/**
 * Inicia sesión con nombre de usuario y PIN de 4 dígitos.
 * Mantiene el mismo bloqueo progresivo que el acceso anterior por ID.
 */
export async function verificarAccesoPorUsuario(
  db: SQLiteDatabase,
  nombreUsuario: string,
  pin: string
): Promise<ResultadoAccesoUsuario> {
  const fila = await db.getFirstAsync<FilaAccesoCompleta>(
    `SELECT id, nombre, usuario, rol, pin, codigo_recuperacion,
            activo, intentos_fallidos, bloqueado_hasta
     FROM usuarios
     WHERE usuario = ? COLLATE NOCASE AND deleted_at IS NULL`,
    normalizarUsuario(nombreUsuario)
  );

  if (!fila) {
    return { ok: false, motivo: 'credenciales' };
  }
  if (fila.activo !== 1) {
    return { ok: false, motivo: 'inactivo' };
  }

  const revision = await revisarBloqueo(
    db,
    fila.id,
    fila.intentos_fallidos,
    fila.bloqueado_hasta
  );
  if (revision.bloqueado) {
    return { ok: false, motivo: 'bloqueado', bloqueadoHasta: revision.bloqueadoHasta };
  }

  const coincide = await verificarPin(pin, fila.pin);

  if (coincide) {
    // Migración transparente: texto plano o hash simple suben al formato iterado.
    const pinFinal = esPinIterado(fila.pin) ? fila.pin : await crearPinHash(pin);
    await db.runAsync(
      `UPDATE usuarios
       SET pin = ?, intentos_fallidos = 0, bloqueado_hasta = NULL
       WHERE id = ?`,
      pinFinal,
      fila.id
    );
    return { ok: true, usuario: construirUsuario(fila) };
  }

  return registrarFallo(db, fila.id, revision.intentosPrevios, 'pin');
}

/**
 * Restablece el PIN usando el código de recuperación. El código es de un solo
 * uso: al validarlo se genera uno nuevo y se devuelve en claro para mostrarlo
 * una única vez.
 */
export async function recuperarAccesoPorUsuario(
  db: SQLiteDatabase,
  nombreUsuario: string,
  codigo: string,
  nuevoPin: string
): Promise<ResultadoRecuperacion> {
  if (!esPinValido(nuevoPin)) {
    return { ok: false, motivo: 'nuevo_pin_invalido' };
  }

  const fila = await db.getFirstAsync<FilaAccesoCompleta>(
    `SELECT id, nombre, usuario, rol, pin, codigo_recuperacion,
            activo, intentos_fallidos, bloqueado_hasta
     FROM usuarios
     WHERE usuario = ? COLLATE NOCASE AND deleted_at IS NULL`,
    normalizarUsuario(nombreUsuario)
  );

  if (!fila) {
    return { ok: false, motivo: 'credenciales' };
  }
  if (fila.activo !== 1) {
    return { ok: false, motivo: 'inactivo' };
  }

  const revision = await revisarBloqueo(
    db,
    fila.id,
    fila.intentos_fallidos,
    fila.bloqueado_hasta
  );
  if (revision.bloqueado) {
    return { ok: false, motivo: 'bloqueado', bloqueadoHasta: revision.bloqueadoHasta };
  }

  if (!fila.codigo_recuperacion) {
    return { ok: false, motivo: 'sin_recuperacion' };
  }

  const coincide = await verificarCodigoRecuperacion(codigo, fila.codigo_recuperacion);
  if (!coincide) {
    return registrarFallo(db, fila.id, revision.intentosPrevios, 'codigo');
  }

  const pinHash = await crearPinHash(nuevoPin);
  const nuevoCodigo = generarCodigoRecuperacion();
  const codigoHash = await crearHashCodigoRecuperacion(nuevoCodigo);

  await db.runAsync(
    `UPDATE usuarios
     SET pin = ?, codigo_recuperacion = ?,
         intentos_fallidos = 0, bloqueado_hasta = NULL
     WHERE id = ?`,
    pinHash,
    codigoHash,
    fila.id
  );

  return {
    ok: true,
    usuario: construirUsuario(fila),
    codigoRecuperacion: nuevoCodigo,
  };
}

/** Cambio de PIN del usuario que ya tiene la sesión abierta. */
export async function cambiarPinPropio(
  db: SQLiteDatabase,
  usuarioId: number,
  pinActual: string,
  pinNuevo: string
): Promise<ResultadoCambioPin> {
  if (!esPinValido(pinNuevo)) {
    return { ok: false, motivo: 'nuevo_pin_invalido' };
  }

  const resultado = await verificarAcceso(db, usuarioId, pinActual);
  if (!resultado.ok) return resultado;

  const pinHash = await crearPinHash(pinNuevo);
  await db.runAsync(
    `UPDATE usuarios
     SET pin = ?, intentos_fallidos = 0, bloqueado_hasta = NULL
     WHERE id = ?`,
    pinHash,
    usuarioId
  );
  return { ok: true };
}

/** Genera un código nuevo desde la administración y lo devuelve en claro. */
export async function establecerCodigoRecuperacion(
  db: SQLiteDatabase,
  usuarioId: number
): Promise<string | null> {
  const fila = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM usuarios WHERE id = ? AND deleted_at IS NULL`,
    usuarioId
  );
  if (!fila) return null;

  const codigo = generarCodigoRecuperacion();
  const hash = await crearHashCodigoRecuperacion(codigo);
  await db.runAsync(
    `UPDATE usuarios SET codigo_recuperacion = ? WHERE id = ?`,
    hash,
    usuarioId
  );
  return codigo;
}

/**
 * Genera el código propio desde Ajustes. Exige el PIN actual para que una
 * sesión abierta sin conocer el PIN no pueda apropiarse de la cuenta.
 */
export async function generarCodigoRecuperacionPropio(
  db: SQLiteDatabase,
  usuarioId: number,
  pinActual: string
): Promise<ResultadoCodigoPropio> {
  const resultado = await verificarAcceso(db, usuarioId, pinActual);
  if (!resultado.ok) return resultado;

  const codigo = await establecerCodigoRecuperacion(db, usuarioId);
  if (!codigo) {
    return { ok: false, motivo: 'inactivo' };
  }
  return { ok: true, codigo };
}

/** Desbloquea manualmente un usuario (por ejemplo, desde la administración). */
export async function desbloquearUsuario(db: SQLiteDatabase, usuarioId: number): Promise<void> {
  await db.runAsync(
    `UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?`,
    usuarioId
  );
}
