import type { SQLiteDatabase } from 'expo-sqlite';
import type { Settings } from '../../types';
import { ahoraIso } from '../contexto';
import { SETTINGS_SINCRONIZABLES, encolarSettingUpsert } from '../sync/encolar';

interface FilaSetting {
  clave: string;
  valor: string;
}

const DEFAULTS: Record<string, string> = {
  nombre_negocio: 'Mi Negocio',
  simbolo_moneda: '$',
  moneda: 'CUP',
  dia_venta: '',
  numero_venta_dia: '0',
  tema: 'claro',
};

export async function obtenerSettings(db: SQLiteDatabase): Promise<Settings> {
  const filas = await db.getAllAsync<FilaSetting>(`SELECT * FROM settings`);

  const mapa = new Map(filas.map((f) => [f.clave, f.valor]));
  const merge = (clave: string) => mapa.get(clave) ?? DEFAULTS[clave] ?? '';

  return {
    nombreNegocio: merge('nombre_negocio'),
    moneda: merge('moneda'),
    simboloMoneda: merge('simbolo_moneda'),
    diaVenta: merge('dia_venta'),
    numeroVentaDia: Number(merge('numero_venta_dia')) || 0,
    tema: merge('tema') === 'oscuro' ? 'oscuro' : 'claro',
  };
}

async function escribirSetting(
  db: SQLiteDatabase,
  clave: string,
  valor: string,
  sincronizar: boolean
): Promise<void> {
  const actual = await db.getFirstAsync<{ version: number }>(
    `SELECT version FROM settings WHERE clave = ?`,
    clave
  );
  const version = (actual?.version ?? 0) + 1;

  await db.runAsync(
    `INSERT INTO settings (clave, valor, version, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(clave) DO UPDATE SET
       valor = excluded.valor,
       version = excluded.version,
       updated_at = excluded.updated_at`,
    clave,
    valor,
    version,
    ahoraIso()
  );

  if (sincronizar && SETTINGS_SINCRONIZABLES.has(clave)) {
    await encolarSettingUpsert(db, clave, valor, version);
  }
}

export async function guardarSetting(
  db: SQLiteDatabase,
  clave: string,
  valor: string
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await escribirSetting(db, clave, valor, true);
  });
}

/**
 * Escribe un ajuste solo en la SQLite. No entra en la cola de envío: se usa
 * para valores provisionales o derivados del dispositivo que nunca deben
 * pisar la configuración del negocio en el servidor.
 */
export async function guardarSettingLocal(
  db: SQLiteDatabase,
  clave: string,
  valor: string
): Promise<void> {
  await escribirSetting(db, clave, valor, false);
}

export async function diaVenta(db: SQLiteDatabase): Promise<string> {
  const s = await obtenerSettings(db);
  return s.diaVenta;
}

export async function siguienteNumeroVenta(
  db: SQLiteDatabase,
  dia: string
): Promise<number> {
  const s = await obtenerSettings(db);

  if (s.diaVenta !== dia) {
    await guardarSettingLocal(db, 'dia_venta', dia);
    await guardarSettingLocal(db, 'numero_venta_dia', '0');
  }

  const actual = s.diaVenta === dia ? s.numeroVentaDia : 0;
  const siguiente = actual + 1;
  await guardarSettingLocal(db, 'numero_venta_dia', String(siguiente));
  return siguiente;
}
