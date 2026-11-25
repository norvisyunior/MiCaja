import { Router, type Request, type Response } from 'express';
import type { PoolClient } from 'pg';
import {
  syncPullQuerySchema,
  syncPushSchema,
  type SyncOperationResult,
} from '@micaja/shared';
import { withTenant } from '../db';
import { requireDevice } from '../middleware/auth';
import { ApiError } from '../middleware/errors';
import { asyncHandler } from '../middleware/async-handler';
import { aplicarOperacion } from '../services/sync';
import { estadoLicenciaEfectiva, exigirLicenciaVigente } from '../services/licencias';

async function verificarDispositivo(
  client: PoolClient,
  empresaId: string,
  deviceId: string
): Promise<void> {
  // La instalación se registra sola: el dispositivo solo identifica la sesión
  // de sincronización. No bloquea por estado ni limita cuántas hay.
  await client.query(
    `insert into dispositivos
       (id, empresa_id, nombre, plataforma, app_version, fingerprint, estado, rol,
        last_seen_at, last_sync_at)
     values ($1, $2, 'MiCaja', 'web', '', $3, 'activo', 'dependiente', now(), now())
     on conflict (empresa_id, id) do update set
       estado = 'activo',
       last_seen_at = now(),
       last_sync_at = now(),
       updated_at = now()`,
    [deviceId, empresaId, deviceId]
  );
}

export const syncRouter = Router();

syncRouter.use(requireDevice);

syncRouter.post(
  '/push',
  asyncHandler(async (req, res) => {
    const data = syncPushSchema.parse(req.body);
    const dispositivo = req.device!;
    if (data.deviceId !== dispositivo.deviceId) {
      throw new ApiError(403, 'DISPOSITIVO_NO_COINCIDE');
    }

    const results: SyncOperationResult[] = [];

    for (const operacion of data.operations) {
      const resultado = await withTenant(dispositivo.empresaId, async (client) => {
        await verificarDispositivo(client, dispositivo.empresaId, dispositivo.deviceId);
        await exigirLicenciaVigente(client, dispositivo.empresaId);

        const insertada = await client.query(
          `insert into sync_operations
             (empresa_id, dispositivo_id, operation_id, tipo, payload, estado)
           values ($1, $2, $3, $4, $5, 'pendiente')
           on conflict (empresa_id, operation_id) do nothing
           returning id`,
          [
            dispositivo.empresaId,
            dispositivo.deviceId,
            operacion.operationId,
            operacion.tipo,
            JSON.stringify(operacion.payload),
          ]
        );

        if (!insertada.rowCount) {
          const previa = await client.query<{
            estado: string;
            resultado: unknown;
            error: string | null;
            dispositivo_id: string;
          }>(
            `select estado, resultado, error, dispositivo_id from sync_operations
             where empresa_id = $1 and operation_id = $2`,
            [dispositivo.empresaId, operacion.operationId]
          );
          const fila = previa.rows[0];
          // Un `operation_id` es de la terminal que lo creó. Si otra terminal
          // del mismo negocio lo reutiliza, no debe recibir el resultado ajeno
          // ni reaplicarlo con otro payload.
          if (fila && fila.dispositivo_id !== dispositivo.deviceId) {
            return {
              operationId: operacion.operationId,
              estado: 'rechazada' as const,
              error: 'OPERACION_DE_OTRO_DISPOSITIVO',
            };
          }
          return {
            operationId: operacion.operationId,
            estado: (fila?.estado ?? 'aplicada') as SyncOperationResult['estado'],
            resultado: fila?.resultado ?? undefined,
            error: fila?.error ?? undefined,
          };
        }

        await client.query('savepoint operacion');
        try {
          const aplicado = await aplicarOperacion(client, {
            empresaId: dispositivo.empresaId,
            deviceId: dispositivo.deviceId,
            tipo: operacion.tipo,
            payload: operacion.payload,
          });

          await client.query(
            `update sync_operations
             set estado = 'aplicada', resultado = $3, processed_at = now()
             where empresa_id = $1 and operation_id = $2`,
            [dispositivo.empresaId, operacion.operationId, JSON.stringify(aplicado ?? null)]
          );
          await client.query('release savepoint operacion');

          return {
            operationId: operacion.operationId,
            estado: 'aplicada' as const,
            resultado: aplicado,
          };
        } catch (error) {
          await client.query('rollback to savepoint operacion');
          const code = error instanceof ApiError ? error.code : 'ERROR_APLICACION';
          const message = error instanceof Error ? error.message : 'ERROR_DESCONOCIDO';
          await client.query(
            `update sync_operations
             set estado = 'rechazada', error = $3, processed_at = now()
             where empresa_id = $1 and operation_id = $2`,
            [dispositivo.empresaId, operacion.operationId, `${code}: ${message}`]
          );
          await client.query('release savepoint operacion');

          return {
            operationId: operacion.operationId,
            estado: 'rechazada' as const,
            error: `${code}: ${message}`,
          };
        }
      });

      results.push(resultado);
    }

    await withTenant(dispositivo.empresaId, (client) =>
      client.query(
        `update dispositivos
         set last_sync_at = now(), last_seen_at = now()
         where id = $1`,
        [dispositivo.deviceId]
      )
    );

    res.json({ results, serverTime: new Date().toISOString() });
  })
);

interface FilaVentaPull {
  id: string;
  dispositivo_id: string;
  usuario_id: string;
  turno_id: string | null;
  local_id: string;
  numero: string;
  fecha_cliente: Date;
  subtotal: string;
  descuento_pct: string;
  total: string;
  forma_pago: string;
  monto_efectivo: string;
  monto_digital: string;
  anulada: boolean;
  motivo_anulacion: string | null;
  anulada_por: string | null;
  anulada_en: Date | null;
  reembolso_efectivo: string;
  reembolso_digital: string;
  updated_at: Date;
  updated_at_exact: string;
}

interface FilaVentaItemPull {
  id: string;
  venta_id: string;
  producto_id: string | null;
  nombre: string;
  precio_unitario: string;
  costo_unitario: string | null;
  cantidad: string;
  subtotal: string;
}

interface FilaGastoPull {
  id: string;
  categoria: string;
  concepto: string;
  monto: string;
  fecha: Date;
  forma_pago: string;
  version: number;
  deleted_at: Date | null;
  updated_at: Date;
  updated_at_exact: string;
}

interface FilaMovimientoCajaPull {
  id: string;
  turno_id: string | null;
  usuario_id: string | null;
  tipo: string;
  monto: string;
  descripcion: string;
  gasto_id: string | null;
  version: number;
  deleted_at: Date | null;
  updated_at: Date;
  updated_at_exact: string;
}

interface FilaConteoInventarioPull {
  id: string;
  turno_id: string | null;
  producto_id: string;
  cantidad_sistema: string;
  cantidad_contada: string;
  diferencia: string;
  motivo: string | null;
  usuario_id: string | null;
  version: number;
  deleted_at: Date | null;
  updated_at: Date;
  updated_at_exact: string;
}

interface FilaTurnoPull {
  id: string;
  dispositivo_id: string;
  usuario_id: string;
  apertura: Date;
  cierre: Date | null;
  estado: string;
  fondo_inicial: string;
  efectivo_esperado: string;
  observacion_diferencia: string | null;
  ventas_count: number;
  total_esperado: string;
  desglose: Record<string, number>;
  dinero_real: string | null;
  diferencia: string | null;
  updated_at: Date;
  updated_at_exact: string;
}

interface CursorTabla {
  /** `updated_at` exacto tal como lo devuelve Postgres (con microsegundos). */
  s: string;
  /** Último identificador entregado de esa tabla dentro de ese instante. */
  id: string;
}

type CursorPull = Record<string, CursorTabla>;

/**
 * El `updated_at` de Postgres tiene microsegundos, pero `Date` de JavaScript
 * solo conserva milisegundos: al convertir `now()` a ISO la parte sobrante se
 * trunca y la consulta `updated_at > since` vuelve a devolver las mismas
 * filas, repitiendo la página sin fin. Por eso el instante del cursor viaja
 * como texto generado por el propio motor (`to_char` con `US`) y se usa tal
 * cual en la comparación.
 */
const INSTANTE_INICIAL = new Date(0).toISOString();
const EXPRESION_UPDATED_EXACTO = `to_char(updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/**
 * El cursor es opaco para el cliente: un JSON `{ tabla: { s, id } }`. Un
 * cursor corrupto se descarta y la tabla se relee desde el principio, que es
 * inocuo (reenviar filas ya vistas) a diferencia de saltarse cambios.
 */
function leerCursorPull(crudo?: string): CursorPull {
  const cursor: CursorPull = {};
  if (!crudo) return cursor;
  let datos: unknown;
  try {
    datos = JSON.parse(crudo);
  } catch {
    return cursor;
  }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return cursor;

  for (const [tabla, valor] of Object.entries(datos as Record<string, unknown>)) {
    if (!valor || typeof valor !== 'object') continue;
    const { s, id } = valor as { s?: unknown; id?: unknown };
    if (
      typeof s === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/.test(s) &&
      typeof id === 'string' &&
      id.length <= 200
    ) {
      cursor[tabla] = { s, id };
    }
  }
  return cursor;
}

/**
 * El pull entrega catálogo, settings, usuarios y también el historial de
 * operación (turnos, ventas y sus líneas). Sin esto, un dispositivo que
 * recupera su cuenta en la nube (instalación nueva o cambio de negocio)
 * veía el negocio vacío: productos y ventas existían en el servidor pero
 * nunca llegaban a la SQLite local.
 *
 * Cada tabla se pagina con `limit` y avanza con su propio cursor
 * `(updated_at exacto, id)`, así que una página nunca se repite aunque
 * muchas filas compartan el mismo instante.
 */
/**
 * Construye una página del pull. `soloLectura` se usa cuando la licencia está
 * vencida: el dispositivo puede consultar sus datos (historial, catálogo,
 * ajustes) pero la ruta no entrega el token firmado ni permite escribir.
 * `/push` mantiene su propio guard y sigue rechazando la licencia vencida.
 */
async function responderPull(req: Request, res: Response, soloLectura: boolean) {
    const query = syncPullQuerySchema.parse(req.query);
    const dispositivo = req.device!;
    if (query.deviceId !== dispositivo.deviceId) {
      throw new ApiError(403, 'DISPOSITIVO_NO_COINCIDE');
    }

    const cursorEntrada = leerCursorPull(query.cursor);
    const desdeTabla = (tabla: string): CursorTabla =>
      cursorEntrada[tabla] ?? { s: INSTANTE_INICIAL, id: '' };
    const limite = query.limit;

    const resultado = await withTenant(dispositivo.empresaId, async (client) => {
      await verificarDispositivo(client, dispositivo.empresaId, dispositivo.deviceId);

      if (soloLectura) {
        const licenciaActual = await client.query<{
          estado: string;
          vence_en: Date;
          grace_dias: number;
        }>(
          `select estado, vence_en, grace_dias from licencias where empresa_id = $1`,
          [dispositivo.empresaId]
        );
        const fila = licenciaActual.rows[0];
        const estado = fila ? estadoLicenciaEfectiva(fila) : 'sin_licencia';
        if (estado !== 'vencida') {
          throw new ApiError(
            403,
            'LICENCIA_NO_VENCIDA',
            'El modo consulta solo está disponible mientras la licencia está vencida.'
          );
        }
      } else {
        await exigirLicenciaVigente(client, dispositivo.empresaId);
      }

      // Las consultas van en serie: `pg` no permite varias consultas
      // simultáneas sobre el mismo cliente de una transacción.
      const productos = await client.query(
        `select id, categoria_id, nombre, precio, costo_unitario, emoji, color, imagen, orden,
                activo, stock_actual, stock_minimo, version, updated_at, deleted_at,
                ${EXPRESION_UPDATED_EXACTO} as updated_at_exact
         from productos
         where empresa_id = $1
           and (updated_at > $2::timestamptz
                or (updated_at = $2::timestamptz and id::text > $3))
         order by updated_at asc, id::text asc
         limit $4`,
        [
          dispositivo.empresaId,
          desdeTabla('productos').s,
          desdeTabla('productos').id,
          limite + 1,
        ]
      );

      const categorias = await client.query(
        `select id, nombre, color, orden, activo, version, updated_at, deleted_at,
                ${EXPRESION_UPDATED_EXACTO} as updated_at_exact
         from categorias
         where empresa_id = $1
           and (updated_at > $2::timestamptz
                or (updated_at = $2::timestamptz and id::text > $3))
         order by updated_at asc, id::text asc
         limit $4`,
        [
          dispositivo.empresaId,
          desdeTabla('categorias').s,
          desdeTabla('categorias').id,
          limite + 1,
        ]
      );

      const usuarios = await client.query(
        `select id, nombre, usuario, rol, activo, version, updated_at, deleted_at,
                ${EXPRESION_UPDATED_EXACTO} as updated_at_exact
         from usuarios
         where empresa_id = $1
           and (updated_at > $2::timestamptz
                or (updated_at = $2::timestamptz and id::text > $3))
         order by updated_at asc, id::text asc
         limit $4`,
        [
          dispositivo.empresaId,
          desdeTabla('usuarios').s,
          desdeTabla('usuarios').id,
          limite + 1,
        ]
      );

      // Solo se entregan claves de negocio. Claves internas (licencias,
      // tokens, ids de servidor) nunca deben viajar por la nube ni poder
      // colarse en instalaciones antiguas.
      const settings = await client.query(
        `select clave, valor, version, updated_at,
                ${EXPRESION_UPDATED_EXACTO} as updated_at_exact
         from settings
         where empresa_id = $1
           and (updated_at > $2::timestamptz
                or (updated_at = $2::timestamptz and clave > $3))
           and clave in ('nombre_negocio', 'moneda', 'simbolo_moneda')
         order by updated_at asc, clave asc
         limit $4`,
        [
          dispositivo.empresaId,
          desdeTabla('settings').s,
          desdeTabla('settings').id,
          limite + 1,
        ]
      );

      const gastos = await client.query<FilaGastoPull>(
        `select id, categoria, concepto, monto, fecha, version, deleted_at,
                updated_at, ${EXPRESION_UPDATED_EXACTO} as updated_at_exact
         from gastos
         where empresa_id = $1
           and (updated_at > $2::timestamptz
                or (updated_at = $2::timestamptz and id::text > $3))
         order by updated_at asc, id::text asc
         limit $4`,
        [
          dispositivo.empresaId,
          desdeTabla('gastos').s,
          desdeTabla('gastos').id,
          limite + 1,
        ]
      );

      const movimientosCaja = await client.query<FilaMovimientoCajaPull>(
        `select id, turno_id, usuario_id, tipo, monto, descripcion, gasto_id,
                version, deleted_at, updated_at,
                ${EXPRESION_UPDATED_EXACTO} as updated_at_exact
         from movimientos_caja
         where empresa_id = $1
           and (updated_at > $2::timestamptz
                or (updated_at = $2::timestamptz and id::text > $3))
         order by updated_at asc, id::text asc
         limit $4`,
        [
          dispositivo.empresaId,
          desdeTabla('movimientos_caja').s,
          desdeTabla('movimientos_caja').id,
          limite + 1,
        ]
      );

      const conteosInventario = await client.query<FilaConteoInventarioPull>(
        `select id, turno_id, producto_id, cantidad_sistema, cantidad_contada,
                diferencia, motivo, usuario_id, version, deleted_at, updated_at,
                ${EXPRESION_UPDATED_EXACTO} as updated_at_exact
         from conteos_inventario
         where empresa_id = $1
           and (updated_at > $2::timestamptz
                or (updated_at = $2::timestamptz and id::text > $3))
         order by updated_at asc, id::text asc
         limit $4`,
        [
          dispositivo.empresaId,
          desdeTabla('conteos_inventario').s,
          desdeTabla('conteos_inventario').id,
          limite + 1,
        ]
      );

      const turnos = await client.query<FilaTurnoPull>(
        `select id, dispositivo_id, usuario_id, apertura, cierre, estado,
                fondo_inicial, efectivo_esperado, observacion_diferencia,
                ventas_count, total_esperado, desglose, dinero_real, diferencia,
                updated_at, ${EXPRESION_UPDATED_EXACTO} as updated_at_exact
         from turnos_caja
         where empresa_id = $1
           and (updated_at > $2::timestamptz
                or (updated_at = $2::timestamptz and id::text > $3))
         order by updated_at asc, id::text asc
         limit $4`,
        [
          dispositivo.empresaId,
          desdeTabla('turnos').s,
          desdeTabla('turnos').id,
          limite + 1,
        ]
      );

      const ventas = await client.query<FilaVentaPull>(
        `select id, dispositivo_id, usuario_id, turno_id, local_id, numero,
                fecha_cliente, subtotal, descuento_pct, total, forma_pago,
                monto_efectivo, monto_digital, anulada, motivo_anulacion,
                anulada_por, anulada_en, reembolso_efectivo, reembolso_digital, updated_at,
                ${EXPRESION_UPDATED_EXACTO} as updated_at_exact
         from ventas
         where empresa_id = $1
           and (updated_at > $2::timestamptz
                or (updated_at = $2::timestamptz and id::text > $3))
         order by updated_at asc, id::text asc
         limit $4`,
        [
          dispositivo.empresaId,
          desdeTabla('ventas').s,
          desdeTabla('ventas').id,
          limite + 1,
        ]
      );

      const licencia = await client.query(
        `select l.estado, l.vence_en, l.grace_dias, d.licencia_firmada
         from licencias l
         join dispositivos d on d.empresa_id = l.empresa_id
         where l.empresa_id = $1 and d.id = $2`,
        [dispositivo.empresaId, dispositivo.deviceId]
      );

      await client.query(
        `update dispositivos
         set last_sync_at = now(), last_seen_at = now()
         where id = $1`,
        [dispositivo.deviceId]
      );

      // `limit + 1` permite saber si quedan más filas sin una consulta extra.
      // `ultimo` es el cursor compuesto `(updated_at exacto, id)` de la última
      // fila entregada de esa tabla.
      function paginar<T extends { updated_at_exact: string }>(
        filas: T[],
        idDe: (fila: T) => string
      ): {
        visibles: T[];
        hayMas: boolean;
        ultimo: CursorTabla | null;
      } {
        const visibles = filas.slice(0, limite);
        const ultima = visibles[visibles.length - 1];
        return {
          visibles,
          hayMas: filas.length > limite,
          ultimo: ultima
            ? { s: ultima.updated_at_exact, id: idDe(ultima) }
            : null,
        };
      }

      const pagProductos = paginar(productos.rows, (fila) => fila.id);
      const pagCategorias = paginar(categorias.rows, (fila) => fila.id);
      const pagUsuarios = paginar(usuarios.rows, (fila) => fila.id);
      const pagSettings = paginar(settings.rows, (fila) => fila.clave);
      const pagGastos = paginar(gastos.rows, (fila) => fila.id);
      const pagMovimientosCaja = paginar(movimientosCaja.rows, (fila) => fila.id);
      const pagConteosInventario = paginar(conteosInventario.rows, (fila) => fila.id);
      const pagTurnos = paginar(turnos.rows, (fila) => fila.id);
      const pagVentas = paginar(ventas.rows, (fila) => fila.id);

      const ventasVisibles = pagVentas.visibles as FilaVentaPull[];
      const items = ventasVisibles.length
        ? await client.query<FilaVentaItemPull>(
            `select id, venta_id, producto_id, nombre, precio_unitario, costo_unitario,
                    cantidad, subtotal
             from venta_items
             where empresa_id = $1 and venta_id = any($2::uuid[])
             order by created_at asc, id asc`,
            [dispositivo.empresaId, ventasVisibles.map((fila) => fila.id)]
          )
        : { rows: [] as FilaVentaItemPull[] };

      const itemsPorVenta = new Map<string, FilaVentaItemPull[]>();
      for (const item of items.rows) {
        const lista = itemsPorVenta.get(item.venta_id) ?? [];
        lista.push(item);
        itemsPorVenta.set(item.venta_id, lista);
      }

      const cambios = [
        ...pagProductos.visibles.map((fila) => ({
          tipo: 'producto',
          id: fila.id,
          version: fila.version,
          updatedAt: fila.updated_at.toISOString(),
          data: {
            id: fila.id,
            categoriaId: fila.categoria_id,
            nombre: fila.nombre,
            precio: Number(fila.precio),
            costoUnitario: fila.costo_unitario === null ? null : Number(fila.costo_unitario),
            emoji: fila.emoji,
            color: fila.color,
            imagen: fila.imagen,
            orden: fila.orden,
            activo: fila.activo,
            stock: Number(fila.stock_actual),
            stockMinimo: Number(fila.stock_minimo),
            version: fila.version,
            deletedAt: fila.deleted_at?.toISOString() ?? null,
          },
        })),
        ...pagCategorias.visibles.map((fila) => ({
          tipo: 'categoria',
          id: fila.id,
          version: fila.version,
          updatedAt: fila.updated_at.toISOString(),
          data: {
            id: fila.id,
            nombre: fila.nombre,
            color: fila.color,
            orden: fila.orden,
            activo: fila.activo,
            version: fila.version,
            deletedAt: fila.deleted_at?.toISOString() ?? null,
          },
        })),
        ...pagUsuarios.visibles.map((fila) => ({
          tipo: 'usuario',
          id: fila.id,
          version: fila.version,
          updatedAt: fila.updated_at.toISOString(),
          data: {
            id: fila.id,
            nombre: fila.nombre,
            usuario: fila.usuario,
            rol: fila.rol,
            activo: fila.activo,
            version: fila.version,
            deletedAt: fila.deleted_at?.toISOString() ?? null,
          },
        })),
        ...pagSettings.visibles.map((fila) => ({
          tipo: 'setting',
          id: fila.clave,
          version: fila.version,
          updatedAt: fila.updated_at.toISOString(),
          data: {
            clave: fila.clave,
            valor: fila.valor,
            version: fila.version,
          },
        })),
        ...pagGastos.visibles.map((fila) => ({
          tipo: 'gasto',
          id: fila.id,
          version: fila.version,
          updatedAt: fila.updated_at.toISOString(),
          data: {
            id: fila.id,
            categoria: fila.categoria,
            concepto: fila.concepto,
            monto: Number(fila.monto),
            fecha: fila.fecha.toISOString(),
            formaPago: fila.forma_pago,
            version: fila.version,
            deletedAt: fila.deleted_at?.toISOString() ?? null,
          },
        })),
        ...pagMovimientosCaja.visibles.map((fila) => ({
          tipo: 'movimiento_caja',
          id: fila.id,
          version: fila.version,
          updatedAt: fila.updated_at.toISOString(),
          data: {
            id: fila.id,
            turnoId: fila.turno_id,
            usuarioId: fila.usuario_id,
            tipo: fila.tipo,
            monto: Number(fila.monto),
            descripcion: fila.descripcion,
            gastoId: fila.gasto_id,
            version: fila.version,
            deletedAt: fila.deleted_at?.toISOString() ?? null,
          },
        })),
        ...pagConteosInventario.visibles.map((fila) => ({
          tipo: 'conteo_inventario',
          id: fila.id,
          version: fila.version,
          updatedAt: fila.updated_at.toISOString(),
          data: {
            id: fila.id,
            turnoId: fila.turno_id,
            productoId: fila.producto_id,
            cantidadSistema: Number(fila.cantidad_sistema),
            cantidadContada: Number(fila.cantidad_contada),
            diferencia: Number(fila.diferencia),
            motivo: fila.motivo,
            usuarioId: fila.usuario_id,
            version: fila.version,
            deletedAt: fila.deleted_at?.toISOString() ?? null,
          },
        })),
        ...pagTurnos.visibles.map((fila) => ({
          tipo: 'turno',
          id: fila.id,
          updatedAt: fila.updated_at.toISOString(),
          data: {
            id: fila.id,
            dispositivoId: fila.dispositivo_id,
            usuarioId: fila.usuario_id,
            apertura: fila.apertura.toISOString(),
            cierre: fila.cierre?.toISOString() ?? null,
            estado: fila.estado,
            fondoInicial: Number(fila.fondo_inicial),
            efectivoEsperado: Number(fila.efectivo_esperado),
            observacionDiferencia: fila.observacion_diferencia,
            ventasCount: fila.ventas_count,
            totalEsperado: Number(fila.total_esperado),
            desglose: fila.desglose ?? {},
            dineroReal: fila.dinero_real === null ? null : Number(fila.dinero_real),
            diferencia: fila.diferencia === null ? null : Number(fila.diferencia),
          },
        })),
        ...ventasVisibles.map((fila) => ({
          tipo: 'venta',
          id: fila.id,
          updatedAt: fila.updated_at.toISOString(),
          data: {
            id: fila.id,
            localId: fila.local_id,
            dispositivoId: fila.dispositivo_id,
            usuarioId: fila.usuario_id,
            turnoId: fila.turno_id,
            numero: Number(fila.numero),
            fechaCliente: fila.fecha_cliente.toISOString(),
            subtotal: Number(fila.subtotal),
            descuentoPct: Number(fila.descuento_pct),
            total: Number(fila.total),
            formaPago: fila.forma_pago,
            montoEfectivo: Number(fila.monto_efectivo),
            montoDigital: Number(fila.monto_digital),
            anulada: fila.anulada,
            motivoAnulacion: fila.motivo_anulacion,
            anuladaPor: fila.anulada_por,
            anuladaEn: fila.anulada_en?.toISOString() ?? null,
            reembolsoEfectivo: Number(fila.reembolso_efectivo),
            reembolsoDigital: Number(fila.reembolso_digital),
            items: (itemsPorVenta.get(fila.id) ?? []).map((item) => ({
              id: item.id,
              productoId: item.producto_id,
              nombre: item.nombre,
              precioUnitario: Number(item.precio_unitario),
              costoUnitario: item.costo_unitario === null ? null : Number(item.costo_unitario),
              cantidad: Number(item.cantidad),
              subtotal: Number(item.subtotal),
            })),
          },
        })),
      ];

      const paginas: Array<[string, typeof pagProductos]> = [
        ['productos', pagProductos],
        ['categorias', pagCategorias],
        ['usuarios', pagUsuarios],
        ['settings', pagSettings],
        ['gastos', pagGastos],
        ['movimientos_caja', pagMovimientosCaja],
        ['conteos_inventario', pagConteosInventario],
        ['turnos', pagTurnos],
        ['ventas', pagVentas],
      ];
      const hayMas = paginas.some(([, pagina]) => pagina.hayMas);

      // Cada tabla conserva su propio cursor: las que ya se agotaron no
      // vuelven a entregar filas y las que quedaron pendientes continúan
      // justo después de la última fila enviada. Así ninguna página se repite.
      const siguiente: CursorPull = { ...cursorEntrada };
      for (const [nombre, pagina] of paginas) {
        if (pagina.ultimo) siguiente[nombre] = pagina.ultimo;
      }
      const cursor = Object.keys(siguiente).length > 0 ? JSON.stringify(siguiente) : null;

      const licenciaFila = licencia.rows[0];

      return {
        cambios,
        hayMas,
        cursor,
        licencia: licenciaFila
          ? {
              // Si `exigirLicenciaVigente` pasó, la licencia está vigente:
              // se informa el estado efectivo y el token firmado guardado.
              estado: estadoLicenciaEfectiva(licenciaFila),
              venceEn: licenciaFila.vence_en.toISOString(),
              graceDias: licenciaFila.grace_dias,
              token: soloLectura ? null : licenciaFila.licencia_firmada,
            }
          : null,
        soloLectura,
        serverTime: new Date().toISOString(),
      };
    });

    res.json(resultado);
}

syncRouter.get('/pull', asyncHandler(async (req, res) => responderPull(req, res, false)));
syncRouter.get(
  '/pull-consulta',
  asyncHandler(async (req, res) => responderPull(req, res, true))
);
