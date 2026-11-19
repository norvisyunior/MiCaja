import type { SQLiteDatabase } from 'expo-sqlite';
import { CLAVE_ROL_ACTIVACION, leerSetting } from '../../api/config';
import { crearPinHash, esPinHasheado } from '../../utils/pin';
import { ahoraIso } from '../contexto';
import { encolarOperacion } from '../outbox';

/** Claves de settings que se sincronizan con la nube. */
export const SETTINGS_SINCRONIZABLES = new Set([
  'nombre_negocio',
  'moneda',
  'simbolo_moneda',
]);

/** Marca local: el snapshot inicial (instalación adoptada) ya se encoló. */
const CLAVE_SNAPSHOT_INICIAL = 'sync_snapshot_hecho';

/** Marca local: última pasada que subió los hashes de PIN de las cuentas. */
const CLAVE_PIN_HASHES = 'sync_pin_hashes_hecho';

/** Las cuentas antiguas se re-revisan a diario por si el PIN se fijó después. */
const INTERVALO_PIN_HASHES_MS = 24 * 60 * 60_000;

/**
 * Solo el dispositivo propietario sube la foto inicial. Antes de activar no
 * hay rol guardado: se asume propietario para que una instalación local
 * adoptada pueda subir sus datos al activarse. Las terminales invitadas
 * reciben todo desde la nube.
 */
async function esDispositivoPropietario(db: SQLiteDatabase): Promise<boolean> {
  const rol = await leerSetting(db, CLAVE_ROL_ACTIVACION);
  return !rol || rol === 'propietario';
}

async function marcarMarca(db: SQLiteDatabase, clave: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (clave, valor, version, updated_at)
     VALUES (?, '1', 1, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at`,
    clave,
    ahoraIso()
  );
}

async function marcarSnapshotHecho(db: SQLiteDatabase): Promise<void> {
  await marcarMarca(db, CLAVE_SNAPSHOT_INICIAL);
}

/** El login global ya descargó la foto inicial: no hay que empujar datos locales. */
export async function marcarSnapshotInicialHecho(db: SQLiteDatabase): Promise<void> {
  await marcarSnapshotHecho(db);
}

interface FilaProductoOutbox {
  id: number;
  uuid: string | null;
  categoria_uuid: string | null;
  nombre: string;
  precio: number;
  emoji: string;
  color: string;
  imagen: string | null;
  orden: number;
  activo: number;
  stock: number;
  stock_minimo: number;
  version: number;
  deleted_at: string | null;
}

interface FilaCategoriaOutbox {
  id: number;
  uuid: string | null;
  nombre: string;
  color: string;
  orden: number;
  activo: number;
  version: number;
  deleted_at: string | null;
}

interface FilaUsuarioOutbox {
  id: number;
  uuid: string | null;
  nombre: string;
  usuario: string;
  rol: string;
  pin: string;
  activo: number;
  version: number;
  deleted_at: string | null;
}

interface FilaTurnoOutbox {
  uuid: string | null;
  usuario_uuid: string | null;
  apertura: string;
  cierre: string | null;
  ventas_count: number;
  total_esperado: number;
  desglose_json: string;
  dinero_real: number | null;
  diferencia: number | null;
  estado: string;
}

interface PayloadItemVenta {
  productoId: string | null;
  cantidad: number;
}

interface PayloadAnulacion {
  ventaId: string;
}

interface PayloadMovimiento {
  productoId: string;
  tipo: string;
  cantidad: number;
}

/**
 * Stock que debe ver el servidor cuando se encola un upsert de producto.
 *
 * El upsert lleva el stock ABSOLUTO, pero las operaciones todavía no aplicadas
 * en el servidor (ventas, anulaciones, movimientos pendientes o rechazados)
 * modificarán ese stock cuando lleguen. Para que el servidor termine con el
 * mismo valor que el local, se envía `stock local − Σ deltas pendientes`:
 *
 *   local 8, venta pendiente −2  →  se envía 10 → servidor: 10 − 2 = 8 ✓
 *
 * Sin esta compensación, un upsert encolado junto a ventas pendientes daría
 * un doble descuento (y en la adopción de una instalación antigua, el pull
 * borraría el inventario local).
 */
async function stockParaServidor(
  db: SQLiteDatabase,
  productoUuid: string,
  stockLocal: number
): Promise<number> {
  const ops = await db.getAllAsync<{ tipo: string; payload: string }>(
    `SELECT tipo, payload FROM sync_outbox
     WHERE estado IN ('pendiente', 'fallida')
       AND tipo IN ('venta', 'anulacion', 'movimiento_inventario')`
  );

  let delta = 0;
  for (const op of ops) {
    let payload: unknown;
    try {
      payload = JSON.parse(op.payload);
    } catch {
      continue;
    }

    if (op.tipo === 'venta') {
      const items = (payload as { items?: PayloadItemVenta[] }).items ?? [];
      for (const item of items) {
        if (item.productoId === productoUuid) delta -= item.cantidad;
      }
    } else if (op.tipo === 'anulacion') {
      const ventaId = (payload as PayloadAnulacion).ventaId;
      const venta = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM ventas WHERE uuid = ? OR (servidor_id IS NOT NULL AND servidor_id = ?)`,
        ventaId,
        ventaId
      );
      if (!venta) continue;
      const items = await db.getAllAsync<{ cantidad: number; producto_uuid: string | null }>(
        `SELECT vi.cantidad, p.uuid AS producto_uuid
         FROM venta_items vi
         LEFT JOIN productos p ON p.id = vi.producto_id
         WHERE vi.venta_id = ?`,
        venta.id
      );
      for (const item of items) {
        if (item.producto_uuid === productoUuid) delta += item.cantidad;
      }
    } else {
      const mov = payload as PayloadMovimiento;
      if (mov.productoId === productoUuid) {
        // El servidor aplica: salida/venta restan, el resto suma (valor absoluto).
        if (mov.tipo === 'salida' || mov.tipo === 'venta') {
          delta -= Math.abs(mov.cantidad);
        } else {
          delta += Math.abs(mov.cantidad);
        }
      }
    }
  }

  return Math.max(0, stockLocal - delta);
}

/** ¿Ya hay una operación viva (pendiente o rechazada) para esta entidad? */
async function tieneOpViva(
  db: SQLiteDatabase,
  tipo: string,
  entidadUuid: string
): Promise<boolean> {
  const fila = await db.getFirstAsync<{ uno: number }>(
    `SELECT 1 AS uno FROM sync_outbox
     WHERE tipo = ? AND entidad_uuid = ? AND estado IN ('pendiente', 'fallida')
     LIMIT 1`,
    tipo,
    entidadUuid
  );
  return !!fila;
}

export async function encolarProductoUpsert(
  db: SQLiteDatabase,
  productoId: number,
  prioridad: 1 | 2 = 1
): Promise<void> {
  const fila = await db.getFirstAsync<FilaProductoOutbox>(
    `SELECT p.id, p.uuid, p.nombre, p.precio, p.emoji, p.color, p.imagen,
            p.orden, p.activo, p.stock, p.stock_minimo, p.version, p.deleted_at,
            c.uuid AS categoria_uuid
     FROM productos p
     LEFT JOIN categorias c ON c.id = p.categoria_id
     WHERE p.id = ?`,
    productoId
  );
  if (!fila?.uuid) return;

  await encolarOperacion(db, {
    tipo: 'producto_upsert',
    entidad: 'productos',
    entidadUuid: fila.uuid,
    prioridad,
    payload: {
      id: fila.uuid,
      categoriaId: fila.categoria_uuid,
      nombre: fila.nombre,
      precio: fila.precio,
      emoji: fila.emoji,
      color: fila.color,
      imagen: fila.imagen,
      orden: fila.orden,
      activo: fila.activo === 1,
      stock: await stockParaServidor(db, fila.uuid, fila.stock),
      stockMinimo: fila.stock_minimo,
      version: fila.version,
      deletedAt: fila.deleted_at,
    },
  });
}

export async function encolarCategoriaUpsert(
  db: SQLiteDatabase,
  categoriaId: number
): Promise<void> {
  const fila = await db.getFirstAsync<FilaCategoriaOutbox>(
    `SELECT id, uuid, nombre, color, orden, activo, version, deleted_at
     FROM categorias WHERE id = ?`,
    categoriaId
  );
  if (!fila?.uuid) return;

  await encolarOperacion(db, {
    tipo: 'categoria_upsert',
    entidad: 'categorias',
    entidadUuid: fila.uuid,
    prioridad: 1,
    payload: {
      id: fila.uuid,
      nombre: fila.nombre,
      color: fila.color,
      orden: fila.orden,
      activo: fila.activo === 1,
      version: fila.version,
      deletedAt: fila.deleted_at,
    },
  });
}

/**
 * El servidor necesita el hash del PIN para permitir login global. Si una
 * instalación antigua todavía guarda el PIN en texto plano, se migra aquí
 * antes de enviarlo y nunca se sube el valor original.
 */
async function pinHashParaServidor(
  db: SQLiteDatabase,
  fila: FilaUsuarioOutbox
): Promise<string | null> {
  if (!fila.pin) return null;
  if (esPinHasheado(fila.pin)) return fila.pin;

  const hash = await crearPinHash(fila.pin);
  await db.runAsync(`UPDATE usuarios SET pin = ? WHERE id = ?`, hash, fila.id);
  return hash;
}

export async function encolarUsuarioUpsert(
  db: SQLiteDatabase,
  usuarioId: number
): Promise<void> {
  const fila = await db.getFirstAsync<FilaUsuarioOutbox>(
    `SELECT id, uuid, nombre, usuario, rol, pin, activo, version, deleted_at
     FROM usuarios WHERE id = ?`,
    usuarioId
  );
  if (!fila?.uuid) return;

  const pinHash = await pinHashParaServidor(db, fila);

  await encolarOperacion(db, {
    tipo: 'usuario_upsert',
    entidad: 'usuarios',
    entidadUuid: fila.uuid,
    prioridad: 1,
    payload: {
      id: fila.uuid,
      nombre: fila.nombre,
      usuario: fila.usuario,
      rol: fila.rol === 'admin' ? 'admin' : 'dependiente',
      activo: fila.activo === 1,
      ...(pinHash ? { pinHash } : {}),
      version: fila.version,
      deletedAt: fila.deleted_at,
    },
  });
}

export async function encolarSettingUpsert(
  db: SQLiteDatabase,
  clave: string,
  valor: unknown,
  version: number
): Promise<void> {
  await encolarOperacion(db, {
    tipo: 'settings_upsert',
    entidad: 'settings',
    entidadUuid: clave,
    prioridad: 1,
    payload: { clave, valor, version },
  });
}

export async function encolarTurnoApertura(
  db: SQLiteDatabase,
  turnoId: number
): Promise<void> {
  const fila = await db.getFirstAsync<FilaTurnoOutbox>(
    `SELECT t.uuid, u.uuid AS usuario_uuid, t.apertura, t.cierre,
            t.ventas_count, t.total_esperado, t.desglose_json,
            t.dinero_real, t.diferencia, t.estado
     FROM turnos_caja t
     LEFT JOIN usuarios u ON u.id = t.usuario_id
     WHERE t.id = ?`,
    turnoId
  );
  if (!fila?.uuid || !fila.usuario_uuid) return;

  await encolarOperacion(db, {
    tipo: 'turno_apertura',
    entidad: 'turnos_caja',
    entidadUuid: fila.uuid,
    // La apertura debe llegar antes que las ventas de ese turno (prioridad 3).
    prioridad: 2,
    payload: {
      turnoId: fila.uuid,
      usuarioId: fila.usuario_uuid,
      apertura: fila.apertura,
      fondoInicial: 0,
      desglose: {},
    },
  });
}

export async function encolarTurnoCierre(
  db: SQLiteDatabase,
  turnoId: number
): Promise<void> {
  const fila = await db.getFirstAsync<FilaTurnoOutbox>(
    `SELECT t.uuid, u.uuid AS usuario_uuid, t.apertura, t.cierre,
            t.ventas_count, t.total_esperado, t.desglose_json,
            t.dinero_real, t.diferencia, t.estado
     FROM turnos_caja t
     LEFT JOIN usuarios u ON u.id = t.usuario_id
     WHERE t.id = ?`,
    turnoId
  );
  if (!fila?.uuid || !fila.cierre || fila.dinero_real === null || fila.diferencia === null) {
    return;
  }

  await encolarOperacion(db, {
    tipo: 'turno_cierre',
    entidad: 'turnos_caja',
    entidadUuid: fila.uuid,
    prioridad: 3,
    payload: {
      turnoId: fila.uuid,
      cierre: fila.cierre,
      ventasCount: fila.ventas_count,
      totalEsperado: fila.total_esperado,
      desglose: JSON.parse(fila.desglose_json) as Record<string, number>,
      dineroReal: fila.dinero_real,
      diferencia: fila.diferencia,
    },
  });
}

export async function encolarAnulacion(
  db: SQLiteDatabase,
  ventaId: number,
  usuarioId: number,
  motivo: string
): Promise<void> {
  const venta = await db.getFirstAsync<{ uuid: string | null; servidor_id: string | null }>(
    `SELECT uuid, servidor_id FROM ventas WHERE id = ?`,
    ventaId
  );
  const usuario = await db.getFirstAsync<{ uuid: string | null }>(
    `SELECT uuid FROM usuarios WHERE id = ?`,
    usuarioId
  );
  if (!venta?.uuid || !usuario?.uuid) return;

  await encolarOperacion(db, {
    tipo: 'anulacion',
    entidad: 'ventas',
    entidadUuid: venta.uuid,
    prioridad: 3,
    payload: {
      ventaId: venta.servidor_id ?? venta.uuid,
      usuarioId: usuario.uuid,
      motivo,
    },
  });
}

/**
 * Empuja la foto inicial de una instalación que se activa con datos previos
 * (o que empezó a usar la app antes de que existiera la sincronización):
 * usuarios, categorías, productos y settings sincronizables existentes.
 *
 * Sin esto, los turnos/ventas nuevos fallan en el servidor por llaves
 * foráneas (el usuario/producto aún no existe allá) y el pull pisaría el
 * inventario local con el stock vacío del servidor.
 *
 * Se encola una sola vez por instalación (marca en settings). Las entidades
 * que ya tienen una operación viva en el outbox se omiten para no duplicar.
 * Devuelve cuántas operaciones se encolaron.
 */
export async function encolarSnapshotInicial(db: SQLiteDatabase): Promise<number> {
  const marca = await db.getFirstAsync<{ valor: string }>(
    `SELECT valor FROM settings WHERE clave = ?`,
    CLAVE_SNAPSHOT_INICIAL
  );
  if (marca) return 0;

  // Un dispositivo invitado no sube la foto de su instalación local: sus
  // datos de negocio llegan desde la nube. Su cuenta de trabajador ya se
  // encoló al crearse con `crearUsuario`.
  if (!(await esDispositivoPropietario(db))) {
    await marcarSnapshotHecho(db);
    return 0;
  }

  let encoladas = 0;

  const usuarios = await db.getAllAsync<{ id: number; uuid: string | null }>(
    `SELECT id, uuid FROM usuarios WHERE uuid IS NOT NULL`
  );
  for (const usuario of usuarios) {
    if (await tieneOpViva(db, 'usuario_upsert', usuario.uuid!)) continue;
    await encolarUsuarioUpsert(db, usuario.id);
    encoladas += 1;
  }

  // Las categorías antes que los productos: el FK del servidor exige orden.
  const categorias = await db.getAllAsync<{ id: number; uuid: string | null }>(
    `SELECT id, uuid FROM categorias WHERE uuid IS NOT NULL`
  );
  for (const categoria of categorias) {
    if (await tieneOpViva(db, 'categoria_upsert', categoria.uuid!)) continue;
    await encolarCategoriaUpsert(db, categoria.id);
    encoladas += 1;
  }

  const productos = await db.getAllAsync<{ id: number; uuid: string | null }>(
    `SELECT id, uuid FROM productos WHERE uuid IS NOT NULL`
  );
  for (const producto of productos) {
    if (await tieneOpViva(db, 'producto_upsert', producto.uuid!)) continue;
    await encolarProductoUpsert(db, producto.id);
    encoladas += 1;
  }

  const claves = [...SETTINGS_SINCRONIZABLES];
  const placeholders = claves.map(() => '?').join(', ');
  const settings = await db.getAllAsync<{
    clave: string;
    valor: string;
    version: number;
  }>(`SELECT clave, valor, version FROM settings WHERE clave IN (${placeholders})`, ...claves);
  for (const setting of settings) {
    if (await tieneOpViva(db, 'settings_upsert', setting.clave)) continue;
    await encolarSettingUpsert(db, setting.clave, setting.valor, Math.max(1, setting.version));
    encoladas += 1;
  }

  await marcarSnapshotHecho(db);

  return encoladas;
}

/**
 * Instalaciones anteriores al login global ya habían subido sus usuarios sin
 * `pinHash`. Esta pasada reenvía las cuentas que tienen PIN local para que
 * puedan iniciar sesión desde otro dispositivo. Se repite cada 24 horas por si
 * una cuenta antigua recibe su PIN después de la primera pasada. Solo la hace
 * el propietario: un admin no puede modificar la cuenta del propietario.
 */
export async function encolarPinHashesPendientes(db: SQLiteDatabase): Promise<number> {
  const marca = await db.getFirstAsync<{ valor: string }>(
    `SELECT valor FROM settings WHERE clave = ?`,
    CLAVE_PIN_HASHES
  );
  if (marca?.valor) {
    const ultima = Number(marca.valor);
    if (
      Number.isFinite(ultima) &&
      Date.now() - ultima < INTERVALO_PIN_HASHES_MS
    ) {
      return 0;
    }
  }

  if (!(await esDispositivoPropietario(db))) {
    await marcarMarca(db, CLAVE_PIN_HASHES);
    return 0;
  }

  let encoladas = 0;
  const usuarios = await db.getAllAsync<{ id: number; uuid: string | null }>(
    `SELECT id, uuid FROM usuarios
     WHERE uuid IS NOT NULL AND pin IS NOT NULL AND pin <> ''`
  );
  for (const usuario of usuarios) {
    if (await tieneOpViva(db, 'usuario_upsert', usuario.uuid!)) continue;
    await encolarUsuarioUpsert(db, usuario.id);
    encoladas += 1;
  }

  await db.runAsync(
    `INSERT INTO settings (clave, valor, version, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at`,
    CLAVE_PIN_HASHES,
    String(Date.now()),
    ahoraIso()
  );
  return encoladas;
}
