import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export interface ContextoLocal {
  empresaId: string;
  deviceId: string;
}

interface FilaSetting {
  clave: string;
  valor: string;
}

const CLAVE_EMPRESA = 'empresa_id';
const CLAVE_DISPOSITIVO = 'device_id';

export function nuevoUuid(): string {
  return Crypto.randomUUID();
}

export function ahoraIso(): string {
  return new Date().toISOString();
}

async function leerClaves(db: SQLiteDatabase): Promise<Map<string, string>> {
  const filas = await db.getAllAsync<FilaSetting>(
    `SELECT clave, valor FROM settings WHERE clave IN (?, ?)`,
    CLAVE_EMPRESA,
    CLAVE_DISPOSITIVO
  );
  return new Map(filas.map((fila) => [fila.clave, fila.valor]));
}

async function guardarClave(db: SQLiteDatabase, clave: string, valor: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
    clave,
    valor
  );
}

/**
 * Devuelve la identidad local. Si una instalación antigua aún no tiene
 * `empresa_id` o `device_id`, se generan una sola vez y se guardan en settings.
 */
export async function obtenerContextoLocal(db: SQLiteDatabase): Promise<ContextoLocal> {
  const valores = await leerClaves(db);

  let empresaId = valores.get(CLAVE_EMPRESA) ?? '';
  let deviceId = valores.get(CLAVE_DISPOSITIVO) ?? '';

  if (!empresaId) {
    empresaId = nuevoUuid();
    await guardarClave(db, CLAVE_EMPRESA, empresaId);
  }
  if (!deviceId) {
    deviceId = nuevoUuid();
    await guardarClave(db, CLAVE_DISPOSITIVO, deviceId);
  }

  return { empresaId, deviceId };
}

export async function guardarContextoLocal(
  db: SQLiteDatabase,
  contexto: ContextoLocal
): Promise<void> {
  await guardarClave(db, CLAVE_EMPRESA, contexto.empresaId);
  await guardarClave(db, CLAVE_DISPOSITIVO, contexto.deviceId);
}

export async function obtenerEmpresaId(db: SQLiteDatabase): Promise<string> {
  return (await obtenerContextoLocal(db)).empresaId;
}

export async function obtenerDeviceId(db: SQLiteDatabase): Promise<string> {
  return (await obtenerContextoLocal(db)).deviceId;
}
