import type { SQLiteDatabase } from 'expo-sqlite';
import type { Settings } from '../../types';

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

export async function guardarSetting(
  db: SQLiteDatabase,
  clave: string,
  valor: string
): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
    clave,
    valor
  );
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
    await guardarSetting(db, 'dia_venta', dia);
    await guardarSetting(db, 'numero_venta_dia', '0');
  }

  const actual = s.diaVenta === dia ? s.numeroVentaDia : 0;
  const siguiente = actual + 1;
  await guardarSetting(db, 'numero_venta_dia', String(siguiente));
  return siguiente;
}
