import type { SQLiteDatabase } from 'expo-sqlite';
import { ahoraIso, nuevoUuid, obtenerContextoLocal } from '../contexto';
import { encolarOperacion } from '../outbox';

export type TipoMovimientoLocal =
  | 'inicial'
  | 'venta'
  | 'anulacion'
  | 'entrada'
  | 'salida'
  | 'ajuste';

export interface MovimientoLocalInput {
  productoId: number;
  productoUuid: string;
  tipo: TipoMovimientoLocal;
  cantidad: number;
  referenciaTipo?: string | null;
  referenciaId?: string | null;
  usuarioId?: number | null;
  turnoId?: number | null;
  sincronizar?: boolean;
  movimientoId?: string;
}

export async function registrarMovimientoLocal(
  db: SQLiteDatabase,
  input: MovimientoLocalInput
): Promise<string> {
  const contexto = await obtenerContextoLocal(db);
  const movimientoId = input.movimientoId ?? nuevoUuid();

  await db.runAsync(
    `INSERT INTO movimientos_inventario
       (id, empresa_id, device_id, producto_id, producto_uuid, tipo, cantidad,
        referencia_tipo, referencia_id, usuario_id, turno_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    movimientoId,
    contexto.empresaId,
    contexto.deviceId,
    input.productoId,
    input.productoUuid,
    input.tipo,
    input.cantidad,
    input.referenciaTipo ?? null,
    input.referenciaId ?? null,
     input.usuarioId ?? null,
     input.turnoId ?? null,
     ahoraIso()
  );

  if (input.sincronizar !== false) {
    await encolarOperacion(db, {
      tipo: 'movimiento_inventario',
      entidad: 'movimientos_inventario',
      entidadUuid: movimientoId,
      prioridad: 2,
      payload: {
        movimientoId,
        productoId: input.productoUuid,
        tipo: input.tipo,
        cantidad: input.cantidad,
        referenciaTipo: input.referenciaTipo ?? undefined,
        referenciaId: input.referenciaId ?? undefined,
      },
    });
  }

  return movimientoId;
}
