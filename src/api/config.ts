import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

export const CLAVE_URL_SERVIDOR = 'sync_server_url';
export const CLAVE_TOKEN_DISPOSITIVO = 'device_token';
export const CLAVE_EMPRESA_SERVIDOR = 'empresa_servidor_id';
export const CLAVE_DISPOSITIVO_SERVIDOR = 'device_servidor_id';
export const CLAVE_LICENCIA_TOKEN = 'licencia_token';
export const CLAVE_LICENCIA_VERIFICADA = 'licencia_verificada_en';
export const CLAVE_NOMBRE_DISPOSITIVO = 'nombre_dispositivo';
export const CLAVE_ULTIMO_SYNC = 'ultimo_sync_en';
export const CLAVE_CLAVE_PUBLICA_LICENCIA = 'licencia_clave_publica';

export function urlServidorPorDefecto(): string {
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

export async function leerSetting(
  db: SQLiteDatabase,
  clave: string
): Promise<string | null> {
  const fila = await db.getFirstAsync<{ valor: string }>(
    `SELECT valor FROM settings WHERE clave = ?`,
    clave
  );
  return fila?.valor ?? null;
}

export async function leerUrlServidor(db: SQLiteDatabase): Promise<string> {
  const guardada = await leerSetting(db, CLAVE_URL_SERVIDOR);
  return normalizarUrlServidor(guardada || urlServidorPorDefecto());
}

export function normalizarUrlServidor(valor: string): string {
  const limpia = valor.trim().replace(/\/+$/, '');
  if (!limpia) return urlServidorPorDefecto();
  return /^https?:\/\//i.test(limpia) ? limpia : `http://${limpia}`;
}

export async function leerTokenDispositivo(db: SQLiteDatabase): Promise<string | null> {
  return leerSetting(db, CLAVE_TOKEN_DISPOSITIVO);
}

export async function leerIdsServidor(
  db: SQLiteDatabase
): Promise<{ empresaId: string | null; deviceId: string | null }> {
  const [empresaId, deviceId] = await Promise.all([
    leerSetting(db, CLAVE_EMPRESA_SERVIDOR),
    leerSetting(db, CLAVE_DISPOSITIVO_SERVIDOR),
  ]);
  return { empresaId, deviceId };
}
