import type { SQLiteDatabase } from 'expo-sqlite';
import { crearPinHash, esPinHasheado, verificarPin } from '../../utils/pin';

export const MAX_INTENTOS_PIN = 5;
export const BLOQUEO_PIN_MS = 5 * 60 * 1000;

interface FilaAcceso {
  id: number;
  pin: string;
  activo: number;
  intentos_fallidos: number;
  bloqueado_hasta: string | null;
}

export type ResultadoAcceso =
  | { ok: true }
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
