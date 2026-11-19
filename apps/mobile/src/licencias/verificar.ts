import nacl from 'tweetnacl';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  CLAVE_CLAVE_PUBLICA_LICENCIA,
  CLAVE_EMPRESA_SERVIDOR,
  CLAVE_DISPOSITIVO_SERVIDOR,
  CLAVE_LICENCIA_TOKEN,
  CLAVE_LICENCIA_VERIFICADA,
  leerSetting,
} from '../api/config';
import { ahoraIso } from '../db/contexto';
import { guardarSetting } from '../db/repos/settings';
import {
  clavePublicaDesdeSpki,
  decodificarTokenLicencia,
  type PayloadLicencia,
} from './token';

/**
 * Clave pública Ed25519 con la que la app verifica las licencias.
 *
 * ⚠️  ANTES DE COMPILAR EL APK DE PRODUCCIÓN:
 *     `CLAVE_PUBLICA_LICENCIA` debe ser `CLAVE_PUBLICA_LICENCIA_PRODUCCION`.
 *     Con la clave de desarrollo el teléfono rechaza las licencias firmadas
 *     por el backend real (motivo `firma`) y la app no permite vender.
 *     Comprobación automática: `npm run check:clave` (el CI de EAS la ejecuta
 *     antes de compilar).
 */
export const CLAVE_PUBLICA_LICENCIA_PRODUCCION =
  'MCowBQYDK2VwAyEAuf/OJOGIKRmHYZlk919aoJquA401hR9mjJKqOm2hTUM=';

/** Clave del backend local de desarrollo. NUNCA debe viajar en el APK vendido. */
export const CLAVE_PUBLICA_LICENCIA_DESARROLLO =
  'MCowBQYDK2VwAyEA19hURrg0/OyBN6MCcyCFpVlfEljem+IugbtwfI/g0Ps=';

/** Clave activa. Para el APK de producción: cambiar a la de producción. */
export const CLAVE_PUBLICA_LICENCIA = CLAVE_PUBLICA_LICENCIA_DESARROLLO;

export type EstadoLicencia = 'activa' | 'gracia' | 'vencida' | 'invalida' | 'sin_licencia';

export interface ResultadoLicencia {
  estado: EstadoLicencia;
  valida: boolean;
  enGracia: boolean;
  motivo?: 'firma' | 'empresa' | 'dispositivo' | 'vencida' | 'estado';
  payload?: PayloadLicencia;
  token?: string;
}

export function evaluarTokenLicencia(
  token: string,
  opciones: {
    empresaId?: string | null;
    deviceId?: string | null;
    ahoraSegundos?: number;
    clavePublica?: string;
  } = {}
): ResultadoLicencia {
  try {
    const decodificado = decodificarTokenLicencia(token);
    const clave = clavePublicaDesdeSpki(opciones.clavePublica ?? CLAVE_PUBLICA_LICENCIA);
    const firmaValida = nacl.sign.detached.verify(
      decodificado.payloadBytes,
      decodificado.firma,
      clave
    );
    if (!firmaValida) {
      return { estado: 'invalida', valida: false, enGracia: false, motivo: 'firma', token };
    }

    const payload = decodificado.payload;
    if (opciones.empresaId && payload.empresaId !== opciones.empresaId) {
      return { estado: 'invalida', valida: false, enGracia: false, motivo: 'empresa', payload, token };
    }
    if (opciones.deviceId && payload.deviceId && payload.deviceId !== opciones.deviceId) {
      return {
        estado: 'invalida',
        valida: false,
        enGracia: false,
        motivo: 'dispositivo',
        payload,
        token,
      };
    }

    const ahora = opciones.ahoraSegundos ?? Math.floor(Date.now() / 1000);
    if (ahora < payload.exp) {
      return { estado: 'activa', valida: true, enGracia: false, payload, token };
    }
    if (payload.graceUntil !== null && ahora < payload.graceUntil) {
      return { estado: 'gracia', valida: true, enGracia: true, payload, token };
    }
    return { estado: 'vencida', valida: false, enGracia: false, motivo: 'vencida', payload, token };
  } catch {
    return { estado: 'invalida', valida: false, enGracia: false, motivo: 'firma', token };
  }
}

export async function verificarLicenciaLocal(
  db: SQLiteDatabase
): Promise<ResultadoLicencia> {
  const token = await leerSetting(db, CLAVE_LICENCIA_TOKEN);
  if (!token) return { estado: 'sin_licencia', valida: true, enGracia: false };

  const [empresaId, deviceId, clavePublica] = await Promise.all([
    leerSetting(db, CLAVE_EMPRESA_SERVIDOR),
    leerSetting(db, CLAVE_DISPOSITIVO_SERVIDOR),
    leerSetting(db, CLAVE_CLAVE_PUBLICA_LICENCIA),
  ]);

  // En desarrollo local se puede sobrecargar la clave pública con un setting
  // (`licencia_clave_publica`) para verificar licencias de un backend propio
  // sin recompilar la app. En producción el setting no existe y se usa la
  // clave incorporada.
  const resultado = evaluarTokenLicencia(token, {
    empresaId,
    deviceId,
    clavePublica: clavePublica ?? undefined,
  });

  // La sincronización puede marcar la licencia como inválida por orden del
  // servidor (suspensión, vencimiento, dispositivo bloqueado). Esa marca
  // pesa más que la firma del token hasta que llegue una nueva licencia.
  if (resultado.estado === 'activa' && resultado.payload) {
    const guardada = await db.getFirstAsync<{ estado: string }>(
      `SELECT estado FROM licencia_local WHERE license_id = ?`,
      resultado.payload.licenseId
    );
    if (guardada?.estado === 'invalida') {
      const marcada: ResultadoLicencia = {
        estado: 'invalida',
        valida: false,
        enGracia: false,
        motivo: 'estado',
        payload: resultado.payload,
        token,
      };
      await guardarLicenciaLocal(db, marcada);
      return marcada;
    }
  }

  if (resultado.payload) {
    await guardarLicenciaLocal(db, resultado);
  }
  return resultado;
}

export async function guardarLicenciaLocal(
  db: SQLiteDatabase,
  resultado: ResultadoLicencia
): Promise<void> {
  if (!resultado.payload || !resultado.token) return;
  const payload = resultado.payload;
  const ahora = ahoraIso();

  await db.runAsync(
    `INSERT INTO licencia_local
       (license_id, empresa_id, device_id, plan, features, activada_en, vence_en,
        grace_until, key_id, token, ultima_verificacion, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(license_id) DO UPDATE SET
       empresa_id = excluded.empresa_id,
       device_id = excluded.device_id,
       plan = excluded.plan,
       features = excluded.features,
       vence_en = excluded.vence_en,
       grace_until = excluded.grace_until,
       key_id = excluded.key_id,
       token = excluded.token,
       ultima_verificacion = excluded.ultima_verificacion,
       estado = excluded.estado`,
    payload.licenseId,
    payload.empresaId,
    payload.deviceId,
    payload.plan,
    JSON.stringify(payload.features),
    new Date(payload.iat * 1000).toISOString(),
    new Date(payload.exp * 1000).toISOString(),
    payload.graceUntil ? new Date(payload.graceUntil * 1000).toISOString() : null,
    payload.keyId,
    resultado.token,
    ahora,
    resultado.estado
  );

  await guardarSetting(db, CLAVE_LICENCIA_VERIFICADA, ahora);
}

export function licenciaPermite(
  resultado: ResultadoLicencia,
  feature: string
): boolean {
  if (resultado.estado === 'sin_licencia') return true;
  if (!resultado.valida || !resultado.payload) return false;
  return resultado.payload.features.includes(feature);
}

export interface BloqueoOperativo {
  titulo: string;
  mensaje: string;
}

/**
 * Regla pura: qué operaciones comerciales bloquea cada estado de licencia.
 * La caja no puede operar sin licencia activada: hasta que el dispositivo
 * no verifique su licencia no se permiten ventas ni turnos (los datos y las
 * consultas permanecen accesibles).
 */
export function bloqueoPorEstado(estado: EstadoLicencia): BloqueoOperativo | null {
  if (estado === 'sin_licencia') {
    return {
      titulo: 'Dispositivo sin activar',
      mensaje:
        'Este dispositivo aún no activó su licencia. Se conservan todos los datos y puedes consultar el historial, pero no se pueden registrar ventas ni abrir o cerrar turnos hasta activar la licencia.',
    };
  }
  if (estado === 'vencida') {
    return {
      titulo: 'Licencia vencida',
      mensaje:
        'La licencia de MiCaja expiró. Se conservan todos los datos y puedes consultar el historial, pero no se pueden registrar ventas ni abrir o cerrar turnos. Renueva la licencia y sincroniza para continuar.',
    };
  }
  if (estado === 'invalida') {
    return {
      titulo: 'Licencia no válida',
      mensaje:
        'La licencia instalada no es válida para este dispositivo. Verifica la activación en Ajustes › Sincronización. No se pueden registrar ventas ni abrir o cerrar turnos.',
    };
  }
  return null;
}

/**
 * Evalúa la licencia guardada en el momento de operar. Devuelve el bloqueo
 * a mostrar al usuario, o `null` si puede operar. Un error interno del
 * control jamás debe dejar la caja inservible, así que falla abierto.
 */
export async function evaluarBloqueoOperativo(
  db: SQLiteDatabase
): Promise<BloqueoOperativo | null> {
  try {
    const resultado = await verificarLicenciaLocal(db);
    return bloqueoPorEstado(resultado.estado);
  } catch {
    // Un error del control no debe dejar sin caja a un negocio al día (falla
    // abierta), pero una instalación sin activar NUNCA puede vender por un
    // error interno: sin token guardado se mantiene el bloqueo.
    try {
      const token = await leerSetting(db, CLAVE_LICENCIA_TOKEN);
      return token ? null : bloqueoPorEstado('sin_licencia');
    } catch {
      return bloqueoPorEstado('sin_licencia');
    }
  }
}
