import type { SQLiteDatabase } from 'expo-sqlite';
import type { Usuario } from '../../types';
import { crearPinHash, esPinHasheado, verificarPin } from '../../utils/pin';
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

function milisegundosRestantes(hasta: string | null): number {
  if (!hasta) return 0;
  const tiempo = Date.parse(hasta);
  if (!Number.isFinite(tiempo)) return 0;
  return Math.max(0, tiempo - Date.now());
}

export async function verificarAcceso(
  db: SQLiteDatabase,
  usuarioId: number,
  pin: string
): Promise<ResultadoAcceso> {
  const fila = await db.getFirstAsync<FilaAcceso>(
    `SELECT id, pin, activo, intentos_fallidos, bloqueado_hasta
     FROM usuarios WHERE id = ?`,
    usuarioId
  );

  if (!fila) {
    return { ok: false, motivo: 'pin', intentosRestantes: 0 };
  }
  if (fila.activo !== 1) {
    return { ok: false, motivo: 'inactivo' };
  }

  const restante = milisegundosRestantes(fila.bloqueado_hasta);
  if (restante > 0 && fila.bloqueado_hasta) {
    return { ok: false, motivo: 'bloqueado', bloqueadoHasta: fila.bloqueado_hasta };
  }

  // Si el bloqueo ya expiró, se empieza de nuevo el conteo de intentos.
  let intentosPrevios = fila.intentos_fallidos;
  if (fila.bloqueado_hasta && restante <= 0) {
    intentosPrevios = 0;
    await db.runAsync(
      `UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?`,
      usuarioId
    );
  }

  const coincide = await verificarPin(pin, fila.pin);

  if (coincide) {
    // Migración transparente de PIN antiguos en texto plano.
    const pinFinal = esPinHasheado(fila.pin) ? fila.pin : await crearPinHash(pin);
    await db.runAsync(
      `UPDATE usuarios
       SET pin = ?, intentos_fallidos = 0, bloqueado_hasta = NULL
       WHERE id = ?`,
      pinFinal,
      usuarioId
    );
    return { ok: true };
  }

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
  return { ok: false, motivo: 'pin', intentosRestantes: MAX_INTENTOS_PIN - intentos };
}

/** Desbloquea manualmente un usuario (por ejemplo, desde la administración). */
export async function desbloquearUsuario(db: SQLiteDatabase, usuarioId: number): Promise<void> {
  await db.runAsync(
    `UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?`,
    usuarioId
  );
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
    `SELECT id, nombre, usuario, rol, pin, activo, intentos_fallidos, bloqueado_hasta
     FROM usuarios WHERE usuario = ? COLLATE NOCASE`,
    normalizarUsuario(nombreUsuario)
  );

  if (!fila) {
    return { ok: false, motivo: 'credenciales' };
  }
  if (fila.activo !== 1) {
    return { ok: false, motivo: 'inactivo' };
  }

  const restante = milisegundosRestantes(fila.bloqueado_hasta);
  if (restante > 0 && fila.bloqueado_hasta) {
    return { ok: false, motivo: 'bloqueado', bloqueadoHasta: fila.bloqueado_hasta };
  }

  let intentosPrevios = fila.intentos_fallidos;
  if (fila.bloqueado_hasta && restante <= 0) {
    intentosPrevios = 0;
    await db.runAsync(
      `UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?`,
      fila.id
    );
  }

  const coincide = await verificarPin(pin, fila.pin);

  if (coincide) {
    const pinFinal = esPinHasheado(fila.pin) ? fila.pin : await crearPinHash(pin);
    await db.runAsync(
      `UPDATE usuarios
       SET pin = ?, intentos_fallidos = 0, bloqueado_hasta = NULL
       WHERE id = ?`,
      pinFinal,
      fila.id
    );
    return {
      ok: true,
      usuario: {
        id: fila.id,
        nombre: fila.nombre,
        usuario: fila.usuario ?? '',
        rol: fila.rol === 'admin' ? 'admin' : 'dependiente',
        activo: true,
      },
    };
  }

  const intentos = intentosPrevios + 1;
  if (intentos >= MAX_INTENTOS_PIN) {
    const bloqueadoHasta = new Date(Date.now() + BLOQUEO_PIN_MS).toISOString();
    await db.runAsync(
      `UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?`,
      intentos,
      bloqueadoHasta,
      fila.id
    );
    return { ok: false, motivo: 'bloqueado', bloqueadoHasta };
  }

  await db.runAsync(
    `UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = NULL WHERE id = ?`,
    intentos,
    fila.id
  );
  return { ok: false, motivo: 'pin', intentosRestantes: MAX_INTENTOS_PIN - intentos };
}
