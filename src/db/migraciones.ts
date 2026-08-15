import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_VERSION = 2;

export async function migrarBase(db: SQLiteDatabase) {
  const resultado = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const versionActual = resultado?.user_version ?? 0;

  // Autocuración: bases creadas por versiones antiguas del bundle pueden estar
  // marcadas con user_version 2 pero carecer de las columnas de stock.
  // Se verifica la estructura real y se repara sin depender del número de versión.
  const tabla = await db.getFirstAsync<{ n: number }>(
    `SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'productos'`
  );
  if (tabla && tabla.n > 0) {
    const columnas = await db.getAllAsync<{ name: string }>('PRAGMA table_info(productos)');
    const nombres = new Set(columnas.map((c) => c.name));
    const alteraciones: string[] = [];
    if (!nombres.has('stock')) {
      alteraciones.push('ALTER TABLE productos ADD COLUMN stock INTEGER NOT NULL DEFAULT 0');
    }
    if (!nombres.has('stock_minimo')) {
      alteraciones.push('ALTER TABLE productos ADD COLUMN stock_minimo INTEGER NOT NULL DEFAULT 5');
    }
    if (alteraciones.length > 0) {
      await db.execAsync(alteraciones.join(';'));
    }
  }

  if (versionActual >= DATABASE_VERSION) {
    return;
  }

  if (versionActual === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        rol TEXT NOT NULL DEFAULT 'dependiente' CHECK (rol IN ('admin','dependiente')),
        pin TEXT NOT NULL DEFAULT '',
        activo INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#E2E8F0',
        orden INTEGER NOT NULL DEFAULT 0,
        activo INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
        nombre TEXT NOT NULL,
        precio REAL NOT NULL DEFAULT 0,
        emoji TEXT NOT NULL DEFAULT '🍽️',
        color TEXT NOT NULL DEFAULT '#0EA5E9',
        orden INTEGER NOT NULL DEFAULT 0,
        activo INTEGER NOT NULL DEFAULT 1,
        stock INTEGER NOT NULL DEFAULT 0,
        stock_minimo INTEGER NOT NULL DEFAULT 5
      );

      CREATE TABLE IF NOT EXISTS turnos_caja (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        apertura TEXT NOT NULL,
        cierre TEXT,
        ventas_count INTEGER NOT NULL DEFAULT 0,
        total_esperado REAL NOT NULL DEFAULT 0,
        desglose_json TEXT NOT NULL DEFAULT '{}',
        dinero_real REAL,
        diferencia REAL,
        estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado'))
      );

      CREATE TABLE IF NOT EXISTS ventas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero INTEGER NOT NULL,
        turno_id INTEGER REFERENCES turnos_caja(id),
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        fecha_iso TEXT NOT NULL,
        subtotal REAL NOT NULL,
        descuento_pct REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL,
        forma_pago TEXT NOT NULL CHECK (forma_pago IN ('efectivo','transfermovil','enzona','transferencia','mixto')),
        monto_efectivo REAL NOT NULL DEFAULT 0,
        monto_digital REAL NOT NULL DEFAULT 0,
        anulada INTEGER NOT NULL DEFAULT 0,
        motivo_anulacion TEXT,
        anulada_por INTEGER REFERENCES usuarios(id),
        anulada_en TEXT
      );

      CREATE TABLE IF NOT EXISTS venta_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
        producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
        nombre TEXT NOT NULL,
        precio_unitario REAL NOT NULL,
        cantidad INTEGER NOT NULL,
        subtotal REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha_iso);
      CREATE INDEX IF NOT EXISTS idx_ventas_turno ON ventas(turno_id);
      CREATE INDEX IF NOT EXISTS idx_venta_items_venta ON venta_items(venta_id);
    `);
  } else if (versionActual === 1) {
    await db.execAsync(`
      ALTER TABLE productos ADD COLUMN stock INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE productos ADD COLUMN stock_minimo INTEGER NOT NULL DEFAULT 5;
    `);
  }

  if (versionActual < DATABASE_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  }
}
