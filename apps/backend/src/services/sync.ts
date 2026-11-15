import type { PoolClient } from 'pg';
import { z } from 'zod';
import { uuidSchema, ventaInputSchema } from '@micaja/shared';
import { ApiError } from '../middleware/errors';

const anulacionSchema = z.object({
  ventaId: uuidSchema,
  usuarioId: uuidSchema,
  motivo: z.string().trim().max(200).optional(),
});

const movimientoSchema = z.object({
  movimientoId: uuidSchema,
  productoId: uuidSchema,
  tipo: z.enum(['inicial', 'entrada', 'salida', 'ajuste']),
  cantidad: z.number().finite().refine((valor) => valor !== 0, 'CANTIDAD_CERO'),
  referenciaTipo: z.string().trim().max(50).optional(),
  referenciaId: uuidSchema.optional(),
});

const turnoAperturaSchema = z.object({
  turnoId: uuidSchema,
  usuarioId: uuidSchema,
  apertura: z.string().datetime(),
  fondoInicial: z.number().min(0).default(0),
  desglose: z.record(z.number()).default({}),
});

const turnoCierreSchema = z.object({
  turnoId: uuidSchema,
  cierre: z.string().datetime(),
  ventasCount: z.number().int().min(0),
  totalEsperado: z.number().min(0),
  desglose: z.record(z.number()).default({}),
  dineroReal: z.number().min(0),
  diferencia: z.number(),
});

const productoUpsertSchema = z.object({
  id: uuidSchema,
  categoriaId: uuidSchema.nullable().optional(),
  nombre: z.string().trim().min(1).max(120),
  precio: z.number().min(0),
  emoji: z.string().max(16).default('🍽️'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0EA5E9'),
  imagen: z.string().max(2_000_000).nullable().optional(),
  orden: z.number().int().default(0),
  activo: z.boolean().default(true),
  /**
   * Stock absoluto que el cliente ya compensó con sus operaciones pendientes.
   * Si no viene (clientes viejos), el stock se mantiene como esté.
   */
  stock: z.number().min(0).optional(),
  stockMinimo: z.number().min(0).default(0),
  version: z.number().int().min(1),
  deletedAt: z.string().datetime().nullable().optional(),
});

const categoriaUpsertSchema = z.object({
  id: uuidSchema,
  nombre: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#E2E8F0'),
  orden: z.number().int().default(0),
  activo: z.boolean().default(true),
  version: z.number().int().min(1),
  deletedAt: z.string().datetime().nullable().optional(),
});

const usuarioUpsertSchema = z.object({
  id: uuidSchema,
  nombre: z.string().trim().min(1).max(120),
  usuario: z.string().trim().min(3).max(40),
  rol: z.enum(['propietario', 'admin', 'dependiente']).default('dependiente'),
  activo: z.boolean().default(true),
  version: z.number().int().min(1),
  deletedAt: z.string().datetime().nullable().optional(),
});

const settingsUpsertSchema = z.object({
  clave: z.string().trim().min(1).max(80),
  valor: z.unknown(),
  version: z.number().int().min(1),
});

export interface OperacionInput {
  empresaId: string;
  deviceId: string;
  tipo: string;
  payload: unknown;
}

function redondear(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

async function aplicarVenta(
  client: PoolClient,
  empresaId: string,
  deviceId: string,
  payload: unknown
): Promise<unknown> {
  const data = ventaInputSchema.parse(payload);

  const existente = await client.query<{ id: string; numero: string }>(
    `select id, numero from ventas
     where empresa_id = $1 and dispositivo_id = $2 and local_id = $3`,
    [empresaId, deviceId, data.localId]
  );
  if (existente.rowCount) {
    return {
      ventaId: existente.rows[0].id,
      numero: Number(existente.rows[0].numero),
      idempotente: true,
    };
  }

  const subtotal = redondear(data.items.reduce((suma, item) => suma + item.subtotal, 0));
  if (Math.abs(subtotal - data.subtotal) > 0.01) {
    throw new ApiError(422, 'SUBTOTAL_INCONSISTENTE');
  }

  const total = redondear(data.subtotal * (1 - data.descuentoPct / 100));
  if (Math.abs(total - data.total) > 0.01) {
    throw new ApiError(422, 'TOTAL_INCONSISTENTE');
  }

  const contador = await client.query<{ valor: string }>(
    `insert into contadores (empresa_id, nombre, valor)
     values ($1, 'ventas', 1)
     on conflict (empresa_id, nombre)
     do update set valor = contadores.valor + 1, updated_at = now()
     returning valor`,
    [empresaId]
  );
  const numero = Number(contador.rows[0].valor);

  const venta = await client.query<{ id: string }>(
    `insert into ventas
       (empresa_id, dispositivo_id, usuario_id, turno_id, local_id, numero,
        fecha_cliente, subtotal, descuento_pct, total, forma_pago,
        monto_efectivo, monto_digital)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     returning id`,
    [
      empresaId,
      deviceId,
      data.usuarioId,
      data.turnoId ?? null,
      data.localId,
      numero,
      data.fechaCliente,
      data.subtotal,
      data.descuentoPct,
      data.total,
      data.formaPago,
      data.montoEfectivo,
      data.montoDigital,
    ]
  );
  const ventaId = venta.rows[0].id;

  for (const item of data.items) {
    await client.query(
      `insert into venta_items
         (empresa_id, venta_id, producto_id, nombre, precio_unitario, cantidad, subtotal)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        empresaId,
        ventaId,
        item.productoId ?? null,
        item.nombre,
        item.precioUnitario,
        item.cantidad,
        item.subtotal,
      ]
    );

    if (item.productoId) {
      await client.query(
        `insert into movimientos_inventario
           (empresa_id, producto_id, tipo, cantidad, referencia_tipo, referencia_id,
            usuario_id, dispositivo_id)
         values ($1, $2, 'venta', $3, 'venta', $4, $5, $6)`,
        [empresaId, item.productoId, -item.cantidad, ventaId, data.usuarioId, deviceId]
      );
      await client.query(
        `update productos
         set stock_actual = stock_actual - $3, version = version + 1, updated_at = now()
         where empresa_id = $1 and id = $2`,
        [empresaId, item.productoId, item.cantidad]
      );
    }
  }

  return { ventaId, numero, total };
}

async function aplicarAnulacion(
  client: PoolClient,
  empresaId: string,
  deviceId: string,
  payload: unknown
): Promise<unknown> {
  const data = anulacionSchema.parse(payload);

  const venta = await client.query<{ id: string; anulada: boolean }>(
    `select id, anulada from ventas
     where empresa_id = $1
       and (id = $2 or (dispositivo_id = $3 and local_id = $2))`,
    [empresaId, data.ventaId, deviceId]
  );
  if (!venta.rowCount) {
    throw new ApiError(404, 'VENTA_NO_ENCONTRADA');
  }
  const ventaId = venta.rows[0].id;
  if (venta.rows[0].anulada) {
    return { ventaId, idempotente: true };
  }

  await client.query(
    `update ventas
     set anulada = true, motivo_anulacion = $3, anulada_por = $4, anulada_en = now(),
         updated_at = now()
     where empresa_id = $1 and id = $2`,
    [empresaId, ventaId, data.motivo ?? null, data.usuarioId]
  );

  const items = await client.query<{ producto_id: string; cantidad: string }>(
    `select producto_id, cantidad from venta_items
     where empresa_id = $1 and venta_id = $2 and producto_id is not null`,
    [empresaId, ventaId]
  );

  for (const item of items.rows) {
    const cantidad = Number(item.cantidad);
    await client.query(
      `insert into movimientos_inventario
         (empresa_id, producto_id, tipo, cantidad, referencia_tipo, referencia_id,
          usuario_id, dispositivo_id)
       values ($1, $2, 'anulacion', $3, 'venta', $4, $5, $6)`,
      [empresaId, item.producto_id, cantidad, ventaId, data.usuarioId, deviceId]
    );
    await client.query(
      `update productos
       set stock_actual = stock_actual + $3, version = version + 1, updated_at = now()
       where empresa_id = $1 and id = $2`,
      [empresaId, item.producto_id, cantidad]
    );
  }

  return { ventaId, anulada: true };
}

async function aplicarMovimiento(
  client: PoolClient,
  empresaId: string,
  deviceId: string,
  payload: unknown
): Promise<unknown> {
  const data = movimientoSchema.parse(payload);
  const cantidad =
    data.tipo === 'salida'
      ? -Math.abs(data.cantidad)
      : data.tipo === 'ajuste'
        ? data.cantidad
        : Math.abs(data.cantidad);

  const insertado = await client.query(
    `insert into movimientos_inventario
       (id, empresa_id, producto_id, tipo, cantidad, referencia_tipo, referencia_id,
        dispositivo_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (id) do nothing
     returning id`,
    [
      data.movimientoId,
      empresaId,
      data.productoId,
      data.tipo,
      cantidad,
      data.referenciaTipo ?? null,
      data.referenciaId ?? null,
      deviceId,
    ]
  );
  if (!insertado.rowCount) {
    return { movimientoId: data.movimientoId, idempotente: true };
  }

  await client.query(
    `update productos
     set stock_actual = stock_actual + $3, version = version + 1, updated_at = now()
     where empresa_id = $1 and id = $2`,
    [empresaId, data.productoId, cantidad]
  );

  return { movimientoId: data.movimientoId, cantidad };
}

async function aplicarTurnoApertura(
  client: PoolClient,
  empresaId: string,
  deviceId: string,
  payload: unknown
): Promise<unknown> {
  const data = turnoAperturaSchema.parse(payload);
  const insertado = await client.query(
    `insert into turnos_caja
       (id, empresa_id, dispositivo_id, usuario_id, apertura, fondo_inicial, desglose, estado)
     values ($1, $2, $3, $4, $5, $6, $7, 'abierto')
     on conflict (id) do nothing
     returning id`,
    [
      data.turnoId,
      empresaId,
      deviceId,
      data.usuarioId,
      data.apertura,
      data.fondoInicial,
      JSON.stringify(data.desglose),
    ]
  );
  if (!insertado.rowCount) {
    return { turnoId: data.turnoId, idempotente: true };
  }
  return { turnoId: data.turnoId, estado: 'abierto' };
}

async function aplicarTurnoCierre(
  client: PoolClient,
  empresaId: string,
  payload: unknown
): Promise<unknown> {
  const data = turnoCierreSchema.parse(payload);
  const actualizado = await client.query(
    `update turnos_caja
     set cierre = $3, estado = 'cerrado', ventas_count = $4, total_esperado = $5,
         desglose = $6, dinero_real = $7, diferencia = $8, updated_at = now()
     where empresa_id = $1 and id = $2 and estado = 'abierto'
     returning id`,
    [
      empresaId,
      data.turnoId,
      data.cierre,
      data.ventasCount,
      data.totalEsperado,
      JSON.stringify(data.desglose),
      data.dineroReal,
      data.diferencia,
    ]
  );
  if (actualizado.rowCount) {
    return { turnoId: data.turnoId, estado: 'cerrado' };
  }

  const existente = await client.query<{ estado: string }>(
    `select estado from turnos_caja where empresa_id = $1 and id = $2`,
    [empresaId, data.turnoId]
  );
  if (existente.rowCount && existente.rows[0].estado === 'cerrado') {
    return { turnoId: data.turnoId, estado: 'cerrado', idempotente: true };
  }
  throw new ApiError(404, 'TURNO_NO_ENCONTRADO');
}

async function aplicarProductoUpsert(
  client: PoolClient,
  empresaId: string,
  payload: unknown
): Promise<unknown> {
  const data = productoUpsertSchema.parse(payload);
  const conStock = data.stock !== undefined;
  const resultado = await client.query<{ id: string; version: number }>(
    `insert into productos
       (id, empresa_id, categoria_id, nombre, precio, emoji, color, imagen, orden,
        activo, stock_actual, stock_minimo, version, deleted_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     on conflict (empresa_id, id) do update set
       categoria_id = excluded.categoria_id,
       nombre = excluded.nombre,
       precio = excluded.precio,
       emoji = excluded.emoji,
       color = excluded.color,
       imagen = excluded.imagen,
       orden = excluded.orden,
       activo = excluded.activo,
       stock_actual = case when $15 then excluded.stock_actual
                           else productos.stock_actual end,
       stock_minimo = excluded.stock_minimo,
       version = excluded.version,
       deleted_at = excluded.deleted_at,
       updated_at = now()
     where excluded.version >= productos.version
     returning id, version`,
    [
      data.id,
      empresaId,
      data.categoriaId ?? null,
      data.nombre,
      data.precio,
      data.emoji,
      data.color,
      data.imagen ?? null,
      data.orden,
      data.activo,
      data.stock ?? 0,
      data.stockMinimo,
      data.version,
      data.deletedAt ?? null,
      conStock,
    ]
  );
  if (!resultado.rowCount) {
    const actual = await client.query<{ id: string; version: number }>(
      `select id, version from productos where empresa_id = $1 and id = $2`,
      [empresaId, data.id]
    );
    return { id: data.id, ignorado: true, actual: actual.rows[0] ?? null };
  }
  return resultado.rows[0];
}

async function aplicarCategoriaUpsert(
  client: PoolClient,
  empresaId: string,
  payload: unknown
): Promise<unknown> {
  const data = categoriaUpsertSchema.parse(payload);
  const resultado = await client.query<{ id: string; version: number }>(
    `insert into categorias
       (id, empresa_id, nombre, color, orden, activo, version, deleted_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (empresa_id, id) do update set
       nombre = excluded.nombre,
       color = excluded.color,
       orden = excluded.orden,
       activo = excluded.activo,
       version = excluded.version,
       deleted_at = excluded.deleted_at,
       updated_at = now()
     where excluded.version >= categorias.version
     returning id, version`,
    [
      data.id,
      empresaId,
      data.nombre,
      data.color,
      data.orden,
      data.activo,
      data.version,
      data.deletedAt ?? null,
    ]
  );
  if (!resultado.rowCount) {
    const actual = await client.query<{ id: string; version: number }>(
      `select id, version from categorias where empresa_id = $1 and id = $2`,
      [empresaId, data.id]
    );
    return { id: data.id, ignorado: true, actual: actual.rows[0] ?? null };
  }
  return resultado.rows[0];
}

async function aplicarUsuarioUpsert(
  client: PoolClient,
  empresaId: string,
  payload: unknown
): Promise<unknown> {
  const data = usuarioUpsertSchema.parse(payload);
  const resultado = await client.query<{ id: string; version: number }>(
    `insert into usuarios
       (id, empresa_id, nombre, usuario, rol, activo, version, deleted_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (empresa_id, id) do update set
       nombre = excluded.nombre,
       usuario = excluded.usuario,
       rol = excluded.rol,
       activo = excluded.activo,
       version = excluded.version,
       deleted_at = excluded.deleted_at,
       updated_at = now()
     where excluded.version >= usuarios.version
     returning id, version`,
    [
      data.id,
      empresaId,
      data.nombre,
      data.usuario,
      data.rol,
      data.activo,
      data.version,
      data.deletedAt ?? null,
    ]
  );
  if (!resultado.rowCount) {
    const actual = await client.query<{ id: string; version: number }>(
      `select id, version from usuarios where empresa_id = $1 and id = $2`,
      [empresaId, data.id]
    );
    return { id: data.id, ignorado: true, actual: actual.rows[0] ?? null };
  }
  return resultado.rows[0];
}

async function aplicarSettingsUpsert(
  client: PoolClient,
  empresaId: string,
  payload: unknown
): Promise<unknown> {
  const data = settingsUpsertSchema.parse(payload);
  const resultado = await client.query<{ clave: string; version: number }>(
    `insert into settings (empresa_id, clave, valor, version)
     values ($1, $2, $3, $4)
     on conflict (empresa_id, clave) do update set
       valor = excluded.valor,
       version = excluded.version,
       updated_at = now()
     where excluded.version >= settings.version
     returning clave, version`,
    [empresaId, data.clave, JSON.stringify(data.valor), data.version]
  );
  if (!resultado.rowCount) {
    const actual = await client.query<{ clave: string; version: number }>(
      `select clave, version from settings where empresa_id = $1 and clave = $2`,
      [empresaId, data.clave]
    );
    return { clave: data.clave, ignorado: true, actual: actual.rows[0] ?? null };
  }
  return resultado.rows[0];
}

export async function aplicarOperacion(
  client: PoolClient,
  input: OperacionInput
): Promise<unknown> {
  switch (input.tipo) {
    case 'venta':
      return aplicarVenta(client, input.empresaId, input.deviceId, input.payload);
    case 'anulacion':
      return aplicarAnulacion(client, input.empresaId, input.deviceId, input.payload);
    case 'movimiento_inventario':
      return aplicarMovimiento(client, input.empresaId, input.deviceId, input.payload);
    case 'turno_apertura':
      return aplicarTurnoApertura(client, input.empresaId, input.deviceId, input.payload);
    case 'turno_cierre':
      return aplicarTurnoCierre(client, input.empresaId, input.payload);
    case 'producto_upsert':
      return aplicarProductoUpsert(client, input.empresaId, input.payload);
    case 'categoria_upsert':
      return aplicarCategoriaUpsert(client, input.empresaId, input.payload);
    case 'usuario_upsert':
      return aplicarUsuarioUpsert(client, input.empresaId, input.payload);
    case 'settings_upsert':
      return aplicarSettingsUpsert(client, input.empresaId, input.payload);
    default:
      throw new ApiError(422, 'TIPO_OPERACION_DESCONOCIDO', input.tipo);
  }
}
