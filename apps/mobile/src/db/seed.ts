import type { SQLiteDatabase } from 'expo-sqlite';
import { claveDiaLocal } from '../utils/fechas';
import { ahoraIso, nuevoUuid, obtenerContextoLocal } from './contexto';
import { registrarMovimientoLocal } from './repos/inventario';

/**
 * Datos de demostración de una instalación nueva.
 *
 * Se guardan solo en local: no se encolan para sincronizar. Un dispositivo
 * recién instalado aún no sabe si será el negocio (propietario) o una
 * terminal invitada; enviar el catálogo demo antes de activar contaminaría
 * el negocio real. Al activarse como propietario, `encolarSnapshotInicial`
 * sube la foto completa una sola vez.
 */
async function insertarSetting(
  db: SQLiteDatabase,
  clave: string,
  valor: string
): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO settings (clave, valor, version, updated_at)
     VALUES (?, ?, 1, ?)`,
    clave,
    valor,
    ahoraIso()
  );
}

export async function sembrarDatosIniciales(db: SQLiteDatabase): Promise<void> {
  const marcador = await db.getFirstAsync<{ valor: string }>(
    `SELECT valor FROM settings WHERE clave = 'datos_iniciales'`
  );
  if (marcador?.valor === '1') return;

  const categoriasExistentes = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM categorias`
  );
  const negocioExistente = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM settings WHERE clave = 'nombre_negocio'`
  );

  if ((categoriasExistentes?.total ?? 0) > 0 || (negocioExistente?.total ?? 0) > 0) {
    await db.runAsync(
      `INSERT OR IGNORE INTO settings (clave, valor, version, updated_at)
       VALUES ('datos_iniciales', '1', 1, ?)`,
      ahoraIso()
    );
    return;
  }

  await db.withTransactionAsync(async () => {
    const contexto = await obtenerContextoLocal(db);
    const ahora = ahoraIso();

    await insertarSetting(db, 'nombre_negocio', 'Mi Negocio');
    await insertarSetting(db, 'simbolo_moneda', '$');
    await insertarSetting(db, 'moneda', 'CUP');
    await insertarSetting(db, 'dia_venta', claveDiaLocal());
    await insertarSetting(db, 'numero_venta_dia', '0');
    await insertarSetting(db, 'tema', 'claro');

    // No se crean usuarios por defecto: el primer arranque obliga a configurar
    // un administrador con su propio PIN.

    const categorias: Array<[string, string, number]> = [
      ['Bebidas', '#0EA5E9', 1],
      ['Comida', '#F59E0B', 2],
      ['Dulces', '#EC4899', 3],
    ];
    const idsCategorias: number[] = [];

    for (const [nombre, color, orden] of categorias) {
      const res = await db.runAsync(
        `INSERT INTO categorias
           (uuid, empresa_id, nombre, color, orden, activo, updated_at, deleted_at, version)
         VALUES (?, ?, ?, ?, ?, 1, ?, NULL, 1)`,
        nuevoUuid(),
        contexto.empresaId,
        nombre,
        color,
        orden,
        ahora
      );
      idsCategorias.push(res.lastInsertRowId);
    }

    const productos: Array<{
      categoria: number;
      nombre: string;
      precio: number;
      emoji: string;
      color: string;
      orden: number;
      stock: number;
      stockMinimo: number;
    }> = [
      { categoria: idsCategorias[0], nombre: 'Refresco', precio: 50, emoji: '🥤', color: '#0EA5E9', orden: 1, stock: 30, stockMinimo: 10 },
      { categoria: idsCategorias[0], nombre: 'Café', precio: 40, emoji: '☕', color: '#8B5CF6', orden: 2, stock: 40, stockMinimo: 10 },
      { categoria: idsCategorias[1], nombre: 'Pizza', precio: 250, emoji: '🍕', color: '#F59E0B', orden: 3, stock: 12, stockMinimo: 5 },
      { categoria: idsCategorias[1], nombre: 'Hamburguesa', precio: 200, emoji: '🍔', color: '#EF4444', orden: 4, stock: 15, stockMinimo: 5 },
      { categoria: idsCategorias[1], nombre: 'Papas', precio: 100, emoji: '🍟', color: '#F97316', orden: 5, stock: 3, stockMinimo: 5 },
      { categoria: idsCategorias[2], nombre: 'Helado', precio: 60, emoji: '🍦', color: '#EC4899', orden: 6, stock: 0, stockMinimo: 5 },
    ];

    for (const producto of productos) {
      const uuid = nuevoUuid();
      const res = await db.runAsync(
        `INSERT INTO productos
           (uuid, empresa_id, categoria_id, nombre, precio, emoji, color, orden,
            activo, stock, stock_minimo, updated_at, deleted_at, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, NULL, 1)`,
        uuid,
        contexto.empresaId,
        producto.categoria,
        producto.nombre,
        producto.precio,
        producto.emoji,
        producto.color,
        producto.orden,
        producto.stock,
        producto.stockMinimo,
        ahora
      );

      if (producto.stock !== 0) {
        await registrarMovimientoLocal(db, {
          productoId: res.lastInsertRowId,
          productoUuid: uuid,
          tipo: 'inicial',
          cantidad: producto.stock,
          referenciaTipo: 'producto',
          referenciaId: uuid,
          // El stock viaja en el producto_upsert; el movimiento queda local.
          sincronizar: false,
        });
      }
    }

    await db.runAsync(
      `INSERT OR IGNORE INTO settings (clave, valor, version, updated_at)
       VALUES ('datos_iniciales', '1', 1, ?)`,
      ahora
    );
  });
}
