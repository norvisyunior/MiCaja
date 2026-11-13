import type { SQLiteDatabase } from 'expo-sqlite';
import type { Categoria, Producto, Rol, Usuario } from '../../types';
import { crearPinHash } from '../../utils/pin';
import { normalizarUsuario } from '../../utils/usuario';

interface FilaProducto {
  id: number;
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
}

const A_PRODUCTO = (f: FilaProducto): Producto => ({
  id: f.id,
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
});

export async function listarProductosActivos(db: SQLiteDatabase): Promise<Producto[]> {
  const filas = await db.getAllAsync<FilaProducto>(
    `SELECT * FROM productos WHERE activo = 1 ORDER BY orden, nombre`
  );
  return filas.map(A_PRODUCTO);
}

export async function listarProductos(db: SQLiteDatabase): Promise<Producto[]> {
  const filas = await db.getAllAsync<FilaProducto>(
    `SELECT * FROM productos ORDER BY orden, nombre`
  );
  return filas.map(A_PRODUCTO);
}

export async function crearProducto(
  db: SQLiteDatabase,
  p: Omit<Producto, 'id'>
): Promise<number> {
  const res = await db.runAsync(
    `INSERT INTO productos (categoria_id, nombre, precio, emoji, color, imagen, orden, activo, stock, stock_minimo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    p.categoriaId,
    p.nombre,
    p.precio,
    p.emoji,
    p.color,
    p.imagen,
    p.orden,
    p.activo ? 1 : 0,
    p.stock,
    p.stockMinimo
  );
  return res.lastInsertRowId;
}

export async function actualizarProducto(
  db: SQLiteDatabase,
  p: Producto
): Promise<void> {
  await db.runAsync(
    `UPDATE productos SET categoria_id = ?, nombre = ?, precio = ?, emoji = ?, color = ?, imagen = ?, orden = ?, activo = ?, stock = ?, stock_minimo = ?
     WHERE id = ?`,
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
    p.id
  );
}

export async function eliminarProducto(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(`DELETE FROM productos WHERE id = ?`, id);
}

interface FilaCategoria {
  id: number;
  nombre: string;
  color: string;
  orden: number;
  activo: number;
}

const A_CATEGORIA = (f: FilaCategoria): Categoria => ({
  id: f.id,
  nombre: f.nombre,
  color: f.color,
  orden: f.orden,
  activo: f.activo === 1,
});

export async function listarCategorias(db: SQLiteDatabase): Promise<Categoria[]> {
  const filas = await db.getAllAsync<FilaCategoria>(
    `SELECT * FROM categorias ORDER BY orden, nombre`
  );
  return filas.map(A_CATEGORIA);
}

export async function crearCategoria(
  db: SQLiteDatabase,
  c: Omit<Categoria, 'id'>
): Promise<number> {
  const res = await db.runAsync(
    `INSERT INTO categorias (nombre, color, orden, activo) VALUES (?, ?, ?, ?)`,
    c.nombre,
    c.color,
    c.orden,
    c.activo ? 1 : 0
  );
  return res.lastInsertRowId;
}

export async function actualizarCategoria(
  db: SQLiteDatabase,
  c: Categoria
): Promise<void> {
  await db.runAsync(
    `UPDATE categorias SET nombre = ?, color = ?, orden = ?, activo = ? WHERE id = ?`,
    c.nombre,
    c.color,
    c.orden,
    c.activo ? 1 : 0,
    c.id
  );
}

export async function eliminarCategoria(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(`DELETE FROM categorias WHERE id = ?`, id);
}

interface FilaUsuario {
  id: number;
  nombre: string;
  usuario: string | null;
  rol: string;
  activo: number;
}

const A_USUARIO = (f: FilaUsuario): Usuario => ({
  id: f.id,
  nombre: f.nombre,
  usuario: f.usuario ?? '',
  rol: f.rol === 'admin' ? 'admin' : 'dependiente',
  activo: f.activo === 1,
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
    `SELECT * FROM usuarios WHERE activo = 1 ORDER BY id`
  );
  return filas.map(A_USUARIO);
}

export async function listarUsuarios(db: SQLiteDatabase): Promise<Usuario[]> {
  const filas = await db.getAllAsync<FilaUsuario>(`SELECT * FROM usuarios ORDER BY id`);
  return filas.map(A_USUARIO);
}

export async function obtenerUsuario(
  db: SQLiteDatabase,
  id: number
): Promise<Usuario | null> {
  const fila = await db.getFirstAsync<FilaUsuario>(
    `SELECT * FROM usuarios WHERE id = ?`,
    id
  );
  return fila ? A_USUARIO(fila) : null;
}

export async function crearUsuario(
  db: SQLiteDatabase,
  u: NuevoUsuario
): Promise<number> {
  const pinHash = await crearPinHash(u.pin);
  const res = await db.runAsync(
    `INSERT INTO usuarios (nombre, usuario, rol, pin, activo, intentos_fallidos, bloqueado_hasta)
     VALUES (?, ?, ?, ?, ?, 0, NULL)`,
    u.nombre,
    normalizarUsuario(u.usuario),
    u.rol,
    pinHash,
    u.activo ? 1 : 0
  );
  return res.lastInsertRowId;
}

/** Comprueba si un nombre de usuario ya está tomado (sin distinguir mayúsculas). */
export async function existeNombreUsuario(
  db: SQLiteDatabase,
  usuario: string,
  exceptoId?: number
): Promise<boolean> {
  const consulta = `SELECT COUNT(*) AS n FROM usuarios
     WHERE usuario = ? COLLATE NOCASE${exceptoId ? ' AND id <> ?' : ''}`;
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
  if (pinNuevo) {
    const pinHash = await crearPinHash(pinNuevo);
    await db.runAsync(
      `UPDATE usuarios
       SET nombre = ?, usuario = ?, rol = ?, activo = ?, pin = ?, intentos_fallidos = 0, bloqueado_hasta = NULL
       WHERE id = ?`,
      u.nombre,
      normalizarUsuario(u.usuario),
      u.rol,
      u.activo ? 1 : 0,
      pinHash,
      u.id
    );
    return;
  }

  await db.runAsync(
    `UPDATE usuarios SET nombre = ?, usuario = ?, rol = ?, activo = ? WHERE id = ?`,
    u.nombre,
    normalizarUsuario(u.usuario),
    u.rol,
    u.activo ? 1 : 0,
    u.id
  );
}

export async function eliminarUsuario(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(`DELETE FROM usuarios WHERE id = ?`, id);
}
