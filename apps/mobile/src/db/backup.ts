import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import type { SQLiteDatabase } from 'expo-sqlite';
import { asegurarEstructuraV7, asegurarUsernames } from './migraciones';

const TABLAS_CORE = [
  'usuarios',
  'categorias',
  'productos',
  'turnos_caja',
  'ventas',
  'venta_items',
  'settings',
];

const TABLAS_V2 = [
  ...TABLAS_CORE,
  'sync_outbox',
  'sync_meta',
  'dispositivo_local',
  'licencia_local',
  'movimientos_inventario',
];

async function leerContenidoArchivo(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const respuesta = await fetch(uri);
    return await respuesta.text();
  }
  const archivo = new File(uri);
  return archivo.textSync();
}

function nombreBackup(): string {
  const ahora = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fecha = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;
  const hora = `${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}`;
  return `micaja-${fecha}-${hora}.json`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface BackupExportado {
  version: number;
  fecha: string;
  esquema: string[];
  datos: { [tabla: string]: { [col: string]: any }[] };
}

async function dumpTabla(db: SQLiteDatabase, tabla: string): Promise<{ [col: string]: any }[]> {
  try {
    const filas = await db.getAllAsync(`SELECT * FROM "${tabla}"`);
    return filas.map((fila) => {
      const limpia: { [col: string]: any } = {};
      for (const [k, v] of Object.entries(fila as Record<string, unknown>)) {
        limpia[k] = v === null ? null : v;
      }
      return limpia;
    });
  } catch {
    return [];
  }
}

async function generarBackupJson(db: SQLiteDatabase): Promise<Uint8Array> {
  const datos: { [tabla: string]: { [col: string]: any }[] } = {};

  for (const tabla of TABLAS_V2) {
    datos[tabla] = await dumpTabla(db, tabla);
  }

  const esquemaRaw = await db.getAllAsync<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL"
  );
  const esquema = esquemaRaw.map((r) => r.sql).filter(Boolean);

  const exportar: BackupExportado = {
    version: 2,
    fecha: new Date().toISOString(),
    esquema,
    datos,
  };

  const json = JSON.stringify(exportar);
  return new TextEncoder().encode(json);
}

function compartirWeb(nombre: string, bytes: Uint8Array): boolean {
  try {
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  } catch {
    return false;
  }
}

async function compartirNativo(nombre: string, bytes: Uint8Array): Promise<boolean> {
  const archivo = new File(Paths.cache, nombre);
  archivo.create({ overwrite: true, intermediates: true });
  archivo.write(bytes);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(archivo.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Guardar backup de base de datos',
      UTI: 'public.json',
    });
    return true;
  }
  return false;
}

export async function exportarBackup(db: SQLiteDatabase): Promise<boolean> {
  const nombre = nombreBackup();
  const bytes = await generarBackupJson(db);

  if (Platform.OS === 'web') {
    return compartirWeb(nombre, bytes);
  }
  return compartirNativo(nombre, bytes);
}

export async function seleccionarArchivoRestore(): Promise<{ uri: string; nombre: string } | null> {
  try {
    const resultado = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
    });

    if (resultado.canceled || !resultado.assets?.length) {
      return null;
    }

    const archivo = resultado.assets[0];
    return { uri: archivo.uri, nombre: archivo.name };
  } catch {
    return null;
  }
}

function validarBackupJson(datos: unknown): { valido: boolean; error?: string } {
  if (!datos || typeof datos !== 'object') {
    return { valido: false, error: 'El archivo no tiene el formato de backup correcto.' };
  }

  const obj = datos as Record<string, unknown>;

  if (obj.version !== 1 && obj.version !== 2) {
    return { valido: false, error: 'La versión del backup no es compatible.' };
  }

  if (!Array.isArray(obj.esquema) || !obj.esquema.every((s) => typeof s === 'string')) {
    return { valido: false, error: 'El esquema del backup está corrupto.' };
  }

  if (!obj.datos || typeof obj.datos !== 'object' || Array.isArray(obj.datos)) {
    return { valido: false, error: 'Los datos del backup están corruptos.' };
  }

  const tablas = obj.version === 1 ? TABLAS_CORE : TABLAS_V2;
  const datosTablas = obj.datos as Record<string, unknown>;
  for (const tabla of tablas) {
    const filas = datosTablas[tabla];
    if (!Array.isArray(filas)) {
      return { valido: false, error: `Falta la tabla "${tabla}" en el backup.` };
    }
    if (filas.some((fila) => !fila || typeof fila !== 'object' || Array.isArray(fila))) {
      return { valido: false, error: `La tabla "${tabla}" contiene datos inválidos.` };
    }
  }

  return { valido: true };
}

export async function validarArchivoRestore(
  uri: string,
  _nombre: string
): Promise<{ valido: boolean; error?: string }> {
  try {
    const texto = await leerContenidoArchivo(uri);
    const parsed: unknown = JSON.parse(texto);
    return validarBackupJson(parsed);
  } catch {
    return { valido: false, error: 'No se pudo leer el archivo. Asegúrese de que es un backup válido.' };
  }
}

async function leerSettingsPrevios(
  db: SQLiteDatabase,
  claves: string[]
): Promise<Record<string, string>> {
  const filas = await db.getAllAsync<{ clave: string; valor: string }>(
    `SELECT clave, valor FROM settings WHERE clave IN (${claves.map(() => '?').join(', ')})`,
    ...claves
  );
  return Object.fromEntries(filas.map((fila) => [fila.clave, fila.valor]));
}

export async function restaurarBackup(
  db: SQLiteDatabase,
  uri: string,
  _nombre: string
): Promise<{ exito: boolean; error?: string }> {
  try {
    const contenido = await leerContenidoArchivo(uri);
    const parsed = JSON.parse(contenido) as BackupExportado;
    const validacion = validarBackupJson(parsed);
    if (!validacion.valido) {
      return { exito: false, error: validacion.error };
    }

    const esV1 = parsed.version === 1;
    const tablas = esV1 ? TABLAS_CORE : TABLAS_V2;
    const clavesIdentidad = [
      'empresa_id',
      'device_id',
      'empresa_servidor_id',
      'device_servidor_id',
      'device_token',
      'sync_server_url',
      'licencia_token',
      'licencia_ultima_verificacion',
      'licencia_verificada_en',
    ];
    const identidadPrevia = esV1 ? await leerSettingsPrevios(db, clavesIdentidad) : {};

    await db.execAsync('PRAGMA foreign_keys = OFF');
    await db.execAsync('BEGIN TRANSACTION');

    try {
      // El índice único de usuario puede impedir restaurar backups antiguos
      // (que no traen la columna `usuario`). Se recrea después de rellenarla.
      await db.execAsync(`
        DROP INDEX IF EXISTS idx_usuarios_usuario;
        DROP INDEX IF EXISTS idx_usuarios_usuario_activo;
      `);

      const tablasBorrar = esV1
        ? [...TABLAS_CORE, 'sync_outbox', 'sync_meta', 'movimientos_inventario']
        : TABLAS_V2;
      for (const tabla of tablasBorrar) {
        await db.execAsync(`DELETE FROM "${tabla}"`);
      }

      for (const tabla of tablas) {
        const filas = parsed.datos[tabla];
        if (!Array.isArray(filas) || filas.length === 0) continue;

        for (const fila of filas) {
          const columnas = Object.keys(fila);
          if (columnas.length === 0) continue;

          const placeholders = columnas.map(() => '?').join(', ');
          const valores: unknown[] = columnas.map((col) => {
            const v = fila[col];
            return v === undefined ? null : v;
          });

          await db.runAsync(
            `INSERT INTO "${tabla}" (${columnas.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
            valores as never
          );
        }
      }

      if (esV1) {
        const ahora = new Date().toISOString();
        for (const [clave, valor] of Object.entries(identidadPrevia)) {
          if (!valor) continue;
          await db.runAsync(
            `INSERT INTO settings (clave, valor, version, updated_at)
             VALUES (?, ?, 1, ?)
             ON CONFLICT(clave) DO UPDATE SET
               valor = excluded.valor,
               updated_at = excluded.updated_at`,
            clave,
            valor,
            ahora
          );
        }
      }

      await asegurarUsernames(db);
      await asegurarEstructuraV7(db);

      await db.execAsync('COMMIT');
    } catch (e) {
      await db.execAsync('ROLLBACK');
      throw e;
    } finally {
      await db.execAsync('PRAGMA foreign_keys = ON');
    }

    return { exito: true };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : 'Error desconocido';
    return { exito: false, error: `Error al restaurar: ${mensaje}` };
  }
}
