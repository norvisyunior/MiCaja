import type { SQLiteDatabase } from 'expo-sqlite';
import type { Categoria, Producto, Rol, Usuario } from '../../types';
import { crearPinHash } from '../../utils/pin';
import { normalizarUsuario } from '../../utils/usuario';
import { ahoraIso, nuevoUuid, obtenerContextoLocal } from '../contexto';
import {
  encolarCategoriaUpsert,
  encolarProductoUpsert,
  encolarUsuarioUpsert,
} from '../sync/encolar';
import { registrarMovimientoLocal } from './inventario';

interface FilaProducto {
  id: number;
  uuid: string | null;
  categoria_id: number | null;
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

const A_PRODUCTO = (f: FilaProducto): Producto => ({
  id: f.id,
  uuid: f.uuid ?? undefined,
  categoriaId: f.categoria_id,
  nombre: f.nombre,
  precio: f.precio,
  emoji: f.emoji,
  color: f.color,
  imagen: f.imagen ?? null,
  orden: f.orden,
  activo: f.activo === 1,
  stock: f.stock,
  stockMinimo: f.stock_minimo,
  version: f.version,
  deletedAt: f.deleted_at,
});

export async function listarProductosActivos(db: SQLiteDatabase): Promise<Producto[]> {
  const filas = await db.getAllAsync<FilaProducto>(
    `SELECT * FROM productos
     WHERE activo = 1 AND deleted_at IS NULL
     ORDER BY orden, nombre`
  );
  return filas.map(A_PRODUCTO);
}

export async function listarProductos(db: SQLiteDatabase): Promise<Producto[]> {
  const filas = await db.getAllAsync<FilaProducto>(
    `SELECT * FROM productos WHERE deleted_at IS NULL ORDER BY orden, nombre`
  );
  return filas.map(A_PRODUCTO);
}

export async function crearProducto(
  db: SQLiteDatabase,
  p: Omit<Producto, 'id'>
): Promise<number> {
  let productoId = 0;

  await db.withTransactionAsync(async () => {
    const contexto = await obtenerContextoLocal(db);
    const uuid = nuevoUuid();
    const ahora = ahoraIso();

    const res = await db.runAsync(
      `INSERT INTO productos
         (uuid, empresa_id, categoria_id, nombre, precio, emoji, color, imagen,
          orden, activo, stock, stock_minimo, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
      uuid,
      contexto.empresaId,
      p.categoriaId,
      p.nombre,
      p.precio,
      p.emoji,
      p.color,
      p.imagen,
      p.orden,
      p.activo ? 1 : 0,
      p.stock,
      p.stockMinimo,
      ahora
    );
    productoId = res.lastInsertRowId;

    if (p.stock !== 0) {
      await registrarMovimientoLocal(db, {
        productoId,
        productoUuid: uuid,
        tipo: 'inicial',
        cantidad: p.stock,
        referenciaTipo: 'producto',
        referenciaId: uuid,
        // El stock inicial viaja en el propio producto_upsert (absoluto);
        // encolar además el movimiento duplicaría el inventario en el servidor.
        sincronizar: false,
      });
    }

    await encolarProductoUpsert(db, productoId);
  });

  return productoId;
}

export async function actualizarProducto(
  db: SQLiteDatabase,
  p: Producto
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const actual = await db.getFirstAsync<{
      uuid: string | null;
      version: number;
      stock: number;
    }>(`SELECT uuid, version, stock FROM productos WHERE id = ?`, p.id);
    if (!actual) return;

    const uuid = actual.uuid ?? nuevoUuid();
    const version = actual.version + 1;
    const ahora = ahoraIso();

    await db.runAsync(
      `UPDATE productos SET
         uuid = ?, categoria_id = ?, nombre = ?, precio = ?, emoji = ?, color = ?,
         imagen = ?, orden = ?, activo = ?, stock = ?, stock_minimo = ?,
         version = ?, updated_at = ?
       WHERE id = ?`,
      uuid,
      p.categoriaId,
      p.nombre,
      p.precio,
      p.emoji,
      p.color,
      p.imagen,
      p.orden,
      p.activo ? 1 : 0,
      p.stock,
      p.stockMinimo,
      version,
      ahora,
      p.id
    );

    const diferencia = p.stock - actual.stock;
    if (diferencia !== 0) {
      await registrarMovimientoLocal(db, {
        productoId: p.id,
        productoUuid: uuid,
        tipo: 'ajuste',
        cantidad: diferencia,
        referenciaTipo: 'ajuste',
        referenciaId: uuid,
        // El stock absoluto ya va en el producto_upsert de esta misma edición.
        sincronizar: false,
      });
    }

    await encolarProductoUpsert(db, p.id);
  });
}

export async function eliminarProducto(db: SQLiteDatabase, id: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    const actual = await db.getFirstAsync<{ uuid: string | null; version: number }>(
      `SELECT uuid, version FROM productos WHERE id = ?`,
      id
    );
    if (!actual) return;

    const ahora = ahoraIso();
    await db.runAsync(
      `UPDATE productos
       SET activo = 0, deleted_at = ?, version = ?, updated_at = ?
       WHERE id = ?`,
      ahora,
      actual.version + 1,
      ahora,
      id
    );
    await encolarProductoUpsert(db, id);
  });
}

interface FilaCategoria {
  id: number;
  uuid: string | null;
  nombre: string;
  color: string;
  orden: number;
  activo: number;
  version: number;
  deleted_at: string | null;
}

const A_CATEGORIA = (f: FilaCategoria): Categoria => ({
  id: f.id,
  uuid: f.uuid ?? undefined,
  nombre: f.nombre,
  color: f.color,
  orden: f.orden,
  activo: f.activo === 1,
  version: f.version,
  deletedAt: f.deleted_at,
});

export async function listarCategorias(db: SQLiteDatabase): Promise<Categoria[]> {
  const filas = await db.getAllAsync<FilaCategoria>(
    `SELECT * FROM categorias WHERE deleted_at IS NULL ORDER BY orden, nombre`
  );
  return filas.map(A_CATEGORIA);
}

export async function crearCategoria(
  db: SQLiteDatabase,
  c: Omit<Categoria, 'id'>
): Promise<number> {
  let categoriaId = 0;

  await db.withTransactionAsync(async () => {
    const contexto = await obtenerContextoLocal(db);
    const ahora = ahoraIso();
    const res = await db.runAsync(
      `INSERT INTO categorias
         (uuid, empresa_id, nombre, color, orden, activo, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
      nuevoUuid(),
      contexto.empresaId,
      c.nombre,
      c.color,
      c.orden,
      c.activo ? 1 : 0,
      ahora
    );
    categoriaId = res.lastInsertRowId;
    await encolarCategoriaUpsert(db, categoriaId);
  });

  return categoriaId;
}

export async function actualizarCategoria(
  db: SQLiteDatabase,
  c: Categoria
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const actual = await db.getFirstAsync<{ uuid: string | null; version: number }>(
      `SELECT uuid, version FROM categorias WHERE id = ?`,
      c.id
    );
    if (!actual) return;

    await db.runAsync(
      `UPDATE categorias SET
         uuid = ?, nombre = ?, color = ?, orden = ?, activo = ?,
         version = ?, updated_at = ?
       WHERE id = ?`,
      actual.uuid ?? nuevoUuid(),
      c.nombre,
      c.color,
      c.orden,
      c.activo ? 1 : 0,
      actual.version + 1,
      ahoraIso(),
      c.id
    );
    await encolarCategoriaUpsert(db, c.id);
  });
}

export async function eliminarCategoria(db: SQLiteDatabase, id: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    const actual = await db.getFirstAsync<{ uuid: string | null; version: number }>(
      `SELECT uuid, version FROM categorias WHERE id = ?`,
      id
    );
    if (!actual) return;

    const ahora = ahoraIso();
    const productos = await db.getAllAsync<{ id: number }>(
      `SELECT id FROM productos WHERE categoria_id = ? AND deleted_at IS NULL`,
      id
    );

    for (const producto of productos) {
      await db.runAsync(
        `UPDATE productos
         SET categoria_id = NULL, version = version + 1, updated_at = ?
         WHERE id = ?`,
        ahora,
        producto.id
      );
      await encolarProductoUpsert(db, producto.id);
    }

    await db.runAsync(
      `UPDATE categorias
       SET activo = 0, deleted_at = ?, version = ?, updated_at = ?
       WHERE id = ?`,
      ahora,
      actual.version + 1,
      ahora,
      id
    );
    await encolarCategoriaUpsert(db, id);
  });
}

interface FilaUsuario {
  id: number;
  uuid: string | null;
  nombre: string;
  usuario: string | null;
  rol: string;
  activo: number;
  version: number;
  deleted_at: string | null;
}

const A_USUARIO = (f: FilaUsuario): Usuario => ({
  id: f.id,
  uuid: f.uuid ?? undefined,
  nombre: f.nombre,
  usuario: f.usuario ?? '',
  rol: f.rol === 'admin' ? 'admin' : 'dependiente',
  activo: f.activo === 1,
  version: f.version,
  deletedAt: f.deleted_at,
});

export interface NuevoUsuario {
  nombre: string;
  usuario: string;
  rol: Rol;
  activo: boolean;
  pin: string;
}

export async function listarUsuariosActivos(db: SQLiteDatabase): Promise<Usuario[]> {
  const filas = await db.getAllAsync<FilaUsuario>(
    `SELECT * FROM usuarios
     WHERE activo = 1 AND deleted_at IS NULL
     ORDER BY id`
  );
  return filas.map(A_USUARIO);
}

export async function listarUsuarios(db: SQLiteDatabase): Promise<Usuario[]> {
  const filas = await db.getAllAsync<FilaUsuario>(
    `SELECT * FROM usuarios WHERE deleted_at IS NULL ORDER BY id`
  );
  return filas.map(A_USUARIO);
}

export async function obtenerUsuario(
  db: SQLiteDatabase,
  id: number
): Promise<Usuario | null> {
  const fila = await db.getFirstAsync<FilaUsuario>(
    `SELECT * FROM usuarios WHERE id = ? AND deleted_at IS NULL`,
    id
  );
  return fila ? A_USUARIO(fila) : null;
}

export async function crearUsuario(
  db: SQLiteDatabase,
  u: NuevoUsuario
): Promise<number> {
  const pinHash = await crearPinHash(u.pin);
  let usuarioId = 0;

  await db.withTransactionAsync(async () => {
    const contexto = await obtenerContextoLocal(db);
    const ahora = ahoraIso();
    const res = await db.runAsync(
      `INSERT INTO usuarios
         (uuid, empresa_id, nombre, usuario, rol, pin, activo,
          intentos_fallidos, bloqueado_hasta, updated_at, deleted_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, NULL, 1)`,
      nuevoUuid(),
      contexto.empresaId,
      u.nombre,
      normalizarUsuario(u.usuario),
      u.rol,
      pinHash,
      u.activo ? 1 : 0,
      ahora
    );
    usuarioId = res.lastInsertRowId;
    await encolarUsuarioUpsert(db, usuarioId);
  });

  return usuarioId;
}

/** Comprueba si un nombre de usuario ya está tomado (sin distinguir mayúsculas). */
export async function existeNombreUsuario(
  db: SQLiteDatabase,
  usuario: string,
  exceptoId?: number
): Promise<boolean> {
  const consulta = `SELECT COUNT(*) AS n FROM usuarios
     WHERE usuario = ? COLLATE NOCASE AND deleted_at IS NULL${exceptoId ? ' AND id <> ?' : ''}`;
  const fila = exceptoId
    ? await db.getFirstAsync<{ n: number }>(consulta, normalizarUsuario(usuario), exceptoId)
    : await db.getFirstAsync<{ n: number }>(consulta, normalizarUsuario(usuario));
  return (fila?.n ?? 0) > 0;
}

/**
 * Actualiza los datos de un usuario. Si `pinNuevo` se omite, conserva el PIN
 * actual; si se envía, lo reemplaza por su hash y limpia el bloqueo.
 */
export async function actualizarUsuario(
  db: SQLiteDatabase,
  u: Usuario,
  pinNuevo?: string
): Promise<void> {
  const pinHash = pinNuevo ? await crearPinHash(pinNuevo) : null;

  await db.withTransactionAsync(async () => {
    const actual = await db.getFirstAsync<{ uuid: string | null; version: number }>(
      `SELECT uuid, version FROM usuarios WHERE id = ?`,
      u.id
    );
    if (!actual) return;

    const uuid = actual.uuid ?? nuevoUuid();
    const version = actual.version + 1;
    const ahora = ahoraIso();

    if (pinHash) {
      await db.runAsync(
        `UPDATE usuarios
         SET uuid = ?, nombre = ?, usuario = ?, rol = ?, activo = ?, pin = ?,
             intentos_fallidos = 0, bloqueado_hasta = NULL,
             version = ?, updated_at = ?
         WHERE id = ?`,
        uuid,
        u.nombre,
        normalizarUsuario(u.usuario),
        u.rol,
        u.activo ? 1 : 0,
        pinHash,
        version,
        ahora,
        u.id
      );
    } else {
      await db.runAsync(
        `UPDATE usuarios
         SET uuid = ?, nombre = ?, usuario = ?, rol = ?, activo = ?,
             version = ?, updated_at = ?
         WHERE id = ?`,
        uuid,
        u.nombre,
        normalizarUsuario(u.usuario),
        u.rol,
        u.activo ? 1 : 0,
        version,
        ahora,
        u.id
      );
    }

    await encolarUsuarioUpsert(db, u.id);
  });
}

export async function eliminarUsuario(db: SQLiteDatabase, id: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    const actual = await db.getFirstAsync<{ uuid: string | null; version: number }>(
      `SELECT uuid, version FROM usuarios WHERE id = ?`,
      id
    );
    if (!actual) return;

    const ahora = ahoraIso();
    await db.runAsync(
      `UPDATE usuarios
       SET activo = 0, deleted_at = ?, version = ?, updated_at = ?
       WHERE id = ?`,
      ahora,
      actual.version + 1,
      ahora,
      id
    );
    await encolarUsuarioUpsert(db, id);
  });
}
