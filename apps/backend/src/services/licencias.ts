import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  encodeLicensePayload,
  LICENSE_VERSION,
  type LicensePayload,
} from '@micaja/shared';
import { env } from '../config';
import { ApiError } from '../middleware/errors';

const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generarCodigoActivacion(): string {
  const bytes = crypto.randomBytes(12);
  let cuerpo = '';
  for (let i = 0; i < 12; i += 1) {
    cuerpo += ALFABETO_CODIGO[bytes[i] % ALFABETO_CODIGO.length];
  }
  return `MICAJA-${cuerpo.slice(0, 4)}-${cuerpo.slice(4, 8)}-${cuerpo.slice(8, 12)}`;
}

export function hashCodigoActivacion(codigo: string): string {
  return crypto.createHash('sha256').update(codigo.trim().toUpperCase()).digest('hex');
}

export function firmarLicenciaConClave(payload: LicensePayload, clavePrivadaBase64: string): string {
  const clave = crypto.createPrivateKey({
    key: Buffer.from(clavePrivadaBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const payloadCodificado = encodeLicensePayload(payload);
  const firma = crypto.sign(null, Buffer.from(payloadCodificado), clave);
  return `${payloadCodificado}.${bytesToBase64Url(new Uint8Array(firma))}`;
}

export function verificarLicenciaConClave(token: string, clavePublicaBase64: string): boolean {
  const [payloadCodificado, firmaCodificada] = token.split('.');
  if (!payloadCodificado || !firmaCodificada) return false;

  try {
    const clave = crypto.createPublicKey({
      key: Buffer.from(clavePublicaBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(
      null,
      Buffer.from(payloadCodificado),
      clave,
      Buffer.from(base64UrlToBytes(firmaCodificada))
    );
  } catch {
    return false;
  }
}

export async function exigirLicenciaVigente(
  client: PoolClient,
  empresaId: string
): Promise<void> {
  const licencia = await client.query<{
    estado: string;
    vence_en: Date;
    grace_dias: number;
  }>(
    `select l.estado, l.vence_en, l.grace_dias
     from licencias l
     join empresas e on e.id = l.empresa_id
     where l.empresa_id = $1 and e.estado not in ('suspendida', 'cancelada')`,
    [empresaId]
  );
  if (!licencia.rowCount) {
    throw new ApiError(404, 'LICENCIA_NO_ENCONTRADA');
  }
  const estado = estadoLicenciaEfectiva(licencia.rows[0]);
  if (estado === 'pendiente') {
    throw new ApiError(
      403,
      'LICENCIA_PENDIENTE',
      'La licencia de este negocio todavía no está activada.'
    );
  }
  if (estado === 'suspendida') {
    throw new ApiError(403, 'LICENCIA_SUSPENDIDA');
  }
  if (estado === 'vencida') {
    throw new ApiError(403, 'LICENCIA_VENCIDA');
  }
}

export function firmarLicencia(payload: LicensePayload): string {
  if (!env.LICENSE_PRIVATE_KEY) {
    throw new ApiError(
      503,
      'LICENCIA_NO_CONFIGURADA',
      'Falta LICENSE_PRIVATE_KEY en el backend'
    );
  }
  return firmarLicenciaConClave(payload, env.LICENSE_PRIVATE_KEY);
}

export function construirPayloadLicencia(input: {
  licenseId: string;
  empresaId: string;
  deviceId?: string | null;
  plan: string;
  features: string[];
  venceEn: Date;
  graceDias: number;
}): LicensePayload {
  const exp = Math.floor(input.venceEn.getTime() / 1000);
  return {
    v: LICENSE_VERSION,
    licenseId: input.licenseId,
    empresaId: input.empresaId,
    deviceId: input.deviceId ?? null,
    plan: input.plan,
    features: input.features as LicensePayload['features'],
    iat: Math.floor(Date.now() / 1000),
    exp,
    graceUntil: exp + input.graceDias * 86_400,
    keyId: env.LICENSE_KEY_ID,
  };
}

/**
 * Estado de licencia "efectivo": aplica la vigencia y el período de gracia
 * sobre el estado almacenado. El estado `vencida` también se deduce aquí
 * porque no existe un job que lo escriba en la base de datos.
 */
export function estadoLicenciaEfectiva(licencia: {
  estado: string;
  vence_en: Date;
  grace_dias: number;
}): string {
  if (licencia.estado === 'suspendida' || licencia.estado === 'vencida') {
    return licencia.estado;
  }
  const limite = licencia.vence_en.getTime() + licencia.grace_dias * 86_400_000;
  if (Date.now() > limite) return 'vencida';
  return licencia.estado;
}

/**
 * La licencia pertenece al negocio, no a la terminal: se firma una sola vez
 * con el `empresaId` como único vínculo y el mismo token se comparte con todas
 * las instalaciones del negocio. Debe llamarse dentro de la transacción que
 * cambia la licencia para que el pull entregue tokens actualizados.
 */
export async function refirmarLicenciasEmpresa(
  client: PoolClient,
  empresaId: string
): Promise<number> {
  const licencia = await client.query<{
    id: string;
    plan_codigo: string;
    features: string[] | null;
    plan_features: string[] | null;
    vence_en: Date;
    grace_dias: number;
  }>(
    `select l.id, p.codigo as plan_codigo, l.features, p.features as plan_features,
            l.vence_en, l.grace_dias
      from licencias l
      join planes p on p.id = l.plan_id
      where l.empresa_id = $1 and l.estado = 'activa'`,
    [empresaId]
  );
  const fila = licencia.rows[0];
  if (!fila) return 0;

  const features =
    Array.isArray(fila.features) && fila.features.length > 0
      ? fila.features
      : fila.plan_features ?? [];

  const token = firmarLicencia(
    construirPayloadLicencia({
      licenseId: fila.id,
      empresaId,
      plan: fila.plan_codigo,
      features: features as string[],
      venceEn: fila.vence_en,
      graceDias: fila.grace_dias,
    })
  );

  const resultado = await client.query(
    `update dispositivos
     set licencia_firmada = $2, licencia_emitida_en = now()
     where empresa_id = $1`,
    [empresaId, token]
  );
  return resultado.rowCount ?? 0;
}
