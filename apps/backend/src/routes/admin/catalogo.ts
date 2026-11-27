import { Router } from 'express';
import { z } from 'zod';
import { uuidSchema, MAX_MONTO, MAX_STOCK } from '@micaja/shared';
import type { PoolClient } from 'pg';
import { withAdmin } from '../../db';
import { requireAdmin } from '../../middleware/auth';
import { ApiError } from '../../middleware/errors';
import { asyncHandler } from '../../middleware/async-handler';
import {
  auditar,
  consultaLista,
  desplazamiento,
  exigirEmpresa,
  responderLista,
} from './common';

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const numeroSchema = z.number().finite();
const montoSchema = numeroSchema.min(0).max(MAX_MONTO);
const stockSchema = numeroSchema.min(0).max(MAX_STOCK);

const crearCategoriaSchema = z.object({
  empresaId: uuidSchema,
  nombre: z.string().trim().min(1).max(80),
  color: colorSchema.default('#E2E8F0'),
  orden: z.number().int().min(-1_000_000).max(1_000_000).default(0),
  activo: z.boolean().default(true),
});

const editarCategoriaSchema = z
  .object({
    nombre: z.string().trim().min(1).max(80).optional(),
    color: colorSchema.optional(),
    orden: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    activo: z.boolean().optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, 'SIN_CAMBIOS');

const crearProductoSchema = z.object({
  empresaId: uuidSchema,
  categoriaId: uuidSchema.nullable().optional(),
  nombre: z.string().trim().min(1).max(120),
  precio: montoSchema,
  costoUnitario: montoSchema.nullable().optional(),
  emoji: z.string().max(16).default('🍽️'),
  color: colorSchema.default('#0EA5E9'),
  imagen: z.string().max(2_000_000).nullable().optional(),
  orden: z.number().int().min(-1_000_000).max(1_000_000).default(0),
  activo: z.boolean().default(true),
  stockMinimo: stockSchema.default(0),
});

const editarProductoSchema = z
  .object({
    categoriaId: uuidSchema.nullable().optional(),
    nombre: z.string().trim().min(1).max(120).optional(),
    precio: montoSchema.optional(),
    costoUnitario: montoSchema.nullable().optional(),
    emoji: z.string().max(16).optional(),
    color: colorSchema.optional(),
    imagen: z.string().max(2_000_000).nullable().optional(),
    orden: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    activo: z.boolean().optional(),
    stockMinimo: stockSchema.optional(),
  })
  .refine((datos) => Object.keys(datos).length > 0, 'SIN_CAMBIOS');

const ajustarStockSchema = z.object({
  cantidad: numeroSchema.refine((valor) => valor !== 0, 'CANTIDAD_CERO'),
  motivo: z.string().trim().min(1).max(140).default('Ajuste desde el panel'),
});

interface FilaCategoria {
  id: string;
  empresa_id: string;
  nombre: string;
  color: string;
  orden: number;
  activo: boolean;
  version: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  total: number;
}

interface FilaProducto {
  id: string;
  empresa_id: string;
  categoria_id: string | null;
  nombre: string;
  precio: string;
  costo_unitario: string | null;
  emoji: string;
  color: string;
  imagen: string | null;
  orden: number;
  activo: boolean;
  stock_actual: string;
  stock_minimo: string;
  version: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  total: number;
}

async function exigirCategoria(
  client: PoolClient,
  empresaId: string,
  categoriaId: string
): Promise<void> {
  const categoria = await client.query(
    `select 1 from categorias where empresa_id = $1 and id = $2 and deleted_at is null`,
    [empresaId, categoriaId]
  );
  if (!categoria.rowCount) {
    throw new ApiError(422, 'CATEGORIA_INVALIDA', 'La categoría no pertenece al negocio.');
  }
}

export const adminCatalogoRouter = Router();

adminCatalogoRouter.use(requireAdmin);

adminCatalogoRouter.get(
  '/categorias',
  asyncHandler(async (req, res) => {
    const consulta = consultaLista(req);
    const parametros: unknown[] = [`%${consulta.q?.toLowerCase() ?? ''}%`];
    let filtro = `where deleted_at is null and lower(nombre) like $1`;
    if (consulta.empresaId) {
      parametros.push(consulta.empresaId);
      filtro += ` and empresa_id = $${parametros.length}`;
    }
    parametros.push(consulta.limit, desplazamiento(consulta));

    const resultado = await withAdmin((client) =>
      client.query<FilaCategoria>(
        `select id, empresa_id, nombre, color, orden, activo, version, created_at,
                updated_at, deleted_at, count(*) over()::int as total
         from categorias
         ${filtro}
         order by nombre asc, id asc
         limit $${parametros.length - 1} offset $${parametros.length}`,
        parametros
      )
    );
    responderLista(res, resultado.rows, consulta);
  })
);

adminCatalogoRouter.post(
  '/categorias',
  asyncHandler(async (req, res) => {
    const datos = crearCategoriaSchema.parse(req.body);
    const creada = await withAdmin(async (client) => {
      await exigirEmpresa(client, datos.empresaId);
      const categoria = await client.query<Omit<FilaCategoria, 'total'>>(
        `insert into categorias (empresa_id, nombre, color, orden, activo)
         values ($1, $2, $3, $4, $5)
         returning id, empresa_id, nombre, color, orden, activo, version,
                   created_at, updated_at, deleted_at`,
        [datos.empresaId, datos.nombre, datos.color, datos.orden, datos.activo]
      );
      await auditar(req, client, {
        empresaId: datos.empresaId,
        accion: 'categoria.creada',
        entidad: 'categorias',
        entidadId: categoria.rows[0].id,
        payload: { nombre: datos.nombre },
      });
      return categoria.rows[0];
    });
    res.status(201).json({ categoria: creada });
  })
);

adminCatalogoRouter.patch(
  '/categorias/:id',
  asyncHandler(async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    const datos = editarCategoriaSchema.parse(req.body);
    const actualizada = await withAdmin(async (client) => {
      const actual = await client.query<{ empresa_id: string }>(
        `select empresa_id from categorias where id = $1 and deleted_at is null`,
        [id]
      );
      if (!actual.rowCount) throw new ApiError(404, 'CATEGORIA_NO_ENCONTRADA');
      const categoria = await client.query<Omit<FilaCategoria, 'total'>>(
        `update categorias set
           nombre = coalesce($2, nombre),
           color = coalesce($3, color),
           orden = coalesce($4, orden),
           activo = coalesce($5, activo),
           version = version + 1
         where id = $1 and deleted_at is null
         returning id, empresa_id, nombre, color, orden, activo, version,
                   created_at, updated_at, deleted_at`,
        [id, datos.nombre ?? null, datos.color ?? null, datos.orden ?? null, datos.activo ?? null]
      );
      await auditar(req, client, {
        empresaId: actual.rows[0].empresa_id,
        accion: 'categoria.actualizada',
        entidad: 'categorias',
        entidadId: id,
        payload: datos,
      });
      return categoria.rows[0];
    });
    res.json({ categoria: actualizada });
  })
);

adminCatalogoRouter.delete(
  '/categorias/:id',
  asyncHandler(async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    await withAdmin(async (client) => {
      const actual = await client.query<{ empresa_id: string }>(
        `select empresa_id from categorias where id = $1 and deleted_at is null`,
        [id]
      );
      if (!actual.rowCount) throw new ApiError(404, 'CATEGORIA_NO_ENCONTRADA');
      await client.query(
        `update categorias set deleted_at = now(), activo = false, version = version + 1
         where id = $1`,
        [id]
      );
      await auditar(req, client, {
        empresaId: actual.rows[0].empresa_id,
        accion: 'categoria.eliminada',
        entidad: 'categorias',
        entidadId: id,
      });
    });
    res.status(204).end();
  })
);

adminCatalogoRouter.get(
  '/productos',
  asyncHandler(async (req, res) => {
    const consulta = consultaLista(req);
    const parametros: unknown[] = [`%${consulta.q?.toLowerCase() ?? ''}%`];
    let filtro = `where deleted_at is null and lower(nombre) like $1`;
    if (consulta.empresaId) {
      parametros.push(consulta.empresaId);
      filtro += ` and empresa_id = $${parametros.length}`;
    }
    parametros.push(consulta.limit, desplazamiento(consulta));

    const resultado = await withAdmin((client) =>
      client.query<FilaProducto>(
        `select id, empresa_id, categoria_id, nombre, precio, costo_unitario, emoji, color,
                imagen, orden, activo, stock_actual, stock_minimo, version,
                created_at, updated_at, deleted_at, count(*) over()::int as total
         from productos
         ${filtro}
         order by nombre asc, id asc
         limit $${parametros.length - 1} offset $${parametros.length}`,
        parametros
      )
    );
    responderLista(res, resultado.rows, consulta);
  })
);

adminCatalogoRouter.post(
  '/productos',
  asyncHandler(async (req, res) => {
    const datos = crearProductoSchema.parse(req.body);
    const creado = await withAdmin(async (client) => {
      await exigirEmpresa(client, datos.empresaId);
      if (datos.categoriaId) await exigirCategoria(client, datos.empresaId, datos.categoriaId);
      const producto = await client.query<Omit<FilaProducto, 'total'>>(
        `insert into productos
           (empresa_id, categoria_id, nombre, precio, costo_unitario, emoji, color,
            imagen, orden, activo, stock_minimo)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         returning id, empresa_id, categoria_id, nombre, precio, costo_unitario, emoji,
                   color, imagen, orden, activo, stock_actual, stock_minimo, version,
                   created_at, updated_at, deleted_at`,
        [
          datos.empresaId,
          datos.categoriaId ?? null,
          datos.nombre,
          datos.precio,
          datos.costoUnitario ?? null,
          datos.emoji,
          datos.color,
          datos.imagen ?? null,
          datos.orden,
          datos.activo,
          datos.stockMinimo,
        ]
      );
      await auditar(req, client, {
        empresaId: datos.empresaId,
        accion: 'producto.creado',
        entidad: 'productos',
        entidadId: producto.rows[0].id,
        payload: { nombre: datos.nombre, precio: datos.precio },
      });
      return producto.rows[0];
    });
    res.status(201).json({ producto: creado });
  })
);

adminCatalogoRouter.patch(
  '/productos/:id',
  asyncHandler(async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    const datos = editarProductoSchema.parse(req.body);
    const actualizado = await withAdmin(async (client) => {
      const actual = await client.query<{ empresa_id: string }>(
        `select empresa_id from productos where id = $1 and deleted_at is null`,
        [id]
      );
      if (!actual.rowCount) throw new ApiError(404, 'PRODUCTO_NO_ENCONTRADO');
      if (datos.categoriaId) {
        await exigirCategoria(client, actual.rows[0].empresa_id, datos.categoriaId);
      }
      const producto = await client.query<Omit<FilaProducto, 'total'>>(
        `update productos set
           categoria_id = coalesce($2, categoria_id),
           nombre = coalesce($3, nombre),
           precio = coalesce($4, precio),
           costo_unitario = coalesce($5, costo_unitario),
           emoji = coalesce($6, emoji),
           color = coalesce($7, color),
           imagen = coalesce($8, imagen),
           orden = coalesce($9, orden),
           activo = coalesce($10, activo),
           stock_minimo = coalesce($11, stock_minimo),
           version = version + 1
         where id = $1 and deleted_at is null
         returning id, empresa_id, categoria_id, nombre, precio, costo_unitario, emoji,
                   color, imagen, orden, activo, stock_actual, stock_minimo, version,
                   created_at, updated_at, deleted_at`,
        [
          id,
          datos.categoriaId ?? null,
          datos.nombre ?? null,
          datos.precio ?? null,
          datos.costoUnitario ?? null,
          datos.emoji ?? null,
          datos.color ?? null,
          datos.imagen ?? null,
          datos.orden ?? null,
          datos.activo ?? null,
          datos.stockMinimo ?? null,
        ]
      );
      await auditar(req, client, {
        empresaId: actual.rows[0].empresa_id,
        accion: 'producto.actualizado',
        entidad: 'productos',
        entidadId: id,
        payload: datos,
      });
      return producto.rows[0];
    });
    res.json({ producto: actualizado });
  })
);

adminCatalogoRouter.delete(
  '/productos/:id',
  asyncHandler(async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    await withAdmin(async (client) => {
      const actual = await client.query<{ empresa_id: string }>(
        `select empresa_id from productos where id = $1 and deleted_at is null`,
        [id]
      );
      if (!actual.rowCount) throw new ApiError(404, 'PRODUCTO_NO_ENCONTRADO');
      await client.query(
        `update productos set deleted_at = now(), activo = false, version = version + 1
         where id = $1`,
        [id]
      );
      await auditar(req, client, {
        empresaId: actual.rows[0].empresa_id,
        accion: 'producto.eliminado',
        entidad: 'productos',
        entidadId: id,
      });
    });
    res.status(204).end();
  })
);

adminCatalogoRouter.post(
  '/productos/:id/ajustar-stock',
  asyncHandler(async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    const datos = ajustarStockSchema.parse(req.body);
    const resultado = await withAdmin(async (client) => {
      const producto = await client.query<{
        empresa_id: string;
        stock_actual: string;
        version: number;
      }>(
        `select empresa_id, stock_actual, version from productos
         where id = $1 and deleted_at is null`,
        [id]
      );
      if (!producto.rowCount) throw new ApiError(404, 'PRODUCTO_NO_ENCONTRADO');
      const fila = producto.rows[0];
      const stockFinal = Number(fila.stock_actual) + datos.cantidad;
      if (stockFinal < 0 || stockFinal > MAX_STOCK) {
        throw new ApiError(422, 'STOCK_FUERA_DE_RANGO', 'El ajuste deja un stock inválido.');
      }

      await client.query(
        `insert into movimientos_inventario
           (empresa_id, producto_id, tipo, cantidad, referencia_tipo, referencia_id)
         values ($1, $2, 'ajuste', $3, 'admin', null)`,
        [fila.empresa_id, id, datos.cantidad]
      );
      await client.query(
        `update productos set stock_actual = $2, version = version + 1
         where id = $1`,
        [id, stockFinal]
      );
      await auditar(req, client, {
        empresaId: fila.empresa_id,
        accion: 'producto.stock_ajustado',
        entidad: 'productos',
        entidadId: id,
        payload: { cantidad: datos.cantidad, motivo: datos.motivo, stockFinal },
      });
      return { id, stockActual: stockFinal, version: fila.version + 1 };
    });
    res.json(resultado);
  })
);
