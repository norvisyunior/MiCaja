import { z } from 'zod';
import { LICENSE_FEATURES } from './types';

export const LICENSE_VERSION = 1;

export const licensePayloadSchema = z
  .object({
    v: z.literal(LICENSE_VERSION),
    licenseId: z.string().uuid(),
    empresaId: z.string().uuid(),
    deviceId: z.string().uuid().nullable(),
    plan: z.string().min(1).max(50),
    features: z.array(z.enum(LICENSE_FEATURES)),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().nonnegative(),
    graceUntil: z.number().int().nonnegative().nullable(),
    keyId: z.string().min(1).max(50),
  })
  .strict();

export type LicensePayload = z.infer<typeof licensePayloadSchema>;

export interface LicenseStatus {
  valida: boolean;
  enGracia: boolean;
  vencida: boolean;
  motivo?: 'firma' | 'empresa' | 'dispositivo' | 'vencida' | 'suspendida';
}

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function bytesToBase64Url(bytes: Uint8Array): string {
  let salida = '';
  let i = 0;

  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    salida +=
      ALFABETO[(n >> 18) & 63] +
      ALFABETO[(n >> 12) & 63] +
      ALFABETO[(n >> 6) & 63] +
      ALFABETO[n & 63];
  }

  const resto = bytes.length - i;
  if (resto === 1) {
    const n = bytes[i] << 16;
    salida += ALFABETO[(n >> 18) & 63] + ALFABETO[(n >> 12) & 63];
  } else if (resto === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    salida += ALFABETO[(n >> 18) & 63] + ALFABETO[(n >> 12) & 63] + ALFABETO[(n >> 6) & 63];
  }

  return salida;
}

export function base64UrlToBytes(value: string): Uint8Array {
  const limpio = value.replace(/=+$/, '');
  const salida: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const caracter of limpio) {
    const indice = ALFABETO.indexOf(caracter);
    if (indice === -1) {
      throw new Error('BASE64_INVALIDO');
    }
    buffer = (buffer << 6) | indice;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      salida.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(salida);
}

export function encodeLicensePayload(payload: LicensePayload): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

export function decodeLicensePayload(encoded: string): LicensePayload {
  const json = new TextDecoder().decode(base64UrlToBytes(encoded));
  return licensePayloadSchema.parse(JSON.parse(json));
}

export function decodeLicenseToken(token: string): LicensePayload {
  const partes = token.split('.');
  if (partes.length !== 2) {
    throw new Error('LICENCIA_MALFORMADA');
  }
  return decodeLicensePayload(partes[0]);
}

export function licenseIsActive(
  payload: LicensePayload,
  ahoraSegundos = Math.floor(Date.now() / 1000)
): boolean {
  return ahoraSegundos < payload.exp;
}

export function licenseInGrace(
  payload: LicensePayload,
  ahoraSegundos = Math.floor(Date.now() / 1000)
): boolean {
  return (
    ahoraSegundos >= payload.exp &&
    payload.graceUntil !== null &&
    ahoraSegundos < payload.graceUntil
  );
}

export function licenseAllowsFeature(
  payload: LicensePayload,
  feature: string,
  ahoraSegundos = Math.floor(Date.now() / 1000)
): boolean {
  if (!licenseIsActive(payload, ahoraSegundos) && !licenseInGrace(payload, ahoraSegundos)) {
    return false;
  }
  return payload.features.includes(feature as LicensePayload['features'][number]);
}

export function evaluateLicense(
  payload: LicensePayload,
  opciones: {
    empresaId?: string;
    deviceId?: string;
    suspendida?: boolean;
    ahoraSegundos?: number;
  } = {}
): LicenseStatus {
  const ahora = opciones.ahoraSegundos ?? Math.floor(Date.now() / 1000);

  if (opciones.empresaId && payload.empresaId !== opciones.empresaId) {
    return { valida: false, enGracia: false, vencida: false, motivo: 'empresa' };
  }
  if (opciones.suspendida) {
    return { valida: false, enGracia: false, vencida: false, motivo: 'suspendida' };
  }

  const activa = licenseIsActive(payload, ahora);
  const gracia = licenseInGrace(payload, ahora);

  return {
    valida: activa || gracia,
    enGracia: gracia,
    vencida: !activa && !gracia,
    motivo: !activa && !gracia ? 'vencida' : undefined,
  };
}
