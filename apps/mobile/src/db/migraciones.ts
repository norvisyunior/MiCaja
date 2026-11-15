import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { imagenArchivoADataUri } from '../utils/imagenes';
import { crearPinHash, esPinHasheado } from '../utils/pin';
import { generarUsuarioDesdeNombre, normalizarUsuario } from '../utils/usuario';

export const DATABASE_VERSION = 7;

async function existeTabla(db: SQLiteDatabase, tabla: string): Promise<boolean> {
  const fila = await db.getFirstAsync<{ n: number }>(
    `SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?`,
    tabla
  );
  return (fila?.n ?? 0) > 0;
}

async function columnasDeTabla(db: SQLiteDatabase, tabla: string): Promise<Set<string>> {
  const columnas = await db.getAllAsync<{ name: string }>(`PRAGMA table_info("${tabla}")`);
  return new Set(columnas.map((columna) => columna.name));
}

async function agregarColumnas(
  db: SQLiteDatabase,
  tabla: string,
  definiciones: Array<[nombre: string, definicion: string]>
): Promise<void> {
  if (!(await existeTabla(db, tabla))) return;
  const existentes = await columnasDeTabla(db, tabla);
  const faltantes = definiciones
    .filter(([nombre]) => !existentes.has(nombre))
    .map(([nombre, definicion]) => `ALTER TABLE "${tabla}" ADD COLUMN ${nombre} ${definicion}`);
  if (faltantes.length > 0) {
    await db.execAsync(faltantes.join(';'));
  }
}

async function leerSettingDirecto(db: SQLiteDatabase, clave: string): Promise<string> {
  const fila = await db.getFirstAsync<{ valor: string }>(
    `SELECT valor FROM settings WHERE clave = ?`,
    clave
  );
  return fila?.valor ?? '';
}

async function guardarSettingDirecto(
  db: SQLiteDatabase,
  clave: string,
  valor: string
): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (clave, valor, version, updated_at) VALUES (?, ?, 1, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
    clave,
    valor,
    new Date().toISOString()
  );
}

async function inicializarSettingDirecto(
  db: SQLiteDatabase,
  clave: string,
  valor: string
): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO settings (clave, valor, version, updated_at) VALUES (?, ?, 1, ?)`,
    clave,
    valor,
    new Date().toISOString()
  );
}

async function rellenarUuids(
  db: SQLiteDatabase,
  tabla: string,
  empresaId: string,
  deviceId?: string
): Promise<void> {
  if (!(await existeTabla(db, tabla))) return;

  const filas = await db.getAllAsync<{ id: number; uuid: string | null }>(
    `SELECT id, uuid FROM "${tabla}" WHERE uuid IS NULL OR uuid = ''`
  );
  for (const fila of filas) {
    await db.runAsync(`UPDATE "${tabla}" SET uuid = ? WHERE id = ?`, Crypto.randomUUID(), fila.id);
  }

  await db.runAsync(
    `UPDATE "${tabla}" SET empresa_id = ? WHERE empresa_id IS NULL OR empresa_id = ''`,
    empresaId
  );

  if (deviceId) {
    await db.runAsync(
      `UPDATE "${tabla}" SET device_id = ? WHERE device_id IS NULL OR device_id = ''`,
      deviceId
    );
  }
}

/**
 * Estructura v7: identidad local, outbox, licencia y libro de inventario.
 * Es idempotente para poder reparar bases creadas por versiones intermedias.
 */
export async function asegurarEstructuraV7(db: SQLiteDatabase): Promise<void> {
  await agregarColumnas(db, 'usuarios', [
    ['uuid', 'TEXT'],
    ['empresa_id', `TEXT NOT NULL DEFAULT ''`],
    ['updated_at', 'TEXT'],
    ['deleted_at', 'TEXT'],
    ['version', 'INTEGER NOT NULL DEFAULT 1'],
  ]);
  await agregarColumnas(db, 'categorias', [
    ['uuid', 'TEXT'],
    ['empresa_id', `TEXT NOT NULL DEFAULT ''`],
    ['updated_at', 'TEXT'],
    ['deleted_at', 'TEXT'],
    ['version', 'INTEGER NOT NULL DEFAULT 1'],
  ]);
  await agregarColumnas(db, 'productos', [
    ['uuid', 'TEXT'],
    ['empresa_id', `TEXT NOT NULL DEFAULT ''`],
    ['updated_at', 'TEXT'],
    ['deleted_at', 'TEXT'],
    ['version', 'INTEGER NOT NULL DEFAULT 1'],
  ]);
  await agregarColumnas(db, 'turnos_caja', [
    ['uuid', 'TEXT'],
    ['empresa_id', `TEXT NOT NULL DEFAULT ''`],
    ['device_id', `TEXT NOT NULL DEFAULT ''`],
    ['updated_at', 'TEXT'],
  ]);
  await agregarColumnas(db, 'ventas', [
    ['uuid', 'TEXT'],
    ['empresa_id', `TEXT NOT NULL DEFAULT ''`],
    ['device_id', `TEXT NOT NULL DEFAULT ''`],
    ['updated_at', 'TEXT'],
    ['servidor_id', 'TEXT'],
    ['numero_servidor', 'INTEGER'],
  ]);
  await agregarColumnas(db, 'venta_items', [
    ['uuid', 'TEXT'],
    ['empresa_id', `TEXT NOT NULL DEFAULT ''`],
  ]);
  await agregarColumnas(db, 'settings', [
    ['version', 'INTEGER NOT NULL DEFAULT 1'],
    ['updated_at', 'TEXT'],
  ]);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY,
      empresa_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      tipo TEXT NOT NULL,
      entidad TEXT NOT NULL,
      entidad_uuid TEXT,
      payload TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      intentos INTEGER NOT NULL DEFAULT 0,
      siguiente_intento TEXT,
      ultimo_error TEXT,
      prioridad INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL,
      UNIQUE (empresa_id, operation_id)
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      entidad TEXT PRIMARY KEY,
      server_seq INTEGER NOT NULL DEFAULT 0,
      ultima_sync TEXT
    );

    CREATE TABLE IF NOT EXISTS dispositivo_local (
      device_id TEXT PRIMARY KEY,
      empresa_id TEXT NOT NULL,
      nombre TEXT NOT NULL,
      plataforma TEXT NOT NULL,
      app_version TEXT NOT NULL,
      activado_en TEXT,
      last_sync_at TEXT
    );

    CREATE TABLE IF NOT EXISTS licencia_local (
      license_id TEXT PRIMARY KEY,
      empresa_id TEXT NOT NULL,
      device_id TEXT,
      plan TEXT NOT NULL,
      features TEXT NOT NULL,
      activada_en TEXT,
      vence_en TEXT NOT NULL,
      grace_until TEXT,
      key_id TEXT NOT NULL,
      token TEXT NOT NULL,
      ultima_verificacion TEXT,
      estado TEXT NOT NULL DEFAULT 'activa'
    );

    CREATE TABLE IF NOT EXISTS movimientos_inventario (
      id TEXT PRIMARY KEY,
      empresa_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      producto_id INTEGER NOT NULL,
      producto_uuid TEXT NOT NULL,
      tipo TEXT NOT NULL,
      cantidad REAL NOT NULL,
      referencia_tipo TEXT,
      referencia_id TEXT,
      usuario_id INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_movimientos_producto
      ON movimientos_inventario(producto_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_movimientos_referencia
      ON movimientos_inventario(referencia_tipo, referencia_id);
  `);

  await agregarColumnas(db, 'sync_outbox', [['prioridad', 'INTEGER NOT NULL DEFAULT 3']]);

  let empresaId = await leerSettingDirecto(db, 'empresa_id');
  if (!empresaId) {
    empresaId = Crypto.randomUUID();
    await guardarSettingDirecto(db, 'empresa_id', empresaId);
  }

  let deviceId = await leerSettingDirecto(db, 'device_id');
  if (!deviceId) {
    deviceId = Crypto.randomUUID();
    await guardarSettingDirecto(db, 'device_id', deviceId);
  }

  await inicializarSettingDirecto(db, 'sync_server_seq', '0');
  await inicializarSettingDirecto(db, 'licencia_token', '');
  await inicializarSettingDirecto(db, 'licencia_ultima_verificacion', '');

  for (const tabla of ['usuarios', 'categorias', 'productos', 'venta_items']) {
    await rellenarUuids(db, tabla, empresaId);
  }
  for (const tabla of ['turnos_caja', 'ventas']) {
    await rellenarUuids(db, tabla, empresaId, deviceId);
  }

  const ahora = new Date().toISOString();
  for (const tabla of ['usuarios', 'categorias', 'productos', 'turnos_caja', 'ventas']) {
    if (await existeTabla(db, tabla)) {
      await db.runAsync(
        `UPDATE "${tabla}" SET updated_at = ? WHERE updated_at IS NULL`,
        ahora
      );
    }
  }

  await db.execAsync(`DROP INDEX IF EXISTS idx_usuarios_usuario;`);
  try {
    await db.execAsync(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_usuario_activo
       ON usuarios(usuario COLLATE NOCASE) WHERE deleted_at IS NULL`
    );
  } catch {
    // Si un backup antiguo trae usuarios duplicados, se corrigen desde Ajustes.
  }

  await db.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_uuid ON usuarios(uuid);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_uuid ON categorias(uuid);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_uuid ON productos(uuid);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_turnos_uuid ON turnos_caja(uuid);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_uuid ON ventas(uuid);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_local ON ventas(device_id, uuid);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_venta_items_uuid ON venta_items(uuid);

    CREATE INDEX IF NOT EXISTS idx_productos_empresa ON productos(empresa_id, activo);
    CREATE INDEX IF NOT EXISTS idx_ventas_empresa_fecha ON ventas(empresa_id, fecha_iso);
    CREATE INDEX IF NOT EXISTS idx_outbox_pendiente
      ON sync_outbox(estado, siguiente_intento, created_at);
  `);

  const plataforma =
    Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
      ? Platform.OS
      : 'android';

  await db.runAsync(
    `INSERT OR IGNORE INTO dispositivo_local
       (device_id, empresa_id, nombre, plataforma, app_version)
     VALUES (?, ?, ?, ?, ?)`,
    deviceId,
    empresaId,
    'Este dispositivo',
    plataforma,
    '1.0.0'
  );
  await db.runAsync(
    `UPDATE dispositivo_local SET empresa_id = ? WHERE device_id = ?`,
    empresaId,
    deviceId
  );

  for (const entidad of ['productos', 'categorias', 'usuarios', 'settings']) {
    await db.runAsync(
      `INSERT OR IGNORE INTO sync_meta (entidad, server_seq) VALUES (?, 0)`,
      entidad
    );
  }
}

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
    await asegurarEstructuraV7(db);
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

    await asegurarEstructuraV7(db);
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  }
}
