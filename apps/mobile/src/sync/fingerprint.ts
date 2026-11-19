import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  CLAVE_DISPOSITIVO_SERVIDOR,
  CLAVE_EMPRESA_SERVIDOR,
  CLAVE_FINGERPRINT_DISPOSITIVO,
  leerSetting,
} from '../api/config';
import { obtenerContextoLocal } from '../db/contexto';

interface NavegadorWeb {
  userAgent?: string;
  platform?: string;
  vendor?: string;
  language?: string;
  languages?: readonly string[];
  hardwareConcurrency?: number;
  deviceMemory?: number;
  maxTouchPoints?: number;
}

interface PantallaWeb {
  width?: number;
  height?: number;
  availWidth?: number;
  availHeight?: number;
  colorDepth?: number;
}

/**
 * Propiedades que no dependen de la sesión ni de la ventana. No se usa el
 * tamaño del viewport para que redimensionar el navegador no cree un
 * dispositivo nuevo.
 */
export function describirNavegador(
  navegador: NavegadorWeb,
  pantalla: PantallaWeb,
  zonaHoraria: string,
  densidad: number
): string {
  return [
    navegador.userAgent ?? '',
    navegador.platform ?? '',
    navegador.vendor ?? '',
    navegador.language ?? '',
    (navegador.languages ?? []).join(','),
    zonaHoraria,
    `${pantalla.width ?? 0}x${pantalla.height ?? 0}`,
    `${pantalla.availWidth ?? 0}x${pantalla.availHeight ?? 0}`,
    `${pantalla.colorDepth ?? 0}bit@${densidad}`,
    `${navegador.hardwareConcurrency ?? 0}cpu`,
    `${navegador.deviceMemory ?? 0}gb`,
    `${navegador.maxTouchPoints ?? 0}touch`,
  ].join('|');
}

async function calcularHuellaWeb(): Promise<string | null> {
  const global = globalThis as unknown as {
    navigator?: NavegadorWeb;
    screen?: PantallaWeb;
    devicePixelRatio?: number;
  };
  if (!global.navigator || !global.screen) return null;

  let zonaHoraria = '';
  try {
    zonaHoraria = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    zonaHoraria = '';
  }

  const descripcion = describirNavegador(
    global.navigator,
    global.screen,
    zonaHoraria,
    global.devicePixelRatio ?? 1
  );
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    descripcion,
    { encoding: Crypto.CryptoEncoding.HEX }
  );
  return `web-${hash}`;
}

/**
 * Identidad estable para el servidor.
 *
 * En nativo se mantiene el ID aleatorio de la instalación. En web, una
 * instalación ya activada conserva el ID con el que se registró; una
 * instalación nueva usa una huella derivada del navegador para poder
 * recuperar el dispositivo si se borran los datos locales.
 */
export async function obtenerFingerprintDispositivo(db: SQLiteDatabase): Promise<string> {
  const [guardada, contexto] = await Promise.all([
    leerSetting(db, CLAVE_FINGERPRINT_DISPOSITIVO),
    obtenerContextoLocal(db),
  ]);
  if (guardada) return guardada;
  if (Platform.OS !== 'web') return contexto.deviceId;

  const [empresaServidor, dispositivoServidor] = await Promise.all([
    leerSetting(db, CLAVE_EMPRESA_SERVIDOR),
    leerSetting(db, CLAVE_DISPOSITIVO_SERVIDOR),
  ]);
  if (empresaServidor && dispositivoServidor) return contexto.deviceId;

  return (await calcularHuellaWeb()) ?? contexto.deviceId;
}
