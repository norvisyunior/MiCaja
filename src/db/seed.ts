import type { SQLiteDatabase } from 'expo-sqlite';
import { claveDiaLocal } from '../utils/fechas';

export async function sembrarDatosIniciales(db: SQLiteDatabase) {
  // Se usa la tabla settings como marca de siembra: así, si el usuario borra
  // todas las cuentas, no se recrean datos ni se duplican productos.
  const fila = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM settings'
  );

  if (fila && fila.count > 0) {
    return;
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO settings (clave, valor) VALUES (?, ?)`,
      ['nombre_negocio', 'Mi Negocio']
    );
    await db.runAsync(
      `INSERT INTO settings (clave, valor) VALUES (?, ?)`,
      ['simbolo_moneda', '$']
    );
    await db.runAsync(
      `INSERT INTO settings (clave, valor) VALUES (?, ?)`,
      ['moneda', 'CUP']
    );
    await db.runAsync(
      `INSERT INTO settings (clave, valor) VALUES (?, ?)`,
      ['dia_venta', claveDiaLocal()]
    );
    await db.runAsync(
      `INSERT INTO settings (clave, valor) VALUES (?, ?)`,
      ['numero_venta_dia', '0']
    );
    await db.runAsync(
      `INSERT INTO settings (clave, valor) VALUES (?, ?)`,
      ['tema', 'claro']
    );

    // No se crean usuarios por defecto: el primer arranque obliga a configurar
    // un administrador con su propio PIN.

    const { lastInsertRowId: catBebidas } = await db.runAsync(
      `INSERT INTO categorias (nombre, color, orden, activo) VALUES (?, ?, 1, 1)`,
      'Bebidas',
      '#0EA5E9'
    );
    const { lastInsertRowId: catComida } = await db.runAsync(
      `INSERT INTO categorias (nombre, color, orden, activo) VALUES (?, ?, 2, 1)`,
      'Comida',
      '#F59E0B'
    );
    const { lastInsertRowId: catDulces } = await db.runAsync(
      `INSERT INTO categorias (nombre, color, orden, activo) VALUES (?, ?, 3, 1)`,
      'Dulces',
      '#EC4899'
    );

    const productos: Array<[number, string, number, string, string, number, number, number]> = [
      [catBebidas, 'Refresco', 50, '🥤', '#0EA5E9', 1, 30, 10],
      [catBebidas, 'Café', 40, '☕', '#8B5CF6', 2, 40, 10],
      [catComida, 'Pizza', 250, '🍕', '#F59E0B', 3, 12, 5],
      [catComida, 'Hamburguesa', 200, '🍔', '#EF4444', 4, 15, 5],
      [catComida, 'Papas', 100, '🍟', '#F97316', 5, 3, 5],
      [catDulces, 'Helado', 60, '🍦', '#EC4899', 6, 0, 5],
    ];

    for (const [categoriaId, nombre, precio, emoji, color, orden, stock, stockMinimo] of productos) {
      await db.runAsync(
        `INSERT INTO productos (categoria_id, nombre, precio, emoji, color, orden, activo, stock, stock_minimo)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        categoriaId,
        nombre,
        precio,
        emoji,
        color,
        orden,
        stock,
        stockMinimo
      );
    }
  });
}
