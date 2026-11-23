import type { SQLiteDatabase } from 'expo-sqlite';
import { CATEGORIAS_GASTO, type CategoriaGasto } from '../../types';
import { obtenerContextoLocal } from '../contexto';

export interface RentabilidadProductoLocal {
  productoId: number | null;
  nombre: string;
  cantidad: number;
  ventas: number;
  costo: number;
  ganancia: number;
  margenPct: number | null;
  sinCosto: boolean;
}

export interface RentabilidadCategoriaLocal {
  categoria: CategoriaGasto;
  total: number;
  cantidad: number;
}

export interface ReporteRentabilidadLocal {
  desde: string;
  hasta: string;
  ventas: {
    cantidad: number;
    total: number;
    subtotal: number;
    ticketPromedio: number;
  };
  costoVentas: number;
  gananciaBruta: number;
  gastos: {
    total: number;
    porCategoria: RentabilidadCategoriaLocal[];
  };
  gananciaNeta: number;
  margenPct: number | null;
  lineasSinCosto: number;
  ventasSinCosto: number;
  estado: 'sin_datos' | 'equilibrio' | 'ganancia' | 'perdida' | 'parcial';
  ranking: RentabilidadProductoLocal[];
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export async function calcularRentabilidadLocal(
  db: SQLiteDatabase,
  desde: string,
  hasta: string
): Promise<ReporteRentabilidadLocal> {
  const contexto = await obtenerContextoLocal(db);
  const ventas = await db.getFirstAsync<{
    cantidad: number;
    total: number;
    subtotal: number;
  }>(
    `SELECT COUNT(*) AS cantidad,
            COALESCE(SUM(total), 0) AS total,
            COALESCE(SUM(subtotal), 0) AS subtotal
      FROM ventas
      WHERE empresa_id = ? AND anulada = 0 AND fecha_iso >= ? AND fecha_iso < ?`,
     contexto.empresaId,
     desde,
     hasta
  );

  const items = await db.getFirstAsync<{
    costo: number;
    lineas_sin_costo: number;
    ventas_sin_costo: number;
  }>(
    `SELECT COALESCE(SUM(vi.costo_unitario * vi.cantidad), 0) AS costo,
            COALESCE(SUM(CASE WHEN vi.costo_unitario IS NULL THEN 1 ELSE 0 END), 0)
              AS lineas_sin_costo,
            COUNT(DISTINCT CASE WHEN vi.costo_unitario IS NULL THEN vi.venta_id END)
              AS ventas_sin_costo
     FROM venta_items vi
     JOIN ventas v ON v.id = vi.venta_id
      WHERE v.empresa_id = ? AND v.anulada = 0 AND v.fecha_iso >= ? AND v.fecha_iso < ?`,
     contexto.empresaId,
     desde,
     hasta
  );

  const rankingFilas = await db.getAllAsync<{
    producto_id: number | null;
    nombre: string;
    cantidad: number;
    ventas: number;
    costo: number;
    ganancia: number;
    sin_costo: number;
  }>(
    `WITH lineas AS (
       SELECT vi.producto_id, vi.nombre, vi.cantidad, vi.costo_unitario, vi.subtotal,
              CASE WHEN v.subtotal > 0 THEN v.total * 1.0 / v.subtotal ELSE 1 END AS factor
       FROM venta_items vi
       JOIN ventas v ON v.id = vi.venta_id
        WHERE v.empresa_id = ? AND v.anulada = 0 AND v.fecha_iso >= ? AND v.fecha_iso < ?
      )
     SELECT MIN(producto_id) AS producto_id,
            MIN(nombre) AS nombre,
            SUM(cantidad) AS cantidad,
            SUM(subtotal * factor) AS ventas,
            SUM(COALESCE(costo_unitario, 0) * cantidad) AS costo,
            SUM(subtotal * factor - COALESCE(costo_unitario, 0) * cantidad) AS ganancia,
            MAX(CASE WHEN costo_unitario IS NULL THEN 1 ELSE 0 END) AS sin_costo
     FROM lineas
     GROUP BY COALESCE(CAST(producto_id AS TEXT), 'manual:' || nombre)
     ORDER BY ganancia DESC, SUM(cantidad) DESC
     LIMIT 50`,
     contexto.empresaId,
     desde,
     hasta
  );

  const gastosFilas = await db.getAllAsync<{
    categoria: string;
    total: number;
    cantidad: number;
  }>(
    `SELECT categoria,
            COALESCE(SUM(monto), 0) AS total,
            COUNT(*) AS cantidad
      FROM gastos
      WHERE empresa_id = ? AND deleted_at IS NULL AND fecha >= ? AND fecha < ?
      GROUP BY categoria`,
     contexto.empresaId,
     desde,
     hasta
  );

  const totalVentas = ventas?.total ?? 0;
  const subtotalVentas = ventas?.subtotal ?? 0;
  const cantidadVentas = ventas?.cantidad ?? 0;
  const costoVentas = items?.costo ?? 0;
  const lineasSinCosto = items?.lineas_sin_costo ?? 0;
  const ventasSinCosto = items?.ventas_sin_costo ?? 0;
  const gananciaBruta = redondear(totalVentas - costoVentas);

  const porCategoria: RentabilidadCategoriaLocal[] = CATEGORIAS_GASTO.map(
    (categoria) => {
      const fila = gastosFilas.find((g) => g.categoria === categoria);
      return {
        categoria,
        total: redondear(fila?.total ?? 0),
        cantidad: fila?.cantidad ?? 0,
      };
    }
  );
  const totalGastos = redondear(
    porCategoria.reduce((suma, fila) => suma + fila.total, 0)
  );
  const gananciaNeta = redondear(gananciaBruta - totalGastos);
  const margenPct =
    totalVentas > 0 ? redondear((gananciaNeta / totalVentas) * 100) : null;

  const estado: ReporteRentabilidadLocal['estado'] =
    cantidadVentas === 0 && totalGastos === 0
      ? 'sin_datos'
      : lineasSinCosto > 0
        ? 'parcial'
        : gananciaNeta > 0
          ? 'ganancia'
          : gananciaNeta < 0
            ? 'perdida'
            : 'equilibrio';

  return {
    desde,
    hasta,
    ventas: {
      cantidad: cantidadVentas,
      total: redondear(totalVentas),
      subtotal: redondear(subtotalVentas),
      ticketPromedio:
        cantidadVentas > 0 ? redondear(totalVentas / cantidadVentas) : 0,
    },
    costoVentas: redondear(costoVentas),
    gananciaBruta,
    gastos: { total: totalGastos, porCategoria },
    gananciaNeta,
    margenPct,
    lineasSinCosto,
    ventasSinCosto,
    estado,
    ranking: rankingFilas.map((fila) => {
      const ventasProducto = fila.ventas ?? 0;
      const ganancia = fila.ganancia ?? 0;
      return {
        productoId: fila.producto_id,
        nombre: fila.nombre,
        cantidad: fila.cantidad ?? 0,
        ventas: redondear(ventasProducto),
        costo: redondear(fila.costo ?? 0),
        ganancia: redondear(ganancia),
        margenPct:
          ventasProducto > 0 ? redondear((ganancia / ventasProducto) * 100) : null,
        sinCosto: (fila.sin_costo ?? 0) > 0,
      };
    }),
  };
}
