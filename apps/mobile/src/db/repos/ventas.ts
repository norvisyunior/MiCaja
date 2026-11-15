import type { SQLiteDatabase } from 'expo-sqlite';
import type { FormaPago, Venta, VentaItem } from '../../types';
import { turnoAbierto } from './turnos';
import { siguienteNumeroVenta } from './settings';
import { claveDiaLocal } from '../../utils/fechas';
import { ahoraIso, nuevoUuid, obtenerContextoLocal } from '../contexto';
import { encolarOperacion } from '../outbox';
import { encolarAnulacion } from '../sync/encolar';
import { registrarMovimientoLocal } from './inventario';

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
  uuid: string | null;
  servidor_id: string | null;
  numero: number;
  numero_servidor: number | null;
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
  uuid: f.uuid ?? undefined,
  servidorId: f.servidor_id,
  numero: f.numero,
  numeroServidor: f.numero_servidor,
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
    const fechaIso = ahora.toISOString();
    const dia = claveDiaLocal(ahora);
    const numero = await siguienteNumeroVenta(db, dia);
    const turno = await turnoAbierto(db, venta.usuarioId);
    if (!turno) {
      throw new Error('SIN_TURNO');
    }

    const contexto = await obtenerContextoLocal(db);
    const ventaUuid = nuevoUuid();
    const usuario = await db.getFirstAsync<{ uuid: string | null }>(
      `SELECT uuid FROM usuarios WHERE id = ?`,
      venta.usuarioId
    );
    const turnoFila = await db.getFirstAsync<{ uuid: string | null }>(
      `SELECT uuid FROM turnos_caja WHERE id = ?`,
      turno.id
    );
    if (!usuario?.uuid || !turnoFila?.uuid) {
      throw new Error('IDENTIDAD_INCOMPLETA');
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
      `INSERT INTO ventas
         (uuid, empresa_id, device_id, numero, turno_id, usuario_id, fecha_iso,
          subtotal, descuento_pct, total, forma_pago, monto_efectivo, monto_digital,
          anulada, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      ventaUuid,
      contexto.empresaId,
      contexto.deviceId,
      numero,
      turno.id,
      venta.usuarioId,
      fechaIso,
      venta.subtotal,
      venta.descuentoPct,
      venta.total,
      venta.formaPago,
      montoEfectivo,
      montoDigital,
      fechaIso
    );
    const ventaId = res.lastInsertRowId;
    const itemsPayload: Array<{
      productoId: string | null;
      nombre: string;
      precioUnitario: number;
      cantidad: number;
      subtotal: number;
    }> = [];

    for (const item of venta.items) {
      let productoUuid: string | null = null;

      if (item.productoId != null) {
        const fila = await db.getFirstAsync<{ stock: number; uuid: string | null }>(
          `SELECT stock, uuid FROM productos WHERE id = ?`,
          item.productoId
        );
        if (!fila || fila.stock < item.cantidad || !fila.uuid) {
          throw new Error('STOCK_INSUFICIENTE');
        }
        productoUuid = fila.uuid;
        await db.runAsync(
          `UPDATE productos
           SET stock = stock - ?, version = version + 1, updated_at = ?
           WHERE id = ?`,
          item.cantidad,
          fechaIso,
          item.productoId
        );
        await registrarMovimientoLocal(db, {
          productoId: item.productoId,
          productoUuid: fila.uuid,
          tipo: 'venta',
          cantidad: -item.cantidad,
          referenciaTipo: 'venta',
          referenciaId: ventaUuid,
          usuarioId: venta.usuarioId,
          sincronizar: false,
        });
      }

      const subtotalItem = item.precioUnitario * item.cantidad;
      await db.runAsync(
        `INSERT INTO venta_items
           (uuid, empresa_id, venta_id, producto_id, nombre, precio_unitario, cantidad, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        nuevoUuid(),
        contexto.empresaId,
        ventaId,
        item.productoId,
        item.nombre,
        item.precioUnitario,
        item.cantidad,
        subtotalItem
      );

      itemsPayload.push({
        productoId: productoUuid,
        nombre: item.nombre,
        precioUnitario: item.precioUnitario,
        cantidad: item.cantidad,
        subtotal: subtotalItem,
      });
    }

    await encolarOperacion(db, {
      tipo: 'venta',
      entidad: 'ventas',
      entidadUuid: ventaUuid,
      prioridad: 3,
      payload: {
        localId: ventaUuid,
        usuarioId: usuario.uuid,
        turnoId: turnoFila.uuid,
        fechaCliente: fechaIso,
        subtotal: venta.subtotal,
        descuentoPct: venta.descuentoPct,
        total: venta.total,
        formaPago: venta.formaPago,
        montoEfectivo,
        montoDigital,
        items: itemsPayload,
      },
    });

    resultado = {
      id: ventaId,
      uuid: ventaUuid,
      servidorId: null,
      numero,
      numeroServidor: null,
      turnoId: turno.id,
      usuarioId: venta.usuarioId,
      fechaIso,
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
    // Solo se puede anular una venta mientras su turno siga abierto. Si el
    // turno ya se cerró, sus totales históricos no deben cambiar.
    return turno?.estado === 'abierto';
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
    const venta = await db.getFirstAsync<{
      anulada: number;
      turno_id: number | null;
      uuid: string | null;
    }>(`SELECT anulada, turno_id, uuid FROM ventas WHERE id = ?`, ventaId);
    if (!venta || venta.anulada === 1) {
      return;
    }

    if (!(await puedeAnularVenta(db, ventaId))) {
      throw new Error('TURNO_CERRADO');
    }

    const ventaUuid = venta.uuid ?? nuevoUuid();
    if (!venta.uuid) {
      await db.runAsync(`UPDATE ventas SET uuid = ? WHERE id = ?`, ventaUuid, ventaId);
    }

    const ahora = ahoraIso();
    const items = await db.getAllAsync<{
      producto_id: number | null;
      producto_uuid: string | null;
      cantidad: number;
    }>(
      `SELECT vi.producto_id, vi.cantidad, p.uuid AS producto_uuid
       FROM venta_items vi
       LEFT JOIN productos p ON p.id = vi.producto_id
       WHERE vi.venta_id = ?`,
      ventaId
    );

    for (const item of items) {
      if (item.producto_id != null && item.producto_uuid) {
        await db.runAsync(
          `UPDATE productos
           SET stock = stock + ?, version = version + 1, updated_at = ?
           WHERE id = ?`,
          item.cantidad,
          ahora,
          item.producto_id
        );
        await registrarMovimientoLocal(db, {
          productoId: item.producto_id,
          productoUuid: item.producto_uuid,
          tipo: 'anulacion',
          cantidad: item.cantidad,
          referenciaTipo: 'venta',
          referenciaId: ventaUuid,
          usuarioId,
          sincronizar: false,
        });
      }
    }

    await db.runAsync(
      `UPDATE ventas
       SET anulada = 1, motivo_anulacion = ?, anulada_por = ?, anulada_en = ?,
           updated_at = ?
       WHERE id = ?`,
      motivo,
      usuarioId,
      ahora,
      ahora,
      ventaId
    );

    await encolarAnulacion(db, ventaId, usuarioId, motivo);
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
