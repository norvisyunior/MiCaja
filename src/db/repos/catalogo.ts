import type { SQLiteDatabase } from 'expo-sqlite';
import type { Categoria, Producto, Usuario } from '../../types';

interface FilaProducto {
  id: number;
  categoria_id: number | null;
  nombre: string;
  precio: number;
  emoji: string;
  color: string;
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
    `INSERT INTO productos (categoria_id, nombre, precio, emoji, color, orden, activo, stock, stock_minimo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    p.categoriaId,
    p.nombre,
    p.precio,
    p.emoji,
    p.color,
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
    `UPDATE productos SET categoria_id = ?, nombre = ?, precio = ?, emoji = ?, color = ?, orden = ?, activo = ?, stock = ?, stock_minimo = ?
     WHERE id = ?`,
    p.categoriaId,
    p.nombre,
    p.precio,
    p.emoji,
    p.color,
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
  rol: string;
  pin: string;
  activo: number;
}

const A_USUARIO = (f: FilaUsuario): Usuario => ({
  id: f.id,
  nombre: f.nombre,
  rol: f.rol === 'admin' ? 'admin' : 'dependiente',
  pin: f.pin,
  activo: f.activo === 1,
});

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
  u: Omit<Usuario, 'id'>
): Promise<number> {
  const res = await db.runAsync(
    `INSERT INTO usuarios (nombre, rol, pin, activo) VALUES (?, ?, ?, ?)`,
    u.nombre,
    u.rol,
    u.pin,
    u.activo ? 1 : 0
  );
  return res.lastInsertRowId;
}

export async function actualizarUsuario(db: SQLiteDatabase, u: Usuario): Promise<void> {
  await db.runAsync(
    `UPDATE usuarios SET nombre = ?, rol = ?, pin = ?, activo = ? WHERE id = ?`,
    u.nombre,
    u.rol,
    u.pin,
    u.activo ? 1 : 0,
    u.id
  );
}

export async function eliminarUsuario(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(`DELETE FROM usuarios WHERE id = ?`, id);
}
