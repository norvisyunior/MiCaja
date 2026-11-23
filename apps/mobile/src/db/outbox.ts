import type { SQLiteDatabase } from 'expo-sqlite';
import { ahoraIso, nuevoUuid, obtenerContextoLocal } from './contexto';

export type SyncOperationType =
  | 'venta'
  | 'anulacion'
  | 'turno_apertura'
  | 'turno_cierre'
  | 'movimiento_inventario'
  | 'producto_upsert'
  | 'categoria_upsert'
  | 'usuario_upsert'
  | 'settings_upsert'
  | 'gasto_upsert'
  | 'movimiento_caja_upsert'
  | 'conteo_inventario_upsert';

export type PrioridadOutbox = 1 | 2 | 3;

export interface EncolarOperacionInput {
  tipo: SyncOperationType;
  entidad: string;
  entidadUuid?: string | null;
  payload: unknown;
  prioridad?: PrioridadOutbox;
  operationId?: string;
}

export interface OutboxPendiente {
  id: string;
  empresa_id: string;
  device_id: string;
  operation_id: string;
  tipo: SyncOperationType;
  entidad: string;
  entidad_uuid: string | null;
  payload: string;
  intentos: number;
  prioridad: PrioridadOutbox;
  created_at: string;
}

export async function encolarOperacion(
  db: SQLiteDatabase,
  input: EncolarOperacionInput
): Promise<string> {
  const contexto = await obtenerContextoLocal(db);
  const operationId = input.operationId ?? nuevoUuid();
  const id = nuevoUuid();

  await db.runAsync(
    `INSERT OR IGNORE INTO sync_outbox
       (id, empresa_id, device_id, operation_id, tipo, entidad, entidad_uuid,
        payload, estado, intentos, prioridad, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', 0, ?, ?)`,
    id,
    contexto.empresaId,
    contexto.deviceId,
    operationId,
    input.tipo,
    input.entidad,
    input.entidadUuid ?? null,
    JSON.stringify(input.payload),
    input.prioridad ?? 3,
    ahoraIso()
  );

  return operationId;
}

export async function listarOutboxPendientes(
  db: SQLiteDatabase,
  limite = 50
): Promise<OutboxPendiente[]> {
  return db.getAllAsync<OutboxPendiente>(
    `SELECT id, empresa_id, device_id, operation_id, tipo, entidad, entidad_uuid,
            payload, intentos, prioridad, created_at
     FROM sync_outbox
     WHERE estado = 'pendiente'
       AND (siguiente_intento IS NULL OR siguiente_intento <= ?)
     ORDER BY prioridad ASC, created_at ASC
     LIMIT ?`,
    ahoraIso(),
    limite
  );
}

export async function contarOutboxPendientes(db: SQLiteDatabase): Promise<number> {
  const fila = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM sync_outbox WHERE estado = 'pendiente'`
  );
  return fila?.total ?? 0;
}

export async function eliminarOutbox(db: SQLiteDatabase, operationId: string): Promise<void> {
  await db.runAsync(`DELETE FROM sync_outbox WHERE operation_id = ?`, operationId);
}

export async function marcarOutboxFallida(
  db: SQLiteDatabase,
  operationId: string,
  error: string
): Promise<void> {
  await db.runAsync(
    `UPDATE sync_outbox
     SET intentos = intentos + 1,
         ultimo_error = ?,
         siguiente_intento = ?,
         estado = CASE WHEN intentos + 1 >= 8 THEN 'fallida' ELSE 'pendiente' END
     WHERE operation_id = ?`,
    error,
    new Date(Date.now() + 60_000).toISOString(),
    operationId
  );
}

export async function marcarOutboxRechazada(
  db: SQLiteDatabase,
  operationId: string,
  error: string
): Promise<void> {
  await db.runAsync(
    `UPDATE sync_outbox
     SET intentos = intentos + 1,
         ultimo_error = ?,
         siguiente_intento = NULL,
         estado = 'fallida'
     WHERE operation_id = ?`,
    error,
    operationId
  );
}

export async function contarOutboxFallidas(db: SQLiteDatabase): Promise<number> {
  const fila = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM sync_outbox WHERE estado = 'fallida'`
  );
  return fila?.total ?? 0;
}

/**
 * Reencola las operaciones rechazadas por el servidor para reintentarlas.
 *
 * El servidor archiva el resultado de cada `operation_id` (aunque haya sido
 * rechazada), así que reenviar el mismo id devolvería el rechazo viejo sin
 * volver a intentar nada. Se genera un `operation_id` nuevo: los appliers
 * del servidor son idempotentes por entidad (turno por id, venta por
 * local_id, anulaciones por bandera), así que no hay riesgo de duplicar.
 * Devuelve cuántas operaciones se reencolaron.
 */
export async function reencolarRechazadas(db: SQLiteDatabase): Promise<number> {
  const filas = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM sync_outbox WHERE estado = 'fallida'`
  );

  for (const fila of filas) {
    await db.runAsync(
      `UPDATE sync_outbox
       SET operation_id = ?, estado = 'pendiente', intentos = 0,
           siguiente_intento = NULL, ultimo_error = NULL
       WHERE id = ?`,
      nuevoUuid(),
      fila.id
    );
  }

  return filas.length;
}
