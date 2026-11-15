import crypto from 'node:crypto';
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
  deviceId: string;
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
    deviceId: input.deviceId,
    plan: input.plan,
    features: input.features as LicensePayload['features'],
    iat: Math.floor(Date.now() / 1000),
    exp,
    graceUntil: exp + input.graceDias * 86_400,
    keyId: env.LICENSE_KEY_ID,
  };
}
