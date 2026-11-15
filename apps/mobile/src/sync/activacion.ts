import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  activarDispositivo,
  type RespuestaActivacion,
} from '../api/cliente';
import {
  CLAVE_DISPOSITIVO_SERVIDOR,
  CLAVE_EMPRESA_SERVIDOR,
  CLAVE_LICENCIA_TOKEN,
  CLAVE_LICENCIA_VERIFICADA,
  CLAVE_NOMBRE_DISPOSITIVO,
  CLAVE_TOKEN_DISPOSITIVO,
  leerSetting,
} from '../api/config';
import { ahoraIso, obtenerContextoLocal } from '../db/contexto';
import { guardarSetting } from '../db/repos/settings';
import { evaluarTokenLicencia, guardarLicenciaLocal } from '../licencias/verificar';

export const APP_VERSION = '1.0.0';

export function plataformaActual(): 'android' | 'ios' | 'web' {
  if (Platform.OS === 'ios' || Platform.OS === 'web') return Platform.OS;
  return 'android';
}

export async function nombreDispositivoPorDefecto(db: SQLiteDatabase): Promise<string> {
  const guardado = await leerSetting(db, CLAVE_NOMBRE_DISPOSITIVO);
  if (guardado) return guardado;
  return `MiCaja ${plataformaActual() === 'ios' ? 'iPhone' : 'Android'}`;
}

export async function guardarActivacion(
  db: SQLiteDatabase,
  respuesta: RespuestaActivacion
): Promise<void> {
  const ahora = ahoraIso();
  const contexto = await obtenerContextoLocal(db);
  const resultado = evaluarTokenLicencia(respuesta.licencia, {
    empresaId: respuesta.empresa.id,
    deviceId: respuesta.dispositivo.id,
  });
  if (resultado.estado === 'invalida') {
    throw new Error('La licencia recibida del servidor no es válida para este dispositivo.');
  }

  await guardarSetting(db, CLAVE_TOKEN_DISPOSITIVO, respuesta.token);
  await guardarSetting(db, CLAVE_LICENCIA_TOKEN, respuesta.licencia);
  await guardarSetting(db, CLAVE_EMPRESA_SERVIDOR, respuesta.empresa.id);
  await guardarSetting(db, CLAVE_DISPOSITIVO_SERVIDOR, respuesta.dispositivo.id);
  await guardarSetting(db, CLAVE_NOMBRE_DISPOSITIVO, respuesta.dispositivo.nombre);
  await guardarSetting(db, CLAVE_LICENCIA_VERIFICADA, ahora);

  await db.runAsync(
    `INSERT INTO dispositivo_local
       (device_id, empresa_id, nombre, plataforma, app_version, activado_en, last_sync_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(device_id) DO UPDATE SET
       nombre = excluded.nombre,
       plataforma = excluded.plataforma,
       app_version = excluded.app_version,
       activado_en = excluded.activado_en`,
    contexto.deviceId,
    contexto.empresaId,
    respuesta.dispositivo.nombre,
    respuesta.dispositivo.plataforma,
    APP_VERSION,
    ahora
  );

  await guardarLicenciaLocal(db, resultado);
}

export async function activarConCodigo(
  db: SQLiteDatabase,
  codigo: string,
  nombre?: string
): Promise<RespuestaActivacion> {
  const contexto = await obtenerContextoLocal(db);
  const nombreFinal = nombre?.trim() || (await nombreDispositivoPorDefecto(db));

  const respuesta = await activarDispositivo(db, {
    codigo: codigo.trim().toUpperCase(),
    fingerprint: contexto.deviceId,
    nombre: nombreFinal.slice(0, 80),
    plataforma: plataformaActual(),
    appVersion: APP_VERSION,
  });

  await guardarActivacion(db, respuesta);
  return respuesta;
}
