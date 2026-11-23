import type { SQLiteDatabase } from 'expo-sqlite';
import type { ReporteRentabilidad } from '../api/cliente';
import { leerSetting } from '../api/config';
import { guardarSettingLocal } from '../db/repos/settings';

const CLAVE_CACHE = 'rentabilidad_cache_v1';

export interface CacheRentabilidad {
  desde: string;
  hasta: string;
  reporte: ReporteRentabilidad;
  guardadoEn: string;
}

export async function leerCacheRentabilidad(
  db: SQLiteDatabase
): Promise<CacheRentabilidad | null> {
  const crudo = await leerSetting(db, CLAVE_CACHE);
  if (!crudo) return null;
  try {
    const datos = JSON.parse(crudo) as CacheRentabilidad;
    if (
      !datos ||
      typeof datos.desde !== 'string' ||
      typeof datos.hasta !== 'string' ||
      !datos.reporte ||
      typeof datos.reporte.gananciaNeta !== 'number' ||
      !Array.isArray(datos.reporte.ranking)
    ) {
      return null;
    }
    return datos;
  } catch {
    return null;
  }
}

export async function guardarCacheRentabilidad(
  db: SQLiteDatabase,
  desde: string,
  hasta: string,
  reporte: ReporteRentabilidad
): Promise<void> {
  await guardarSettingLocal(
    db,
    CLAVE_CACHE,
    JSON.stringify({
      desde,
      hasta,
      reporte,
      guardadoEn: new Date().toISOString(),
    } satisfies CacheRentabilidad)
  );
}
