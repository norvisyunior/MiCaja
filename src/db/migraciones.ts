import type { SQLiteDatabase } from 'expo-sqlite';
import { imagenArchivoADataUri } from '../utils/imagenes';
import { crearPinHash, esPinHasheado } from '../utils/pin';
import { generarUsuarioDesdeNombre, normalizarUsuario } from '../utils/usuario';

export const DATABASE_VERSION = 6;

/**
 * Garantiza que todas las cuentas tengan un nombre de usuario único.
 * Se ejecuta al migrar bases antiguas y al restaurar un backup, de modo que
 * nadie se quede sin poder iniciar sesión.
 */
export async function asegurarUsernames(db: SQLiteDatabase): Promise<void> {
  const filas = await db.getAllAsync<{ id: number; nombre: string; usuario: string | null }>(
    `SELECT id, nombre, usuario FROM usuarios`
  );

  const usados = new Set<string>();
  for (const fila of filas) {
    const actual = normalizarUsuario(fila.usuario ?? '');
    if (actual) usados.add(actual);
  }

  for (const fila of filas) {
    const actual = normalizarUsuario(fila.usuario ?? '');
    if (actual) continue;

    const base = generarUsuarioDesdeNombre(fila.nombre);
    let candidato = base;
    let numero = 2;
    while (usados.has(candidato)) {
      const sufijo = String(numero++);
      candidato = `${base.slice(0, 20 - sufijo.length)}${sufijo}`;
    }

    usados.add(candidato);
    await db.runAsync(`UPDATE usuarios SET usuario = ? WHERE id = ?`, candidato, fila.id);
  }
}

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
    if (!nombres.has('imagen')) {
      alteraciones.push('ALTER TABLE productos ADD COLUMN imagen TEXT');
    }
    if (alteraciones.length > 0) {
      await db.execAsync(alteraciones.join(';'));
    }
  }

  // Autocuración de las columnas de seguridad del PIN.
  const tablaUsuarios = await db.getFirstAsync<{ n: number }>(
    `SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'usuarios'`
  );
  if (tablaUsuarios && tablaUsuarios.n > 0) {
    const columnas = await db.getAllAsync<{ name: string }>('PRAGMA table_info(usuarios)');
    const nombres = new Set(columnas.map((c) => c.name));
    const alteraciones: string[] = [];
    if (!nombres.has('intentos_fallidos')) {
      alteraciones.push('ALTER TABLE usuarios ADD COLUMN intentos_fallidos INTEGER NOT NULL DEFAULT 0');
    }
    if (!nombres.has('bloqueado_hasta')) {
      alteraciones.push('ALTER TABLE usuarios ADD COLUMN bloqueado_hasta TEXT');
    }
    if (!nombres.has('usuario')) {
      alteraciones.push(`ALTER TABLE usuarios ADD COLUMN usuario TEXT NOT NULL DEFAULT ''`);
    }
    if (alteraciones.length > 0) {
      await db.execAsync(alteraciones.join(';'));
    }

    // Rellena usuarios vacíos (bases antiguas o backups restaurados) antes de
    // crear el índice único.
    await asegurarUsernames(db);
    try {
      await db.execAsync(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario
         ON usuarios(usuario COLLATE NOCASE)`
      );
    } catch {
      // Si una base muy antigua tuviera duplicados, el índice se creará al
      // corregir los usuarios desde Ajustes.
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
        usuario TEXT NOT NULL DEFAULT '',
        rol TEXT NOT NULL DEFAULT 'dependiente' CHECK (rol IN ('admin','dependiente')),
        pin TEXT NOT NULL DEFAULT '',
        activo INTEGER NOT NULL DEFAULT 1,
        intentos_fallidos INTEGER NOT NULL DEFAULT 0,
        bloqueado_hasta TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario
        ON usuarios(usuario COLLATE NOCASE);

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
        imagen TEXT,
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
    if (versionActual < 4) {
      const productos = await db.getAllAsync<{ id: number; imagen: string | null }>(
        `SELECT id, imagen FROM productos WHERE imagen IS NOT NULL AND imagen LIKE 'file://%'`
      );
      for (const p of productos) {
        const dataUri = await imagenArchivoADataUri(p.imagen!);
        await db.runAsync(`UPDATE productos SET imagen = ? WHERE id = ?`, dataUri, p.id);
      }
    }

    // v5: convertir los PIN en texto plano a hashes con sal.
    if (versionActual < 5) {
      const usuarios = await db.getAllAsync<{ id: number; pin: string }>(
        `SELECT id, pin FROM usuarios`
      );
      for (const u of usuarios) {
        if (!u.pin || esPinHasheado(u.pin)) continue;
        const hash = await crearPinHash(u.pin);
        await db.runAsync(`UPDATE usuarios SET pin = ? WHERE id = ?`, hash, u.id);
      }
    }

    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  }
}
