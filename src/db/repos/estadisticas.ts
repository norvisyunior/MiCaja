import type { SQLiteDatabase } from 'expo-sqlite';

export interface ResumenDia {
  ventas: number;
  ingresos: number;
  ticketPromedio: number;
  efectivo: number;
  digital: number;
  topProducto: { nombre: string; emoji: string; cantidad: number; total: number } | null;
}

export interface VentaPorDia {
  dia: string;
  ventas: number;
  total: number;
}

export interface VentaPorForma {
  formaPago: string;
  ventas: number;
  total: number;
}

export interface TopProducto {
  nombre: string;
  emoji: string;
  cantidad: number;
  total: number;
}

const RANGO_VALIDO = 'anulada = 0 AND fecha_iso >= ? AND fecha_iso < ?';

export async function resumenDia(
  db: SQLiteDatabase,
  desdeISO: string,
  hastaISO: string
): Promise<ResumenDia> {
  const resumen = await db.getFirstAsync<{
    ventas: number;
    ingresos: number;
    ticket: number;
    efectivo: number;
    digital: number;
  }>(
    `SELECT COUNT(*) AS ventas,
            COALESCE(SUM(total), 0) AS ingresos,
            COALESCE(AVG(total), 0) AS ticket,
            COALESCE(SUM(monto_efectivo), 0) AS efectivo,
            COALESCE(SUM(monto_digital), 0) AS digital
     FROM ventas WHERE ${RANGO_VALIDO}`,
    desdeISO,
    hastaISO
  );

  const top = await db.getFirstAsync<{
    nombre: string;
    emoji: string;
    cantidad: number;
    total: number;
  }>(
    `SELECT vi.nombre, COALESCE(p.emoji, '🛍️') AS emoji,
            SUM(vi.cantidad) AS cantidad, SUM(vi.subtotal) AS total
     FROM venta_items vi
     JOIN ventas v ON v.id = vi.venta_id
     LEFT JOIN productos p ON p.id = vi.producto_id
     WHERE v.${RANGO_VALIDO.replace('anulada = 0 AND ', '')}
     GROUP BY vi.nombre, p.emoji
     ORDER BY cantidad DESC
     LIMIT 1`,
    desdeISO,
    hastaISO
  );

  return {
    ventas: resumen?.ventas ?? 0,
    ingresos: resumen?.ingresos ?? 0,
    ticketPromedio: resumen?.ticket ?? 0,
    efectivo: resumen?.efectivo ?? 0,
    digital: resumen?.digital ?? 0,
    topProducto: top
      ? { nombre: top.nombre, emoji: top.emoji, cantidad: top.cantidad, total: top.total }
      : null,
  };
}

export async function ventasPorDia(
  db: SQLiteDatabase,
  desdeISO: string,
  hastaISO: string
): Promise<VentaPorDia[]> {
  return db.getAllAsync<VentaPorDia>(
    `SELECT substr(fecha_iso, 1, 10) AS dia,
            COUNT(*) AS ventas,
            COALESCE(SUM(total), 0) AS total
     FROM ventas WHERE ${RANGO_VALIDO}
     GROUP BY substr(fecha_iso, 1, 10)
     ORDER BY dia`,
    desdeISO,
    hastaISO
  );
}

export async function ventasPorForma(
  db: SQLiteDatabase,
  desdeISO: string,
  hastaISO: string
): Promise<VentaPorForma[]> {
  return db.getAllAsync<VentaPorForma>(
    `SELECT forma_pago AS formaPago,
            COUNT(*) AS ventas,
            COALESCE(SUM(total), 0) AS total
     FROM ventas WHERE ${RANGO_VALIDO}
     GROUP BY forma_pago
     ORDER BY total DESC`,
    desdeISO,
    hastaISO
  );
}

export async function topProductos(
  db: SQLiteDatabase,
  desdeISO: string,
  hastaISO: string,
  limite = 5
): Promise<TopProducto[]> {
  return db.getAllAsync<TopProducto>(
    `SELECT vi.nombre, COALESCE(p.emoji, '🛍️') AS emoji,
            SUM(vi.cantidad) AS cantidad, SUM(vi.subtotal) AS total
     FROM venta_items vi
     JOIN ventas v ON v.id = vi.venta_id
     LEFT JOIN productos p ON p.id = vi.producto_id
     WHERE v.anulada = 0 AND v.fecha_iso >= ? AND v.fecha_iso < ?
     GROUP BY vi.nombre, p.emoji
     ORDER BY cantidad DESC
     LIMIT ?`,
    desdeISO,
    hastaISO,
    limite
  );
}
