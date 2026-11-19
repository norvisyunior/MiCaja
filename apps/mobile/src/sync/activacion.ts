import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  activarDispositivo,
  desvincularDispositivo,
  ErrorApi,
  type RespuestaActivacion,
} from '../api/cliente';
import {
  CLAVE_CODIGO_PENDIENTE,
  CLAVE_DISPOSITIVO_SERVIDOR,
  CLAVE_EMPRESA_SERVIDOR,
  CLAVE_LICENCIA_TOKEN,
  CLAVE_LICENCIA_VERIFICADA,
  CLAVE_NOMBRE_DISPOSITIVO,
  CLAVE_ROL_ACTIVACION,
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
  const plataforma = plataformaActual();
  return `MiCaja ${plataforma === 'ios' ? 'iPhone' : plataforma === 'web' ? 'Web' : 'Android'}`;
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

export interface DatosLocales {
  usuarios: number;
  ventas: number;
}

export async function contarDatosLocales(db: SQLiteDatabase): Promise<DatosLocales> {
  const usuarios = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM usuarios`
  );
  const ventas = await db.getFirstAsync<{ total: number }>(`SELECT COUNT(*) AS total FROM ventas`);
  return { usuarios: usuarios?.total ?? 0, ventas: ventas?.total ?? 0 };
}

/**
 * Un dispositivo que se une como trabajador debe ver el catálogo del negocio,
 * no la demostración local. Solo se llama cuando no hay cuentas ni ventas,
 * así que no puede borrar el negocio local de nadie.
 */
export async function limpiarDatosLocales(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM venta_items`);
    await db.runAsync(`DELETE FROM ventas`);
    await db.runAsync(`DELETE FROM movimientos_inventario`);
    await db.runAsync(`DELETE FROM turnos_caja`);
    await db.runAsync(`DELETE FROM productos`);
    await db.runAsync(`DELETE FROM categorias`);
    await db.runAsync(`DELETE FROM sync_outbox`);
    await db.runAsync(`DELETE FROM sync_meta`);
    await db.runAsync(
      `DELETE FROM settings WHERE clave IN (
         'nombre_negocio', 'moneda', 'simbolo_moneda',
         'sync_snapshot_hecho', 'ultimo_sync_en', 'codigo_activacion_pendiente'
       )`
    );
  });
}

/**
 * Borra todo el contenido del negocio en este teléfono. Se usa únicamente
 * cuando el usuario confirma entrar a otro negocio en el mismo dispositivo:
 * de lo contrario las cuentas, ventas y el inventario de dos negocios se
 * mezclarían. Conserva las preferencias de la app y la marca de datos
 * iniciales para no volver a sembrar la demostración.
 */
export async function restablecerDispositivo(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM venta_items`);
    await db.runAsync(`DELETE FROM ventas`);
    await db.runAsync(`DELETE FROM movimientos_inventario`);
    await db.runAsync(`DELETE FROM turnos_caja`);
    await db.runAsync(`DELETE FROM productos`);
    await db.runAsync(`DELETE FROM categorias`);
    await db.runAsync(`DELETE FROM usuarios`);
    await db.runAsync(`DELETE FROM sync_outbox`);
    await db.runAsync(`DELETE FROM sync_meta`);
    await db.runAsync(`DELETE FROM dispositivo_local`);
    await db.runAsync(`DELETE FROM licencia_local`);
    await db.runAsync(
      `DELETE FROM settings WHERE clave NOT IN (
         'empresa_id', 'device_id', 'tema', 'sync_server_url',
         'nombre_dispositivo', 'datos_iniciales', 'licencia_clave_publica'
       )`
    );
  });
}

/**
 * La invitación se consumió en el servidor, pero este dispositivo ya tenía un
 * negocio local: se deshace la vinculación para no mezclar dos negocios y se
 * dejan intactos los datos locales.
 */
async function deshacerActivacionInvitacion(
  db: SQLiteDatabase,
  token: string
): Promise<void> {
  try {
    await guardarSetting(db, CLAVE_TOKEN_DISPOSITIVO, token);
    await desvincularDispositivo(db, {});
  } catch {
    // Sin red no se puede liberar la plaza; se pide al administrador retirarla.
  } finally {
    await olvidarActivacionLocal(db);
    await guardarSetting(db, CLAVE_CODIGO_PENDIENTE, '');
  }
}

export async function activarConCodigo(
  db: SQLiteDatabase,
  codigo: string,
  nombre?: string,
  opciones: { reemplazarA?: string } = {}
): Promise<RespuestaActivacion> {
  const contexto = await obtenerContextoLocal(db);
  const nombreFinal = nombre?.trim() || (await nombreDispositivoPorDefecto(db));

  const respuesta = await activarDispositivo(db, {
    codigo: codigo.trim().toUpperCase(),
    fingerprint: contexto.deviceId,
    nombre: nombreFinal.slice(0, 80),
    plataforma: plataformaActual(),
    appVersion: APP_VERSION,
    ...(opciones.reemplazarA ? { reemplazarA: opciones.reemplazarA } : {}),
  });

  const esInvitacion = respuesta.via === 'invitacion';
  const rol: 'propietario' | 'admin' | 'dependiente' = esInvitacion
    ? respuesta.rol === 'admin'
      ? 'admin'
      : 'dependiente'
    : 'propietario';

  if (esInvitacion) {
    const datos = await contarDatosLocales(db);
    if (datos.usuarios > 0 || datos.ventas > 0) {
      await deshacerActivacionInvitacion(db, respuesta.token);
      throw new ErrorApi(
        'DISPOSITIVO_CON_DATOS',
        'Este dispositivo ya tiene cuentas o ventas de un negocio local. Las invitaciones son para instalaciones nuevas: borra los datos de la app o usa otro teléfono, y pide una invitación nueva.',
        409
      );
    }
    await limpiarDatosLocales(db);
  }

  await guardarActivacion(db, respuesta);
  await guardarSetting(db, CLAVE_ROL_ACTIVACION, rol);
  return respuesta;
}

/**
 * El dispositivo se desvinculó del negocio: se olvida la activación local
 * (token y licencia) para que la app vuelva a pedir un código. Los datos
 * del negocio NO se borran; quedan para consulta o para reactivar.
 */
export async function olvidarActivacionLocal(db: SQLiteDatabase): Promise<void> {
  await guardarSetting(db, CLAVE_TOKEN_DISPOSITIVO, '');
  await guardarSetting(db, CLAVE_LICENCIA_TOKEN, '');
  await guardarSetting(db, CLAVE_LICENCIA_VERIFICADA, '');
}
