import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  conteoInventarioInputSchema,
  gastoInputSchema,
  movimientoCajaInputSchema,
  uuidSchema,
  ventaInputSchema,
} from '@micaja/shared';
import { ApiError } from '../middleware/errors';

/** Claves de settings que el servidor acepta y entrega a los dispositivos. */
export const SETTINGS_SINCRONIZABLES = [
  'nombre_negocio',
  'moneda',
  'simbolo_moneda',
] as const;

const settingsSincronizablesSchema = z.enum(SETTINGS_SINCRONIZABLES);

/**
 * Límites alineados con las columnas `numeric(14,2)` / `numeric(14,3)` de
 * Postgres. Sin ellos un payload absurdo desbordaría la columna y la
 * operación acabaría en un 500 en vez de un rechazo claro.
 */
const MAX_MONTO = 100_000_000_000;
const MAX_CANTIDAD = 1_000_000;
const MAX_STOCK = 100_000_000;
const MAX_VERSION = 2_147_483_647;

const numeroFinito = z.number().finite();
const montoSchema = numeroFinito.min(0).max(MAX_MONTO);
const versionSchema = z.number().int().min(1).max(MAX_VERSION);
const desgloseSchema = z
  .record(numeroFinito.min(0).max(MAX_MONTO))
  .default({});

const anulacionSchema = z.object({
  ventaId: uuidSchema,
  usuarioId: uuidSchema,
  motivo: z.string().trim().max(200).optional(),
  reembolsoEfectivo: montoSchema.default(0),
  reembolsoDigital: montoSchema.default(0),
});

const movimientoSchema = z.object({
  movimientoId: uuidSchema,
  productoId: uuidSchema,
  tipo: z.enum(['inicial', 'entrada', 'salida', 'ajuste']),
  cantidad: numeroFinito
    .refine((valor) => valor !== 0, 'CANTIDAD_CERO')
    .refine((valor) => Math.abs(valor) <= MAX_CANTIDAD, 'CANTIDAD_FUERA_DE_RANGO'),
  referenciaTipo: z.string().trim().max(50).optional(),
  referenciaId: uuidSchema.optional(),
});

const turnoAperturaSchema = z.object({
  turnoId: uuidSchema,
  usuarioId: uuidSchema,
  apertura: z.string().datetime(),
  fondoInicial: montoSchema.default(0),
  desglose: desgloseSchema,
});

const turnoCierreSchema = z.object({
  turnoId: uuidSchema,
  cierre: z.string().datetime(),
  ventasCount: z.number().int().min(0).max(MAX_CANTIDAD),
  totalEsperado: montoSchema,
  desglose: desgloseSchema,
  dineroReal: montoSchema,
  diferencia: numeroFinito.min(-MAX_MONTO).max(MAX_MONTO),
  efectivoEsperado: montoSchema.default(0),
  observacion: z.string().trim().max(200).nullable().optional(),
});

const productoUpsertSchema = z.object({
  id: uuidSchema,
  categoriaId: uuidSchema.nullable().optional(),
  nombre: z.string().trim().min(1).max(120),
  precio: montoSchema,
  emoji: z.string().max(16).default('🍽️'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0EA5E9'),
  imagen: z.string().max(2_000_000).nullable().optional(),
  orden: z.number().int().min(-1_000_000).max(1_000_000).default(0),
  activo: z.boolean().default(true),
  /**
   * Stock absoluto que el cliente ya compensó con sus operaciones pendientes.
   * Si no viene (clientes viejos), el stock se mantiene como esté.
   */
  stock: numeroFinito.min(0).max(MAX_STOCK).optional(),
  costoUnitario: montoSchema.nullable().optional(),
  stockMinimo: numeroFinito.min(0).max(MAX_STOCK).default(0),
  version: versionSchema,
  deletedAt: z.string().datetime().nullable().optional(),
});

const categoriaUpsertSchema = z.object({
  id: uuidSchema,
  nombre: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#E2E8F0'),
  orden: z.number().int().min(-1_000_000).max(1_000_000).default(0),
  activo: z.boolean().default(true),
  version: versionSchema,
  deletedAt: z.string().datetime().nullable().optional(),
});

const pinHashSchema = z
  .string()
  .regex(
    /^(?:sha256it\$\d{1,6}\$[0-9a-f]{32}\$[0-9a-f]{64}|sha256\$[0-9a-f]{32}\$[0-9a-f]{64})$/,
    'PIN_HASH_INVALIDO'
  );

const usuarioUpsertSchema = z.object({
  id: uuidSchema,
  nombre: z.string().trim().min(1).max(120),
  usuario: z.string().trim().min(3).max(40),
  rol: z.enum(['propietario', 'admin', 'dependiente']).default('dependiente'),
  activo: z.boolean().default(true),
  /** Hash del PIN que produce la app. Nunca se devuelve en el pull. */
  pinHash: pinHashSchema.optional(),
  version: versionSchema,
  deletedAt: z.string().datetime().nullable().optional(),
});

const settingsUpsertSchema = z.object({
  clave: settingsSincronizablesSchema,
  valor: z.unknown(),
  version: versionSchema,
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

type RolDispositivo = 'propietario' | 'admin' | 'dependiente';

async function rolDispositivo(
  client: PoolClient,
  empresaId: string,
  deviceId: string
): Promise<RolDispositivo> {
  const fila = await client.query<{ rol: RolDispositivo }>(
    `select rol::text as rol from dispositivos where empresa_id = $1 and id = $2`,
    [empresaId, deviceId]
  );
  if (!fila.rowCount) {
    throw new ApiError(404, 'DISPOSITIVO_NO_ENCONTRADO');
  }
  return fila.rows[0].rol;
}

/**
 * Comprueba que una referencia del payload pertenece al negocio del token.
 * Sin esto, un id de otro tenant termina en un error de llave foránea (500)
 * o, peor, en una escritura cruzada si la FK no existe.
 */
async function exigirUsuarioDeEmpresa(
  client: PoolClient,
  empresaId: string,
  usuarioId: string
): Promise<void> {
  const fila = await client.query(
    `select 1 from usuarios where empresa_id = $1 and id = $2`,
    [empresaId, usuarioId]
  );
  if (!fila.rowCount) {
    throw new ApiError(422, 'USUARIO_INVALIDO', 'El usuario no pertenece a este negocio.');
  }
}

async function exigirCategoriaDeEmpresa(
  client: PoolClient,
  empresaId: string,
  categoriaId: string
): Promise<void> {
  const fila = await client.query(
    `select 1 from categorias where empresa_id = $1 and id = $2`,
    [empresaId, categoriaId]
  );
  if (!fila.rowCount) {
    throw new ApiError(422, 'CATEGORIA_INVALIDA', 'La categoría no pertenece a este negocio.');
  }
}

async function exigirProductosDeEmpresa(
  client: PoolClient,
  empresaId: string,
  productoIds: string[]
): Promise<void> {
  if (productoIds.length === 0) return;
  const filas = await client.query<{ id: string }>(
    `select id from productos where empresa_id = $1 and id = any($2::uuid[])`,
    [empresaId, productoIds]
  );
  const existentes = new Set(filas.rows.map((fila) => fila.id));
  const faltantes = productoIds.filter((id) => !existentes.has(id));
  if (faltantes.length > 0) {
    throw new ApiError(422, 'PRODUCTO_INVALIDO', 'El producto no pertenece a este negocio.', {
      ids: faltantes,
    });
  }
}

async function aplicarVenta(
  client: PoolClient,
  empresaId: string,
  deviceId: string,
  payload: unknown
): Promise<unknown> {
  const data = ventaInputSchema.parse(payload);

  await exigirUsuarioDeEmpresa(client, empresaId, data.usuarioId);
  if (data.turnoId) {
    const turno = await client.query<{ dispositivo_id: string }>(
      `select dispositivo_id from turnos_caja where empresa_id = $1 and id = $2`,
      [empresaId, data.turnoId]
    );
    if (!turno.rowCount) {
      throw new ApiError(422, 'TURNO_INVALIDO', 'El turno no pertenece a este negocio.');
    }
    // Una venta pertenece a la caja de la terminal que la registró. Si otra
    // terminal mete ventas en un turno ajeno, el cierre de caja de la víctima
    // descuadra sin que nadie haya tocado su teléfono.
    if (turno.rows[0].dispositivo_id !== deviceId) {
      throw new ApiError(
        403,
        'TURNO_OTRO_DISPOSITIVO',
        'Solo el dispositivo que abrió el turno puede registrar ventas en él.'
      );
    }
  }
  const productosVendidos = [
    ...new Set(
      data.items
        .map((item) => item.productoId)
        .filter((id): id is string => typeof id === 'string')
    ),
  ];
  await exigirProductosDeEmpresa(client, empresaId, productosVendidos);

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
          (empresa_id, venta_id, producto_id, nombre, precio_unitario, costo_unitario,
           cantidad, subtotal)
        values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        empresaId,
        ventaId,
        item.productoId ?? null,
        item.nombre,
        item.precioUnitario,
        item.costoUnitario ?? null,
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
  await exigirUsuarioDeEmpresa(client, empresaId, data.usuarioId);

  const venta = await client.query<{ id: string; anulada: boolean; turno_id: string | null }>(
    `select id, anulada, turno_id from ventas
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
          reembolso_efectivo = $5, reembolso_digital = $6, updated_at = now()
      where empresa_id = $1 and id = $2`,
     [
       empresaId,
       ventaId,
       data.motivo ?? null,
       data.usuarioId,
       data.reembolsoEfectivo,
       data.reembolsoDigital,
     ]
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
          usuario_id, dispositivo_id, turno_id)
       values ($1, $2, 'anulacion', $3, 'venta', $4, $5, $6, $7)`,
      [
        empresaId,
        item.producto_id,
        cantidad,
        ventaId,
        data.usuarioId,
        deviceId,
        venta.rows[0].turno_id,
      ]
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
  await exigirProductosDeEmpresa(client, empresaId, [data.productoId]);

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
     on conflict (empresa_id, id) do nothing
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
  await exigirUsuarioDeEmpresa(client, empresaId, data.usuarioId);

  // Recuperación: si quedó un turno abierto antiguo en el servidor (por un
  // cierre que no llegó), se cierra antes de abrir el nuevo. Si no, el índice
  // parcial de turno abierto por dispositivo rechaza la apertura y arrastra
  // todas las ventas posteriores.
  await client.query(
    `update turnos_caja
     set estado = 'cerrado', cierre = coalesce(cierre, now()), updated_at = now()
     where empresa_id = $1 and dispositivo_id = $2
       and estado = 'abierto' and id <> $3`,
    [empresaId, deviceId, data.turnoId]
  );

  const insertado = await client.query(
    `insert into turnos_caja
       (id, empresa_id, dispositivo_id, usuario_id, apertura, fondo_inicial, desglose, estado)
     values ($1, $2, $3, $4, $5, $6, $7, 'abierto')
     on conflict (empresa_id, id) do nothing
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
  deviceId: string,
  payload: unknown
): Promise<unknown> {
  const data = turnoCierreSchema.parse(payload);

  const existente = await client.query<{ estado: string; dispositivo_id: string }>(
    `select estado, dispositivo_id from turnos_caja where empresa_id = $1 and id = $2`,
    [empresaId, data.turnoId]
  );
  if (!existente.rowCount) {
    throw new ApiError(404, 'TURNO_NO_ENCONTRADO');
  }
  const turno = existente.rows[0];
  if (turno.dispositivo_id !== deviceId) {
    throw new ApiError(
      403,
      'TURNO_OTRO_DISPOSITIVO',
      'Solo el dispositivo que abrió el turno puede cerrarlo.'
    );
  }
  if (turno.estado === 'cerrado') {
    return { turnoId: data.turnoId, estado: 'cerrado', idempotente: true };
  }

  await client.query(
     `update turnos_caja
      set cierre = $3, estado = 'cerrado', ventas_count = $4, total_esperado = $5,
          desglose = $6, dinero_real = $7, diferencia = $8,
          efectivo_esperado = $9, observacion_diferencia = $10, updated_at = now()
      where empresa_id = $1 and id = $2 and dispositivo_id = $11 and estado = 'abierto'`,
     [
       empresaId,
       data.turnoId,
       data.cierre,
       data.ventasCount,
       data.totalEsperado,
       JSON.stringify(data.desglose),
       data.dineroReal,
       data.diferencia,
       data.efectivoEsperado,
       data.observacion ?? null,
       deviceId,
     ]
  );
  return { turnoId: data.turnoId, estado: 'cerrado' };
}

async function aplicarProductoUpsert(
  client: PoolClient,
  empresaId: string,
  payload: unknown
): Promise<unknown> {
  const data = productoUpsertSchema.parse(payload);
  if (data.categoriaId) {
    await exigirCategoriaDeEmpresa(client, empresaId, data.categoriaId);
  }
  const conStock = data.stock !== undefined;
  const conCosto = data.costoUnitario !== undefined;
  const resultado = await client.query<{ id: string; version: number }>(
    `insert into productos
       (id, empresa_id, categoria_id, nombre, precio, emoji, color, imagen, orden,
        activo, stock_actual, stock_minimo, costo_unitario, version, deleted_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     on conflict (empresa_id, id) do update set
       categoria_id = excluded.categoria_id,
       nombre = excluded.nombre,
       precio = excluded.precio,
       emoji = excluded.emoji,
       color = excluded.color,
       imagen = excluded.imagen,
       orden = excluded.orden,
       activo = excluded.activo,
       stock_actual = case when $16 then excluded.stock_actual
                           else productos.stock_actual end,
       stock_minimo = excluded.stock_minimo,
       costo_unitario = case when $17 then excluded.costo_unitario
                             else productos.costo_unitario end,
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
      data.costoUnitario ?? null,
      data.version,
      data.deletedAt ?? null,
      conStock,
      conCosto,
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
  deviceId: string,
  payload: unknown
): Promise<unknown> {
  const data = usuarioUpsertSchema.parse(payload);
  const rol = await rolDispositivo(client, empresaId, deviceId);
  let rolFinal = data.rol;

  // La cuenta del dueño se crea localmente como admin. Cuando su dispositivo
  // (rol propietario) la sincroniza y el negocio todavía no tiene propietario,
  // se promueve para que pueda reemplazar equipos y proteger su cuenta. La
  // consulta es idempotente y nunca la ejecuta una terminal de trabajador.
  if (rol === 'propietario' && data.rol === 'admin' && !data.deletedAt) {
    const propietario = await client.query<{ id: string }>(
      `select id from usuarios
       where empresa_id = $1 and rol = 'propietario' and deleted_at is null
         and id <> $2
       limit 1`,
      [empresaId, data.id]
    );
    if (!propietario.rowCount) rolFinal = 'propietario';
  }

  if (rol !== 'propietario') {
    if (data.rol === 'propietario') {
      throw new ApiError(
        403,
        'ROL_INSUFICIENTE',
        'Solo el propietario del negocio puede crear otra cuenta de propietario.'
      );
    }

    const actual = await client.query<{ rol: string }>(
      `select rol::text as rol from usuarios where empresa_id = $1 and id = $2`,
      [empresaId, data.id]
    );
    const rolActual = actual.rows[0]?.rol;
    if (rolActual === 'propietario') {
      throw new ApiError(
        403,
        'USUARIO_PROTEGIDO',
        'La cuenta del propietario solo puede modificarla el propietario.'
      );
    }
    if (rol === 'dependiente' && (data.rol !== 'dependiente' || (rolActual && rolActual !== 'dependiente'))) {
      throw new ApiError(
        403,
        'ROL_INSUFICIENTE',
        'Una terminal de dependiente solo puede crear o modificar cuentas de dependiente.'
      );
    }
  }

  let resultado: { rowCount: number | null; rows: Array<{ id: string; version: number }> };
  try {
    resultado = await client.query<{ id: string; version: number }>(
      `insert into usuarios
         (id, empresa_id, nombre, usuario, rol, activo, password_hash, version, deleted_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (empresa_id, id) do update set
         nombre = excluded.nombre,
         usuario = excluded.usuario,
         rol = case
           when usuarios.rol = 'propietario' and excluded.rol <> 'propietario'
             then usuarios.rol
           else excluded.rol
         end,
         activo = excluded.activo,
         password_hash = coalesce(excluded.password_hash, usuarios.password_hash),
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
        rolFinal,
        data.activo,
        data.pinHash ?? null,
        data.version,
        data.deletedAt ?? null,
      ]
    );
  } catch (error) {
    const pgError = error as { code?: string; constraint?: string };
    if (pgError.code === '23505' && pgError.constraint?.startsWith('ux_usuarios_')) {
      throw new ApiError(
        409,
        'USUARIO_DUPLICADO',
        'Ese nombre de usuario ya está en uso. Elige otro.'
      );
    }
    throw error;
  }
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
  const clave = (payload as { clave?: unknown } | null)?.clave;
  if (
    typeof clave === 'string' &&
    !(SETTINGS_SINCRONIZABLES as readonly string[]).includes(clave)
  ) {
    throw new ApiError(
      422,
      'SETTING_NO_SINCRONIZABLE',
      'Esa clave de configuración no se sincroniza con la nube.'
    );
  }

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

async function aplicarGastoUpsert(
  client: PoolClient,
  empresaId: string,
  payload: unknown
): Promise<unknown> {
  const data = gastoInputSchema.parse(payload);
  const resultado = await client.query<{ id: string; version: number }>(
    `insert into gastos
       (id, empresa_id, categoria, concepto, monto, fecha, forma_pago, version, deleted_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (empresa_id, id) do update set
       categoria = excluded.categoria,
       concepto = excluded.concepto,
       monto = excluded.monto,
       fecha = excluded.fecha,
       forma_pago = excluded.forma_pago,
       version = excluded.version,
       deleted_at = excluded.deleted_at,
       updated_at = now()
     where excluded.version >= gastos.version
     returning id, version`,
    [
      data.id,
      empresaId,
      data.categoria,
      data.concepto,
      data.monto,
      data.fecha,
      data.formaPago,
      data.version,
      data.deletedAt ?? null,
    ]
  );
  return resultado.rows[0] ?? { id: data.id, ignorado: true };
}

async function aplicarMovimientoCajaUpsert(
  client: PoolClient,
  empresaId: string,
  deviceId: string,
  payload: unknown
): Promise<unknown> {
  const data = movimientoCajaInputSchema.parse(payload);
  const resultado = await client.query<{ id: string }>(
    `insert into movimientos_caja
       (id, empresa_id, turno_id, usuario_id, dispositivo_id, tipo, monto,
        descripcion, gasto_id, deleted_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (empresa_id, id) do update set
       tipo = excluded.tipo,
       monto = excluded.monto,
       descripcion = excluded.descripcion,
       gasto_id = excluded.gasto_id,
       deleted_at = excluded.deleted_at,
       updated_at = now()
     returning id`,
    [
      data.id,
      empresaId,
      data.turnoId ?? null,
      data.usuarioId ?? null,
      deviceId,
      data.tipo,
      data.monto,
      data.descripcion,
      data.gastoId ?? null,
      data.deletedAt ?? null,
    ]
  );
  return resultado.rows[0] ?? { id: data.id, ignorado: true };
}

async function aplicarConteoInventarioUpsert(
  client: PoolClient,
  empresaId: string,
  deviceId: string,
  payload: unknown
): Promise<unknown> {
  const data = conteoInventarioInputSchema.parse(payload);
  await exigirProductosDeEmpresa(client, empresaId, [data.productoId]);
  const resultado = await client.query<{ id: string }>(
    `insert into conteos_inventario
       (id, empresa_id, turno_id, producto_id, cantidad_sistema, cantidad_contada,
        diferencia, motivo, usuario_id, deleted_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (empresa_id, id) do update set
       cantidad_sistema = excluded.cantidad_sistema,
       cantidad_contada = excluded.cantidad_contada,
       diferencia = excluded.diferencia,
       motivo = excluded.motivo,
       deleted_at = excluded.deleted_at,
       updated_at = now()
     returning id`,
    [
      data.id,
      empresaId,
      data.turnoId ?? null,
      data.productoId,
      data.cantidadSistema,
      data.cantidadContada,
      data.diferencia,
      data.motivo ?? null,
      data.usuarioId ?? null,
      data.deletedAt ?? null,
    ]
  );
  return resultado.rows[0] ?? { id: data.id, ignorado: true };
}

async function exigirGestorDispositivo(
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
      'Solo un administrador puede registrar gastos.'
    );
  }
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
      return aplicarTurnoCierre(client, input.empresaId, input.deviceId, input.payload);
    case 'producto_upsert':
      return aplicarProductoUpsert(client, input.empresaId, input.payload);
    case 'categoria_upsert':
      return aplicarCategoriaUpsert(client, input.empresaId, input.payload);
    case 'usuario_upsert':
      return aplicarUsuarioUpsert(client, input.empresaId, input.deviceId, input.payload);
    case 'settings_upsert':
      return aplicarSettingsUpsert(client, input.empresaId, input.payload);
    case 'gasto_upsert':
      await exigirGestorDispositivo(client, input.empresaId, input.deviceId);
      return aplicarGastoUpsert(client, input.empresaId, input.payload);
    case 'movimiento_caja_upsert':
      return aplicarMovimientoCajaUpsert(
        client,
        input.empresaId,
        input.deviceId,
        input.payload
      );
    case 'conteo_inventario_upsert':
      return aplicarConteoInventarioUpsert(
        client,
        input.empresaId,
        input.deviceId,
        input.payload
      );
    default:
      throw new ApiError(422, 'TIPO_OPERACION_DESCONOCIDO', input.tipo);
  }
}
