import type { SQLiteDatabase } from 'expo-sqlite';
import type { CategoriaGasto, Gasto } from '../../types';
import { ahoraIso, nuevoUuid, obtenerContextoLocal } from '../contexto';
import {
  encolarGastoUpsert,
  encolarMovimientoCajaUpsert,
} from '../sync/encolar';
import { pedirSyncAhora } from '../../sync/disparador';

export interface GastoNuevo {
  categoria: CategoriaGasto;
  concepto: string;
  monto: number;
  fecha: string;
  formaPago?: string;
  turnoId?: number | null;
  usuarioId?: number | null;
}

export interface GastoEditable {
  categoria: CategoriaGasto;
  concepto: string;
  monto: number;
  fecha: string;
  formaPago?: string;
}

interface FilaGasto {
  id: number;
  uuid: string;
  categoria: string;
  concepto: string;
  monto: number;
  fecha: string;
  forma_pago: string;
  movimiento_caja_id: number | null;
  version: number;
  deleted_at: string | null;
}

const A_GASTO = (f: FilaGasto): Gasto => ({
  id: f.id,
  uuid: f.uuid,
  categoria: f.categoria as CategoriaGasto,
  concepto: f.concepto,
  monto: f.monto,
  fecha: f.fecha,
  formaPago: f.forma_pago ?? 'efectivo',
  movimientoCajaId: f.movimiento_caja_id,
  version: f.version,
  deletedAt: f.deleted_at,
});

const CAMPOS = `id, uuid, categoria, concepto, monto, fecha, forma_pago,
                movimiento_caja_id, version, deleted_at`;

async function crearMovimientoVinculado(
  db: SQLiteDatabase,
  gastoId: number,
  turnoId: number | null,
  usuarioId: number | null,
  monto: number,
  descripcion: string
): Promise<number> {
  const contexto = await obtenerContextoLocal(db);
  const ahora = ahoraIso();
  const res = await db.runAsync(
    `INSERT INTO movimientos_caja
       (uuid, empresa_id, turno_id, usuario_id, dispositivo_id, tipo, monto,
        descripcion, gasto_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'gasto', ?, ?, ?, ?, ?)`,
    nuevoUuid(),
    contexto.empresaId,
    turnoId,
    usuarioId,
    contexto.deviceId,
    monto,
    descripcion,
    gastoId,
    ahora,
    ahora
  );
  await encolarMovimientoCajaUpsert(db, res.lastInsertRowId);
  return res.lastInsertRowId;
}

async function sincronizarMovimientoVinculado(
  db: SQLiteDatabase,
  fila: FilaGasto,
  formaPago: string,
  monto: number,
  concepto: string
): Promise<number | null> {
  const contexto = await obtenerContextoLocal(db);
  const esEfectivo = formaPago === 'efectivo';
  if (!esEfectivo) {
    if (fila.movimiento_caja_id != null) {
      const ahora = ahoraIso();
      await db.runAsync(
        `UPDATE movimientos_caja
         SET deleted_at = ?, version = version + 1, updated_at = ?
         WHERE empresa_id = ? AND id = ? AND deleted_at IS NULL`,
        ahora,
        ahora,
        fila.movimiento_caja_id
      );
      await encolarMovimientoCajaUpsert(db, fila.movimiento_caja_id);
    }
    return null;
  }

  if (fila.movimiento_caja_id != null) {
    await db.runAsync(
       `UPDATE movimientos_caja
        SET monto = ?, descripcion = ?, version = version + 1, updated_at = ?
        WHERE empresa_id = ? AND id = ?`,
      monto,
      concepto,
      ahoraIso(),
      contexto.empresaId,
      fila.movimiento_caja_id
    );
    await encolarMovimientoCajaUpsert(db, fila.movimiento_caja_id);
    return fila.movimiento_caja_id;
  }

  const turno = await db.getFirstAsync<{ id: number; usuario_id: number }>(
    `SELECT id, usuario_id FROM turnos_caja
     WHERE empresa_id = ? AND estado = 'abierto' ORDER BY id DESC LIMIT 1`,
    contexto.empresaId
  );
  return crearMovimientoVinculado(
    db,
    fila.id,
    turno?.id ?? null,
    turno?.usuario_id ?? null,
    monto,
    concepto
  );
}

export async function listarGastos(
  db: SQLiteDatabase,
  desde: string,
  hasta: string
): Promise<Gasto[]> {
  const contexto = await obtenerContextoLocal(db);
  const filas = await db.getAllAsync<FilaGasto>(
    `SELECT ${CAMPOS} FROM gastos
     WHERE empresa_id = ? AND deleted_at IS NULL AND fecha >= ? AND fecha < ?
     ORDER BY fecha DESC, id DESC`,
    contexto.empresaId,
    desde,
    hasta
  );
  return filas.map(A_GASTO);
}

export async function crearGasto(
  db: SQLiteDatabase,
  gasto: GastoNuevo
): Promise<Gasto> {
  let creado: Gasto | null = null;
  const formaPago = gasto.formaPago ?? 'efectivo';

  await db.withTransactionAsync(async () => {
    const contexto = await obtenerContextoLocal(db);
    const ahora = ahoraIso();
    const res = await db.runAsync(
      `INSERT INTO gastos
         (uuid, empresa_id, categoria, concepto, monto, fecha, forma_pago,
          version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      nuevoUuid(),
      contexto.empresaId,
      gasto.categoria,
      gasto.concepto,
      gasto.monto,
      gasto.fecha,
      formaPago,
      ahora,
      ahora
    );
    const gastoId = res.lastInsertRowId;
    if (formaPago === 'efectivo') {
      const movimientoId = await crearMovimientoVinculado(
        db,
        gastoId,
        gasto.turnoId ?? null,
        gasto.usuarioId ?? null,
        gasto.monto,
        gasto.concepto
      );
      await db.runAsync(
        `UPDATE gastos SET movimiento_caja_id = ? WHERE id = ?`,
        movimientoId,
        gastoId
      );
    }
    await encolarGastoUpsert(db, gastoId);
    const fila = await db.getFirstAsync<FilaGasto>(
      `SELECT ${CAMPOS} FROM gastos WHERE empresa_id = ? AND id = ?`,
      contexto.empresaId,
      gastoId
    );
    creado = fila ? A_GASTO(fila) : null;
  });

  if (!creado) throw new Error('GASTO_NO_CREADO');
  pedirSyncAhora();
  return creado;
}

export async function actualizarGasto(
  db: SQLiteDatabase,
  id: number,
  gasto: GastoEditable
): Promise<Gasto | null> {
  let actualizado: Gasto | null = null;
  const formaPago = gasto.formaPago ?? 'efectivo';

  const contexto = await obtenerContextoLocal(db);
  await db.withTransactionAsync(async () => {
    const anterior = await db.getFirstAsync<FilaGasto>(
      `SELECT ${CAMPOS} FROM gastos WHERE empresa_id = ? AND id = ?`,
      contexto.empresaId,
      id
    );
    if (!anterior || anterior.deleted_at) return;

    await db.runAsync(
      `UPDATE gastos
       SET categoria = ?, concepto = ?, monto = ?, fecha = ?, forma_pago = ?,
           version = version + 1, updated_at = ?
       WHERE empresa_id = ? AND id = ? AND deleted_at IS NULL`,
      gasto.categoria,
      gasto.concepto,
      gasto.monto,
      gasto.fecha,
      formaPago,
      ahoraIso(),
      contexto.empresaId,
      id
    );

    const movimientoId = await sincronizarMovimientoVinculado(
      db,
      anterior,
      formaPago,
      gasto.monto,
      gasto.concepto
    );
    await db.runAsync(
      `UPDATE gastos SET movimiento_caja_id = ? WHERE empresa_id = ? AND id = ?`,
      movimientoId,
      contexto.empresaId,
      id
    );
    await encolarGastoUpsert(db, id);
    const fila = await db.getFirstAsync<FilaGasto>(
      `SELECT ${CAMPOS} FROM gastos WHERE empresa_id = ? AND id = ?`,
      contexto.empresaId,
      id
    );
    actualizado = fila ? A_GASTO(fila) : null;
  });

  if (actualizado) pedirSyncAhora();
  return actualizado;
}

export async function eliminarGasto(
  db: SQLiteDatabase,
  id: number
): Promise<void> {
  const contexto = await obtenerContextoLocal(db);
  await db.withTransactionAsync(async () => {
    const fila = await db.getFirstAsync<FilaGasto>(
      `SELECT ${CAMPOS} FROM gastos WHERE empresa_id = ? AND id = ?`,
      contexto.empresaId,
      id
    );
    const ahora = ahoraIso();
    await db.runAsync(
      `UPDATE gastos
       SET deleted_at = ?, version = version + 1, updated_at = ?
       WHERE empresa_id = ? AND id = ? AND deleted_at IS NULL`,
      ahora,
      ahora,
      contexto.empresaId,
      id
    );
    if (fila?.movimiento_caja_id != null) {
      await db.runAsync(
        `UPDATE movimientos_caja
         SET deleted_at = ?, version = version + 1, updated_at = ?
         WHERE empresa_id = ? AND id = ? AND deleted_at IS NULL`,
         ahora,
         ahora,
         contexto.empresaId,
         fila.movimiento_caja_id
       );
       await encolarMovimientoCajaUpsert(db, fila.movimiento_caja_id);
     }
     await encolarGastoUpsert(db, id);
  });
  pedirSyncAhora();
}
