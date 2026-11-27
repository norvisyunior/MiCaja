import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema, MAX_MONTO } from '@micaja/shared';
import { withAdmin } from '../../db';
import { requireAdmin } from '../../middleware/auth';
import { ApiError } from '../../middleware/errors';
import { asyncHandler } from '../../middleware/async-handler';
import {
  auditar,
  consultaLista,
  desplazamiento,
  responderLista,
} from './common';

const montoSchema = z.number().finite().min(0).max(MAX_MONTO);

const filtrosVentaSchema = z.object({
  anulada: z.enum(['true', 'false']).transform((valor) => valor === 'true').optional(),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
});

const anularSchema = z.object({
  motivo: z.string().trim().min(1).max(200),
  reembolsoEfectivo: montoSchema.default(0),
  reembolsoDigital: montoSchema.default(0),
});

interface ListaBase {
  total: number;
}

interface VentaFila extends ListaBase {
  id: string;
  empresa_id: string;
  empresa_nombre: string;
  numero: string;
  fecha_cliente: Date;
  total_venta: string;
  forma_pago: string;
  anulada: boolean;
  motivo_anulacion: string | null;
  reembolso_efectivo: string;
  reembolso_digital: string;
  usuario_id: string;
  dispositivo_id: string;
  turno_id: string | null;
}

interface ItemFila {
  id: string;
  venta_id: string;
  producto_id: string | null;
  nombre: string;
  precio_unitario: string;
  cantidad: string;
  subtotal: string;
}

export const adminOperacionRouter = Router();

adminOperacionRouter.use(requireAdmin);

adminOperacionRouter.get(
  '/ventas',
  asyncHandler(async (req, res) => {
    const consulta = consultaLista(req);
    const filtros = filtrosVentaSchema.parse(req.query);
    const parametros: unknown[] = [`%${consulta.q?.toLowerCase() ?? ''}%`];
    let filtro = `where e.deleted_at is null
                    and (lower(v.motivo_anulacion) like $1 or v.numero::text like $1)`;
    if (consulta.empresaId) {
      parametros.push(consulta.empresaId);
      filtro += ` and v.empresa_id = $${parametros.length}`;
    }
    if (filtros.anulada !== undefined) {
      parametros.push(filtros.anulada);
      filtro += ` and v.anulada = $${parametros.length}`;
    }
    if (filtros.desde) {
      parametros.push(filtros.desde);
      filtro += ` and v.fecha_cliente >= $${parametros.length}::timestamptz`;
    }
    if (filtros.hasta) {
      parametros.push(filtros.hasta);
      filtro += ` and v.fecha_cliente <= $${parametros.length}::timestamptz`;
    }
    parametros.push(consulta.limit, desplazamiento(consulta));

    const resultado = await withAdmin(async (client) => {
      const ventas = await client.query<VentaFila>(
        `select v.id, v.empresa_id, e.nombre as empresa_nombre, v.numero,
                v.fecha_cliente, v.total as total_venta, v.forma_pago, v.anulada,
                v.motivo_anulacion, v.reembolso_efectivo, v.reembolso_digital,
                v.usuario_id, v.dispositivo_id, v.turno_id,
                count(*) over()::int as total
         from ventas v
         join empresas e on e.id = v.empresa_id
         ${filtro}
         order by v.fecha_cliente desc, v.id desc
         limit $${parametros.length - 1} offset $${parametros.length}`,
        parametros
      );
      const ids = ventas.rows.map((venta) => venta.id);
      const filasItem = ids.length
        ? await client.query<ItemFila>(
            `select id, venta_id, producto_id, nombre, precio_unitario, cantidad, subtotal
             from venta_items
             where ($1::uuid is null or empresa_id = $1::uuid)
               and venta_id = any($2::uuid[])
             order by created_at asc, id asc`,
            [consulta.empresaId ?? null, ids]
          )
        : { rows: [] as ItemFila[] };
      const porVenta = new Map<string, ItemFila[]>();
      for (const item of filasItem.rows) {
        const lista = porVenta.get(item.venta_id) ?? [];
        lista.push(item);
        porVenta.set(item.venta_id, lista);
      }
      const total = ventas.rows.length ? Number(ventas.rows[0].total) : 0;
      const items = ventas.rows.map(({ total: _total, ...venta }) => ({
        ...venta,
        items: porVenta.get(venta.id) ?? [],
      }));
      return { items, total };
    });

    res.json({
      items: resultado.items,
      total: resultado.total,
      page: consulta.page,
      limit: consulta.limit,
    });
  })
);

adminOperacionRouter.post(
  '/ventas/:id/anular',
  asyncHandler(async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    const datos = anularSchema.parse(req.body);
    const motivo = `Panel admin: ${datos.motivo}`;

    const resultado = await withAdmin(async (client) => {
      const busqueda = await client.query<{
        empresa_id: string;
        anulada: boolean;
        turno_id: string | null;
      }>(
        `select v.empresa_id, v.anulada, v.turno_id
         from ventas v join empresas e on e.id = v.empresa_id
         where v.id = $1 and e.deleted_at is null`,
        [id]
      );
      if (!busqueda.rowCount) throw new ApiError(404, 'VENTA_NO_ENCONTRADA');
      const venta = busqueda.rows[0];
      if (venta.anulada) return { ventaId: id, anulada: true, idempotente: true };

      await client.query(
        `update ventas set
           anulada = true, motivo_anulacion = $2, anulada_en = now(),
           reembolso_efectivo = $3, reembolso_digital = $4, updated_at = now()
         where id = $1`,
        [id, motivo, datos.reembolsoEfectivo, datos.reembolsoDigital]
      );

      const items = await client.query<{ producto_id: string; cantidad: string }>(
        `select producto_id, cantidad from venta_items
         where empresa_id = $1 and venta_id = $2 and producto_id is not null`,
        [venta.empresa_id, id]
      );
      for (const item of items.rows) {
        const cantidad = Number(item.cantidad);
        await client.query(
          `insert into movimientos_inventario
             (empresa_id, producto_id, tipo, cantidad, referencia_tipo, referencia_id, turno_id)
           values ($1, $2, 'anulacion', $3, 'venta', $4, $5)`,
          [venta.empresa_id, item.producto_id, cantidad, id, venta.turno_id]
        );
        await client.query(
          `update productos set stock_actual = stock_actual + $2, version = version + 1
           where empresa_id = $1 and id = $3`,
          [venta.empresa_id, cantidad, item.producto_id]
        );
      }

      await auditar(req, client, {
        empresaId: venta.empresa_id,
        accion: 'venta.anulada',
        entidad: 'ventas',
        entidadId: id,
        payload: {
          motivo: datos.motivo,
          reembolsoEfectivo: datos.reembolsoEfectivo,
          reembolsoDigital: datos.reembolsoDigital,
        },
      });
      return { ventaId: id, anulada: true };
    });
    res.json(resultado);
  })
);

adminOperacionRouter.get(
  '/turnos',
  asyncHandler(async (req, res) => {
    const consulta = consultaLista(req);
    const parametros: unknown[] = [`%${consulta.q?.toLowerCase() ?? ''}%`];
    let filtro = `where e.deleted_at is null and lower(t.estado) like $1`;
    if (consulta.empresaId) {
      parametros.push(consulta.empresaId);
      filtro += ` and t.empresa_id = $${parametros.length}`;
    }
    parametros.push(consulta.limit, desplazamiento(consulta));
    const resultado = await withAdmin((client) =>
      client.query(
        `select t.id, t.empresa_id, e.nombre as empresa_nombre, t.dispositivo_id,
                t.usuario_id, t.apertura, t.cierre, t.estado, t.fondo_inicial,
                t.efectivo_esperado, t.total_esperado, t.dinero_real, t.diferencia,
                t.ventas_count, count(*) over()::int as total
         from turnos_caja t
         join empresas e on e.id = t.empresa_id
         ${filtro}
         order by t.apertura desc, t.id desc
         limit $${parametros.length - 1} offset $${parametros.length}`,
        parametros
      )
    );
    responderLista(res, resultado.rows, consulta);
  })
);

adminOperacionRouter.get(
  '/gastos',
  asyncHandler(async (req, res) => {
    const consulta = consultaLista(req);
    const parametros: unknown[] = [`%${consulta.q?.toLowerCase() ?? ''}%`];
    let filtro = `where g.deleted_at is null and e.deleted_at is null
                    and lower(g.concepto) like $1`;
    if (consulta.empresaId) {
      parametros.push(consulta.empresaId);
      filtro += ` and g.empresa_id = $${parametros.length}`;
    }
    parametros.push(consulta.limit, desplazamiento(consulta));
    const resultado = await withAdmin((client) =>
      client.query(
        `select g.id, g.empresa_id, e.nombre as empresa_nombre, g.categoria, g.concepto,
                g.monto, g.fecha, g.forma_pago, g.version, g.deleted_at,
                count(*) over()::int as total
         from gastos g
         join empresas e on e.id = g.empresa_id
         ${filtro}
         order by g.fecha desc, g.id desc
         limit $${parametros.length - 1} offset $${parametros.length}`,
        parametros
      )
    );
    responderLista(res, resultado.rows, consulta);
  })
);

adminOperacionRouter.get(
  '/movimientos-caja',
  asyncHandler(async (req, res) => {
    const consulta = consultaLista(req);
    const parametros: unknown[] = [`%${consulta.q?.toLowerCase() ?? ''}%`];
    let filtro = `where m.deleted_at is null and e.deleted_at is null
                    and lower(m.descripcion) like $1`;
    if (consulta.empresaId) {
      parametros.push(consulta.empresaId);
      filtro += ` and m.empresa_id = $${parametros.length}`;
    }
    parametros.push(consulta.limit, desplazamiento(consulta));
    const resultado = await withAdmin((client) =>
      client.query(
        `select m.id, m.empresa_id, e.nombre as empresa_nombre, m.turno_id, m.usuario_id,
                m.tipo, m.monto, m.descripcion, m.gasto_id, m.version, m.deleted_at,
                m.created_at, count(*) over()::int as total
         from movimientos_caja m
         join empresas e on e.id = m.empresa_id
         ${filtro}
         order by m.created_at desc, m.id desc
         limit $${parametros.length - 1} offset $${parametros.length}`,
        parametros
      )
    );
    responderLista(res, resultado.rows, consulta);
  })
);

adminOperacionRouter.get(
  '/conteos',
  asyncHandler(async (req, res) => {
    const consulta = consultaLista(req);
    const parametros: unknown[] = [`%${consulta.q?.toLowerCase() ?? ''}%`];
    let filtro = `where c.deleted_at is null and e.deleted_at is null
                    and (lower(c.motivo) like $1 or lower(p.nombre) like $1)`;
    if (consulta.empresaId) {
      parametros.push(consulta.empresaId);
      filtro += ` and c.empresa_id = $${parametros.length}`;
    }
    parametros.push(consulta.limit, desplazamiento(consulta));
    const resultado = await withAdmin((client) =>
      client.query(
        `select c.id, c.empresa_id, e.nombre as empresa_nombre, c.turno_id, c.producto_id,
                p.nombre as producto_nombre, c.cantidad_sistema, c.cantidad_contada,
                c.diferencia, c.motivo, c.usuario_id, c.created_at,
                count(*) over()::int as total
         from conteos_inventario c
         join empresas e on e.id = c.empresa_id
         join productos p on p.empresa_id = c.empresa_id and p.id = c.producto_id
         ${filtro}
         order by c.created_at desc, c.id desc
         limit $${parametros.length - 1} offset $${parametros.length}`,
        parametros
      )
    );
    responderLista(res, resultado.rows, consulta);
  })
);
