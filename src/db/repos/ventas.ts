import type { SQLiteDatabase } from 'expo-sqlite';
import type { FormaPago, Venta, VentaItem } from '../../types';
import { turnoAbierto } from './turnos';
import { siguienteNumeroVenta } from './settings';
import { claveDiaLocal } from '../../utils/fechas';

export interface ItemVentaNuevo {
  productoId: number | null;
  nombre: string;
  precioUnitario: number;
  cantidad: number;
}

export interface VentaNueva {
  usuarioId: number;
  subtotal: number;
  descuentoPct: number;
  total: number;
  formaPago: FormaPago;
  montoEfectivo: number;
  montoDigital: number;
  items: ItemVentaNuevo[];
}

interface FilaVenta {
  id: number;
  numero: number;
  turno_id: number | null;
  usuario_id: number;
  fecha_iso: string;
  subtotal: number;
  descuento_pct: number;
  total: number;
  forma_pago: string;
  monto_efectivo: number;
  monto_digital: number;
  anulada: number;
  motivo_anulacion: string | null;
  anulada_por: number | null;
  anulada_en: string | null;
  usuario_nombre?: string;
}

interface FilaItem {
  id: number;
  venta_id: number;
  producto_id: number | null;
  nombre: string;
  precio_unitario: number;
  cantidad: number;
  subtotal: number;
}

const A_ITEM = (f: FilaItem): VentaItem => ({
  id: f.id,
  ventaId: f.venta_id,
  productoId: f.producto_id,
  nombre: f.nombre,
  precioUnitario: f.precio_unitario,
  cantidad: f.cantidad,
  subtotal: f.subtotal,
});

const A_VENTA = (f: FilaVenta, items: VentaItem[]): Venta => ({
  id: f.id,
  numero: f.numero,
  turnoId: f.turno_id,
  usuarioId: f.usuario_id,
  fechaIso: f.fecha_iso,
  subtotal: f.subtotal,
  descuentoPct: f.descuento_pct,
  total: f.total,
  formaPago: f.forma_pago as FormaPago,
  montoEfectivo: f.monto_efectivo,
  montoDigital: f.monto_digital,
  anulada: f.anulada === 1,
  motivoAnulacion: f.motivo_anulacion,
  anuladaPor: f.anulada_por,
  anuladaEn: f.anulada_en,
  items,
  usuarioNombre: f.usuario_nombre,
});

export async function registrarVenta(
  db: SQLiteDatabase,
  venta: VentaNueva
): Promise<Venta> {
  let resultado: Venta;

  await db.withTransactionAsync(async () => {
    if (venta.items.length === 0) {
      throw new Error('SIN_ITEMS');
    }
    const ahora = new Date();
    const dia = claveDiaLocal(ahora);
    const numero = await siguienteNumeroVenta(db, dia);
    const turno = await turnoAbierto(db, venta.usuarioId);
    if (!turno) {
      throw new Error('SIN_TURNO');
    }

    let montoEfectivo = venta.montoEfectivo;
    let montoDigital = venta.montoDigital;
    if (venta.formaPago === 'efectivo') {
      montoEfectivo = venta.total;
      montoDigital = 0;
    } else if (venta.formaPago !== 'mixto') {
      montoEfectivo = 0;
      montoDigital = venta.total;
    }

    const res = await db.runAsync(
      `INSERT INTO ventas (numero, turno_id, usuario_id, fecha_iso, subtotal, descuento_pct, total,
        forma_pago, monto_efectivo, monto_digital, anulada)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      numero,
      turno.id,
      venta.usuarioId,
      ahora.toISOString(),
      venta.subtotal,
      venta.descuentoPct,
      venta.total,
      venta.formaPago,
      montoEfectivo,
      montoDigital
    );
    const ventaId = res.lastInsertRowId;

    for (const item of venta.items) {
      if (item.productoId != null) {
        const fila = await db.getFirstAsync<{ stock: number }>(
          `SELECT stock FROM productos WHERE id = ?`,
          item.productoId
        );
        if (!fila || fila.stock < item.cantidad) {
          throw new Error('STOCK_INSUFICIENTE');
        }
        await db.runAsync(
          `UPDATE productos SET stock = stock - ? WHERE id = ?`,
          item.cantidad,
          item.productoId
        );
      }
      await db.runAsync(
        `INSERT INTO venta_items (venta_id, producto_id, nombre, precio_unitario, cantidad, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ventaId,
        item.productoId,
        item.nombre,
        item.precioUnitario,
        item.cantidad,
        item.precioUnitario * item.cantidad
      );
    }

    resultado = {
      id: ventaId,
      numero,
      turnoId: turno.id,
      usuarioId: venta.usuarioId,
      fechaIso: ahora.toISOString(),
      subtotal: venta.subtotal,
      descuentoPct: venta.descuentoPct,
      total: venta.total,
      formaPago: venta.formaPago,
      montoEfectivo,
      montoDigital,
      anulada: false,
      motivoAnulacion: null,
      anuladaPor: null,
      anuladaEn: null,
      items: venta.items.map((i) => ({
        id: 0,
        ventaId,
        productoId: i.productoId,
        nombre: i.nombre,
        precioUnitario: i.precioUnitario,
        cantidad: i.cantidad,
        subtotal: i.precioUnitario * i.cantidad,
      })),
    };
  });

  return resultado!;
}

async function itemsDeVenta(db: SQLiteDatabase, ventaId: number): Promise<VentaItem[]> {
  const filas = await db.getAllAsync<FilaItem>(
    `SELECT * FROM venta_items WHERE venta_id = ? ORDER BY id`,
    ventaId
  );
  return filas.map(A_ITEM);
}

export async function listarVentas(
  db: SQLiteDatabase,
  fechaDesde: string,
  fechaHasta: string
): Promise<Venta[]> {  const filas = await db.getAllAsync<FilaVenta>(
    `SELECT v.*, u.nombre AS usuario_nombre
     FROM ventas v
     LEFT JOIN usuarios u ON u.id = v.usuario_id
     WHERE v.fecha_iso >= ? AND v.fecha_iso < ?
     ORDER BY v.id DESC`,
    fechaDesde,
    fechaHasta
  );

  const resultado: Venta[] = [];
  for (const f of filas) {
    const items = await itemsDeVenta(db, f.id);
    resultado.push(A_VENTA(f, items));
  }
  return resultado;
}

export async function obtenerVenta(db: SQLiteDatabase, id: number): Promise<Venta | null> {
  const fila = await db.getFirstAsync<FilaVenta>(
    `SELECT v.*, u.nombre AS usuario_nombre
     FROM ventas v
     LEFT JOIN usuarios u ON u.id = v.usuario_id
     WHERE v.id = ?`,
    id
  );
  if (!fila) {
    return null;
  }
  const items = await itemsDeVenta(db, fila.id);
  return A_VENTA(fila, items);
}

export async function puedeAnularVenta(
  db: SQLiteDatabase,
  ventaId: number
): Promise<boolean> {
  const venta = await db.getFirstAsync<{
    turno_id: number | null;
    usuario_id: number;
    fecha_iso: string;
    anulada: number;
  }>(
    `SELECT turno_id, usuario_id, fecha_iso, anulada FROM ventas WHERE id = ?`,
    ventaId
  );
  if (!venta || venta.anulada === 1) {
    return false;
  }

  if (venta.turno_id != null) {
    const turno = await db.getFirstAsync<{ estado: string }>(
      `SELECT estado FROM turnos_caja WHERE id = ?`,
      venta.turno_id
    );
    if (turno && turno.estado === 'abierto') {
      return true;
    }
  }

  const esDeHoy = claveDiaLocal(new Date(venta.fecha_iso)) === claveDiaLocal(new Date());
  if (!esDeHoy) {
    return false;
  }
  const cajaAbierta = await turnoAbierto(db, venta.usuario_id);
  return cajaAbierta !== null;
}

export async function anularVenta(
  db: SQLiteDatabase,
  ventaId: number,
  motivo: string,
  usuarioId: number
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const venta = await db.getFirstAsync<{ anulada: number; turno_id: number | null }>(
      `SELECT anulada, turno_id FROM ventas WHERE id = ?`,
      ventaId
    );
    if (!venta || venta.anulada === 1) {
      return;
    }

    if (!(await puedeAnularVenta(db, ventaId))) {
      throw new Error('TURNO_CERRADO');
    }

    const items = await db.getAllAsync<{ producto_id: number | null; cantidad: number }>(
      `SELECT producto_id, cantidad FROM venta_items WHERE venta_id = ?`,
      ventaId
    );
    for (const it of items) {
      if (it.producto_id != null) {
        await db.runAsync(
          `UPDATE productos SET stock = stock + ? WHERE id = ?`,
          it.cantidad,
          it.producto_id
        );
      }
    }

    await db.runAsync(
      `UPDATE ventas SET anulada = 1, motivo_anulacion = ?, anulada_por = ?, anulada_en = ?
       WHERE id = ?`,
      motivo,
      usuarioId,
      new Date().toISOString(),
      ventaId
    );
  });
}

export interface ResumenVentasTurno {
  ventas: number;
  total: number;
  efectivo: number;
  digital: number;
}

export async function resumenVentasTurno(
  db: SQLiteDatabase,
  turnoId: number
): Promise<ResumenVentasTurno> {
  const fila = await db.getFirstAsync<{
    ventas: number;
    total: number;
    efectivo: number;
    digital: number;
  }>(
    `SELECT COUNT(*) AS ventas,
            COALESCE(SUM(total), 0) AS total,
            COALESCE(SUM(monto_efectivo), 0) AS efectivo,
            COALESCE(SUM(monto_digital), 0) AS digital
     FROM ventas WHERE turno_id = ? AND anulada = 0`,
    turnoId
  );
  return {
    ventas: fila?.ventas ?? 0,
    total: fila?.total ?? 0,
    efectivo: fila?.efectivo ?? 0,
    digital: fila?.digital ?? 0,
  };
}

export async function listarTodasVentas(
  db: SQLiteDatabase,
  limite = 2000
): Promise<Venta[]> {
  const filas = await db.getAllAsync<FilaVenta>(
    `SELECT v.*, u.nombre AS usuario_nombre
     FROM ventas v
     LEFT JOIN usuarios u ON u.id = v.usuario_id
     ORDER BY v.id DESC LIMIT ?`,
    limite
  );

  const resultado: Venta[] = [];
  for (const f of filas) {
    const items = await itemsDeVenta(db, f.id);
    resultado.push(A_VENTA(f, items));
  }
  return resultado;
}
