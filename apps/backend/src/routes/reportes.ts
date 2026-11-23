import { Router } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { withTenant } from '../db';
import { requireDevice } from '../middleware/auth';
import { ApiError } from '../middleware/errors';
import { asyncHandler } from '../middleware/async-handler';
import { exigirLicenciaVigente } from '../services/licencias';
import { CATEGORIAS_GASTO } from '@micaja/shared';

export const reportesRouter = Router();

reportesRouter.use(requireDevice);

const rangoSchema = z
  .object({
    desde: z.string().datetime(),
    hasta: z.string().datetime(),
  })
  .refine((valor) => new Date(valor.desde) < new Date(valor.hasta), {
    message: 'El rango de fechas es inválido.',
    path: ['hasta'],
  });

async function exigirGestor(
  client: PoolClient,
  empresaId: string,
  deviceId: string
): Promise<void> {
  const fila = await client.query<{ rol: string }>(
    `select rol::text as rol from dispositivos where empresa_id = $1 and id = $2`,
    [empresaId, deviceId]
  );
  const rol = fila.rows[0]?.rol;
  if (rol !== 'propietario' && rol !== 'admin') {
    throw new ApiError(
      403,
      'ROL_INSUFICIENTE',
      'Solo los administradores pueden ver la rentabilidad.'
    );
  }
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function numero(valor: string | null | undefined): number {
  return valor === null || valor === undefined ? 0 : Number(valor);
}

reportesRouter.get(
  '/rentabilidad',
  asyncHandler(async (req, res) => {
    const rango = rangoSchema.parse(req.query);
    const dispositivo = req.device!;

    const resultado = await withTenant(dispositivo.empresaId, async (client) => {
      await exigirLicenciaVigente(client, dispositivo.empresaId);
      await exigirGestor(client, dispositivo.empresaId, dispositivo.deviceId);

      const ventas = await client.query<{
        cantidad: number;
        total: string;
        subtotal: string;
      }>(
        `select count(*)::int as cantidad,
                coalesce(sum(total), 0)::text as total,
                coalesce(sum(subtotal), 0)::text as subtotal
         from ventas
         where empresa_id = $1 and anulada = false
           and fecha_cliente >= $2::timestamptz
           and fecha_cliente < $3::timestamptz`,
        [dispositivo.empresaId, rango.desde, rango.hasta]
      );

      const items = await client.query<{
        costo: string;
        lineas_sin_costo: number;
        ventas_sin_costo: number;
      }>(
        `select coalesce(sum(vi.costo_unitario * vi.cantidad), 0)::text as costo,
                count(*) filter (where vi.costo_unitario is null)::int as lineas_sin_costo,
                count(distinct vi.venta_id)
                  filter (where vi.costo_unitario is null)::int as ventas_sin_costo
         from venta_items vi
         join ventas v
           on v.empresa_id = vi.empresa_id and v.id = vi.venta_id
         where v.empresa_id = $1 and v.anulada = false
           and v.fecha_cliente >= $2::timestamptz
           and v.fecha_cliente < $3::timestamptz`,
        [dispositivo.empresaId, rango.desde, rango.hasta]
      );

      const ranking = await client.query<{
        producto_id: string | null;
        nombre: string;
        cantidad: string;
        ventas: string;
        costo: string;
        ganancia: string;
        sin_costo: boolean;
      }>(
        `with lineas as (
           select vi.producto_id,
                  vi.nombre,
                  vi.cantidad,
                  vi.costo_unitario,
                  vi.subtotal,
                  case when v.subtotal > 0
                       then v.total / v.subtotal
                       else 1 end as factor
           from venta_items vi
           join ventas v
             on v.empresa_id = vi.empresa_id and v.id = vi.venta_id
           where v.empresa_id = $1 and v.anulada = false
             and v.fecha_cliente >= $2::timestamptz
             and v.fecha_cliente < $3::timestamptz
         )
         select min(producto_id::text) as producto_id,
                min(nombre) as nombre,
                sum(cantidad)::text as cantidad,
                sum(subtotal * factor)::text as ventas,
                sum(coalesce(costo_unitario, 0) * cantidad)::text as costo,
                sum(subtotal * factor - coalesce(costo_unitario, 0) * cantidad)::text
                  as ganancia,
                bool_or(costo_unitario is null) as sin_costo
         from lineas
         group by coalesce(producto_id::text, 'manual:' || nombre)
         order by sum(subtotal * factor - coalesce(costo_unitario, 0) * cantidad) desc,
                  sum(cantidad) desc
         limit 50`,
        [dispositivo.empresaId, rango.desde, rango.hasta]
      );

      const gastos = await client.query<{
        categoria: string;
        total: string;
        cantidad: number;
      }>(
        `select categoria,
                sum(monto)::text as total,
                count(*)::int as cantidad
         from gastos
         where empresa_id = $1 and deleted_at is null
           and fecha >= $2::timestamptz
           and fecha < $3::timestamptz
         group by categoria`,
        [dispositivo.empresaId, rango.desde, rango.hasta]
      );

      const totalVentas = numero(ventas.rows[0]?.total);
      const subtotalVentas = numero(ventas.rows[0]?.subtotal);
      const costoVentas = numero(items.rows[0]?.costo);
      const lineasSinCosto = items.rows[0]?.lineas_sin_costo ?? 0;
      const ventasSinCosto = items.rows[0]?.ventas_sin_costo ?? 0;

      const porCategoria = new Map(
        gastos.rows.map((fila) => [fila.categoria, fila])
      );
      const categorias = CATEGORIAS_GASTO.map((categoria) => {
        const fila = porCategoria.get(categoria);
        return {
          categoria,
          total: redondear(numero(fila?.total)),
          cantidad: fila?.cantidad ?? 0,
        };
      });
      const totalGastos = redondear(
        categorias.reduce((suma, fila) => suma + fila.total, 0)
      );

      const gananciaBruta = redondear(totalVentas - costoVentas);
      const gananciaNeta = redondear(gananciaBruta - totalGastos);
      const cantidadVentas = ventas.rows[0]?.cantidad ?? 0;

      return {
        desde: rango.desde,
        hasta: rango.hasta,
        ventas: {
          cantidad: cantidadVentas,
          total: redondear(totalVentas),
          subtotal: redondear(subtotalVentas),
          ticketPromedio: cantidadVentas > 0
            ? redondear(totalVentas / cantidadVentas)
            : 0,
        },
        costoVentas: redondear(costoVentas),
        gananciaBruta,
        gastos: {
          total: totalGastos,
          porCategoria: categorias,
        },
        gananciaNeta,
        margenPct: totalVentas > 0
          ? redondear((gananciaNeta / totalVentas) * 100)
          : null,
        lineasSinCosto,
        ventasSinCosto,
        ranking: ranking.rows.map((fila) => {
          const ventasFila = numero(fila.ventas);
          const costoFila = numero(fila.costo);
          const gananciaFila = numero(fila.ganancia);
          return {
            productoId: fila.producto_id,
            nombre: fila.nombre,
            cantidad: numero(fila.cantidad),
            ventas: redondear(ventasFila),
            costo: redondear(costoFila),
            ganancia: redondear(gananciaFila),
            margenPct: ventasFila > 0
              ? redondear((gananciaFila / ventasFila) * 100)
              : null,
            sinCosto: fila.sin_costo,
          };
        }),
      };
    });

    res.json(resultado);
  })
);
