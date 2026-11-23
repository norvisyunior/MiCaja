import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  ConteoInventario,
  FormaPago,
  MovimientoCaja,
  TipoMovimientoCaja,
} from '../../types';
import { ahoraIso, nuevoUuid, obtenerContextoLocal } from '../contexto';
import {
  encolarConteoInventarioUpsert,
  encolarMovimientoCajaUpsert,
} from '../sync/encolar';
import { pedirSyncAhora } from '../../sync/disparador';
import { registrarMovimientoLocal } from './inventario';

export interface ResumenPagoCierre {
  formaPago: string;
  total: number;
  efectivo: number;
  digital: number;
}

export interface ProductoTeoricoCierre {
  productoId: number;
  nombre: string;
  inicial: number;
  entradas: number;
  salidas: number;
  final: number;
}

export interface ResumenCierre {
  fondoInicial: number;
  ventasEfectivo: number;
  devolucionesEfectivo: number;
  entradas: number;
  gastosCaja: number;
  retiros: number;
  otrasSalidas: number;
  efectivoEsperado: number;
  cantidadVentas: number;
  totalVendido: number;
  anulaciones: number;
  devolucionesDigital: number;
  pagos: ResumenPagoCierre[];
  desglose: Record<string, number>;
  movimientos: MovimientoCaja[];
  inventario: ProductoTeoricoCierre[];
  conteos: ConteoInventario[];
}

interface FilaMovimiento {
  id: number;
  uuid: string;
  turno_id: number | null;
  usuario_id: number | null;
  tipo: string;
  monto: number;
  descripcion: string;
  gasto_id: number | null;
  version: number;
  deleted_at: string | null;
}

interface FilaConteo {
  id: number;
  uuid: string;
  turno_id: number | null;
  producto_id: number;
  cantidad_sistema: number;
  cantidad_contada: number;
  diferencia: number;
  motivo: string | null;
  usuario_id: number | null;
  version: number;
  deleted_at: string | null;
}

const A_MOVIMIENTO = (f: FilaMovimiento): MovimientoCaja => ({
  id: f.id,
  uuid: f.uuid,
  turnoId: f.turno_id,
  usuarioId: f.usuario_id,
  tipo: f.tipo as TipoMovimientoCaja,
  monto: f.monto,
  descripcion: f.descripcion,
  gastoId: f.gasto_id,
  version: f.version,
  deletedAt: f.deleted_at,
});

const A_CONTEO = (f: FilaConteo): ConteoInventario => ({
  id: f.id,
  uuid: f.uuid,
  turnoId: f.turno_id,
  productoId: f.producto_id,
  cantidadSistema: f.cantidad_sistema,
  cantidadContada: f.cantidad_contada,
  diferencia: f.diferencia,
  motivo: f.motivo,
  usuarioId: f.usuario_id,
  version: f.version,
  deletedAt: f.deleted_at,
});

export async function listarMovimientosCaja(
  db: SQLiteDatabase,
  turnoId: number
): Promise<MovimientoCaja[]> {
  const contexto = await obtenerContextoLocal(db);
  const filas = await db.getAllAsync<FilaMovimiento>(
    `SELECT * FROM movimientos_caja
     WHERE empresa_id = ? AND turno_id = ? AND deleted_at IS NULL
     ORDER BY created_at, id`,
    contexto.empresaId,
    turnoId
  );
  return filas.map(A_MOVIMIENTO);
}

export async function listarMovimientosCajaPorFecha(
  db: SQLiteDatabase,
  desde: string,
  hasta: string
): Promise<MovimientoCaja[]> {
  const contexto = await obtenerContextoLocal(db);
  const filas = await db.getAllAsync<FilaMovimiento>(
    `SELECT * FROM movimientos_caja
     WHERE empresa_id = ? AND deleted_at IS NULL AND created_at >= ? AND created_at < ?
     ORDER BY created_at, id`,
    contexto.empresaId,
    desde,
    hasta
  );
  return filas.map(A_MOVIMIENTO);
}

export async function listarConteos(
  db: SQLiteDatabase,
  turnoId: number
): Promise<ConteoInventario[]> {
  const contexto = await obtenerContextoLocal(db);
  const filas = await db.getAllAsync<FilaConteo>(
    `SELECT * FROM conteos_inventario
     WHERE empresa_id = ? AND turno_id = ? AND deleted_at IS NULL
     ORDER BY id`,
    contexto.empresaId,
    turnoId
  );
  return filas.map(A_CONTEO);
}

export async function crearMovimientoCaja(
  db: SQLiteDatabase,
  input: {
    turnoId: number | null;
    usuarioId: number | null;
    tipo: TipoMovimientoCaja;
    monto: number;
    descripcion: string;
    gastoId?: number | null;
  }
): Promise<MovimientoCaja> {
  if (!(input.monto > 0)) throw new Error('MONTO_INVALIDO');
  let creado: MovimientoCaja | null = null;

  await db.withTransactionAsync(async () => {
    const contexto = await obtenerContextoLocal(db);
    const ahora = ahoraIso();
    const res = await db.runAsync(
      `INSERT INTO movimientos_caja
         (uuid, empresa_id, turno_id, usuario_id, dispositivo_id, tipo, monto,
          descripcion, gasto_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      nuevoUuid(),
      contexto.empresaId,
      input.turnoId,
      input.usuarioId,
      contexto.deviceId,
      input.tipo,
      input.monto,
      input.descripcion.trim().slice(0, 140),
      input.gastoId ?? null,
      ahora,
      ahora
    );
    await encolarMovimientoCajaUpsert(db, res.lastInsertRowId);
    const fila = await db.getFirstAsync<FilaMovimiento>(
      `SELECT * FROM movimientos_caja WHERE empresa_id = ? AND id = ?`,
      contexto.empresaId,
      res.lastInsertRowId
    );
    creado = fila ? A_MOVIMIENTO(fila) : null;
  });

  if (!creado) throw new Error('MOVIMIENTO_NO_CREADO');
  pedirSyncAhora();
  return creado;
}

export async function eliminarMovimientoCaja(
  db: SQLiteDatabase,
  movimientoId: number
): Promise<void> {
  const contexto = await obtenerContextoLocal(db);
  await db.withTransactionAsync(async () => {
    const ahora = ahoraIso();
    await db.runAsync(
       `UPDATE movimientos_caja
        SET deleted_at = ?, version = version + 1, updated_at = ?
        WHERE empresa_id = ? AND id = ? AND deleted_at IS NULL`,
       ahora,
       ahora,
       contexto.empresaId,
       movimientoId
     );
    await encolarMovimientoCajaUpsert(db, movimientoId);
  });
  pedirSyncAhora();
}

export async function guardarConteo(
  db: SQLiteDatabase,
  input: {
    turnoId: number;
    productoId: number;
    cantidadSistema: number;
    cantidadContada: number;
    motivo?: string | null;
    usuarioId: number;
  }
): Promise<ConteoInventario> {
  let guardado: ConteoInventario | null = null;
  const diferencia = input.cantidadContada - input.cantidadSistema;

  await db.withTransactionAsync(async () => {
    const contexto = await obtenerContextoLocal(db);
    const ahora = ahoraIso();
    const existente = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM conteos_inventario
       WHERE empresa_id = ? AND turno_id = ? AND producto_id = ? AND deleted_at IS NULL`,
      contexto.empresaId,
      input.turnoId,
      input.productoId
    );

    let id: number;
    if (existente) {
      id = existente.id;
      await db.runAsync(
        `UPDATE conteos_inventario
         SET cantidad_sistema = ?, cantidad_contada = ?, diferencia = ?,
             motivo = ?, version = version + 1, updated_at = ?
          WHERE empresa_id = ? AND id = ?`,
         input.cantidadSistema,
        input.cantidadContada,
        diferencia,
         input.motivo?.trim() || null,
         ahora,
         contexto.empresaId,
         id
       );
    } else {
      const res = await db.runAsync(
        `INSERT INTO conteos_inventario
           (uuid, empresa_id, turno_id, producto_id, cantidad_sistema,
            cantidad_contada, diferencia, motivo, usuario_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        nuevoUuid(),
        contexto.empresaId,
        input.turnoId,
        input.productoId,
        input.cantidadSistema,
        input.cantidadContada,
        diferencia,
        input.motivo?.trim() || null,
        input.usuarioId,
        ahora,
        ahora
      );
      id = res.lastInsertRowId;
    }
    await encolarConteoInventarioUpsert(db, id);
    const fila = await db.getFirstAsync<FilaConteo>(
      `SELECT * FROM conteos_inventario WHERE empresa_id = ? AND id = ?`,
      contexto.empresaId,
      id
    );
    guardado = fila ? A_CONTEO(fila) : null;
  });

  if (!guardado) throw new Error('CONTEO_NO_GUARDADO');
  pedirSyncAhora();
  return guardado;
}

export async function aplicarDiferenciasInventario(
  db: SQLiteDatabase,
  turnoId: number,
  usuarioId: number
): Promise<number> {
  const contexto = await obtenerContextoLocal(db);
  const conteos = await listarConteos(db, turnoId);
  let aplicados = 0;

  await db.withTransactionAsync(async () => {
    for (const conteo of conteos) {
      if (conteo.diferencia === 0) continue;
      const producto = await db.getFirstAsync<{ uuid: string | null }>(
        `SELECT uuid FROM productos WHERE empresa_id = ? AND id = ?`,
        contexto.empresaId,
        conteo.productoId
      );
      if (!producto?.uuid) continue;
      const ahora = ahoraIso();
      await registrarMovimientoLocal(db, {
        productoId: conteo.productoId,
        productoUuid: producto.uuid,
        tipo: 'ajuste',
        cantidad: conteo.diferencia,
        referenciaTipo: 'conteo',
        referenciaId: conteo.uuid,
        usuarioId,
        turnoId,
      });
      await db.runAsync(
        `UPDATE productos
         SET stock = stock + ?, version = version + 1, updated_at = ?
         WHERE empresa_id = ? AND id = ?`,
        conteo.diferencia,
        ahora,
        contexto.empresaId,
        conteo.productoId
      );
      aplicados += 1;
    }
  });

  return aplicados;
}

export async function calcularResumenCierre(
  db: SQLiteDatabase,
  turnoId: number
): Promise<ResumenCierre> {
  const contexto = await obtenerContextoLocal(db);
  const turno = await db.getFirstAsync<{ fondo_inicial: number }>(
    `SELECT fondo_inicial FROM turnos_caja WHERE empresa_id = ? AND id = ?`,
    contexto.empresaId,
    turnoId
  );
  const fondoInicial = turno?.fondo_inicial ?? 0;

  const ventas = await db.getFirstAsync<{
    cantidad: number;
    total: number;
  }>(
     `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
      FROM ventas WHERE empresa_id = ? AND turno_id = ? AND anulada = 0`,
     contexto.empresaId,
     turnoId
  );
  const formas = await db.getAllAsync<{
    forma_pago: FormaPago;
    total: number;
    efectivo: number;
    digital: number;
  }>(
    `SELECT forma_pago,
            COALESCE(SUM(total), 0) AS total,
            COALESCE(SUM(monto_efectivo), 0) AS efectivo,
            COALESCE(SUM(monto_digital), 0) AS digital
      FROM ventas WHERE empresa_id = ? AND turno_id = ? AND anulada = 0
      GROUP BY forma_pago`,
     contexto.empresaId,
     turnoId
  );
  const anulaciones = await db.getFirstAsync<{
    cantidad: number;
    efectivo: number;
    digital: number;
  }>(
    `SELECT COUNT(*) AS cantidad,
            COALESCE(SUM(reembolso_efectivo), 0) AS efectivo,
            COALESCE(SUM(reembolso_digital), 0) AS digital
      FROM ventas WHERE empresa_id = ? AND turno_id = ? AND anulada = 1`,
     contexto.empresaId,
     turnoId
  );

  const movimientos = await listarMovimientosCaja(db, turnoId);
  const porTipo = (tipo: TipoMovimientoCaja): number =>
    movimientos
      .filter((m) => m.tipo === tipo)
      .reduce((suma, m) => suma + m.monto, 0);

  const ventasEfectivo = formas.reduce((suma, f) => suma + f.efectivo, 0);
  const digital = formas.reduce((suma, f) => suma + f.digital, 0);
  const devolucionesEfectivo = anulaciones?.efectivo ?? 0;
  const entradas = porTipo('entrada');
  const gastosCaja = porTipo('gasto');
  const retiros = porTipo('retiro');
  const otrasSalidas = porTipo('otra_salida');
  // El cierre solo concilia el efectivo de las operaciones de venta. Los
  // gastos y movimientos de caja pertenecen a rentabilidad, no al arqueo.
  const efectivoEsperado = fondoInicial + ventasEfectivo - devolucionesEfectivo;

  const desglose: Record<string, number> = {
    fondo_inicial: fondoInicial,
    ventas_efectivo: ventasEfectivo,
    devoluciones_efectivo: devolucionesEfectivo,
    entradas_efectivo: entradas,
    gastos_caja: gastosCaja,
    retiros: retiros,
    otras_salidas: otrasSalidas,
    efectivo_total: efectivoEsperado,
    digital_total: digital,
  };
  for (const fila of formas) {
    desglose[fila.forma_pago] = fila.total;
  }

  const movimientosInventario = await db.getAllAsync<{
    producto_id: number;
    cantidad: number;
  }>(
     `SELECT producto_id, cantidad FROM movimientos_inventario
      WHERE empresa_id = ? AND turno_id = ? AND tipo NOT IN ('venta', 'anulacion')`,
     contexto.empresaId,
     turnoId
  );
  const lineasVentas = await db.getAllAsync<{
    producto_id: number;
    cantidad: number;
    anulada: number;
  }>(
    `SELECT vi.producto_id, vi.cantidad, v.anulada
     FROM venta_items vi
     JOIN ventas v ON v.id = vi.venta_id
      WHERE v.empresa_id = ? AND v.turno_id = ? AND vi.producto_id IS NOT NULL`,
     contexto.empresaId,
     turnoId
  );
  const productos = await db.getAllAsync<{ id: number; nombre: string; stock: number }>(
    `SELECT id, nombre, stock FROM productos WHERE empresa_id = ? ORDER BY nombre`,
    contexto.empresaId
  );
  const inventario = productos.map((producto) => {
    const movidos = movimientosInventario.filter(
      (m) => m.producto_id === producto.id
    );
    const lineas = lineasVentas.filter((l) => l.producto_id === producto.id);
    const salidasVentas = lineas
      .filter((l) => l.anulada === 0)
      .reduce((suma, l) => suma + l.cantidad, 0);
    const entradasDevoluciones = lineas
      .filter((l) => l.anulada === 1)
      .reduce((suma, l) => suma + l.cantidad, 0);
    const entradasManuales = movidos
      .filter((m) => m.cantidad > 0)
      .reduce((suma, m) => suma + m.cantidad, 0);
    const salidasManuales = movidos
      .filter((m) => m.cantidad < 0)
      .reduce((suma, m) => suma + Math.abs(m.cantidad), 0);
    const entradas = entradasDevoluciones + entradasManuales;
    const salidas = salidasVentas + salidasManuales;
    return {
      productoId: producto.id,
      nombre: producto.nombre,
      inicial: producto.stock - entradas + salidas,
      entradas,
      salidas,
      final: producto.stock,
    };
  });

  return {
    fondoInicial,
    ventasEfectivo,
    devolucionesEfectivo,
    entradas,
    gastosCaja,
    retiros,
    otrasSalidas,
    efectivoEsperado,
    cantidadVentas: ventas?.cantidad ?? 0,
    totalVendido: ventas?.total ?? 0,
    anulaciones: anulaciones?.cantidad ?? 0,
    devolucionesDigital: anulaciones?.digital ?? 0,
    pagos: formas.map((f) => ({
      formaPago: f.forma_pago,
      total: f.total,
      efectivo: f.efectivo,
      digital: f.digital,
    })),
    desglose,
    movimientos,
    inventario,
    conteos: await listarConteos(db, turnoId),
  };
}
