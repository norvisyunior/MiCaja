import { describe, expect, it } from 'vitest';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  decodeLicenseToken,
  encodeLicensePayload,
  evaluateLicense,
  licenseAllowsFeature,
  licenseInGrace,
  licenseIsActive,
  type LicensePayload,
} from './license';

const AHORA = 1_800_000_000;

function payload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    v: 1,
    licenseId: '11111111-1111-4111-8111-111111111111',
    empresaId: '22222222-2222-4222-8222-222222222222',
    deviceId: '33333333-3333-4333-8333-333333333333',
    plan: 'pro',
    features: ['ventas', 'inventario'],
    iat: AHORA - 1000,
    exp: AHORA + 1000,
    graceUntil: AHORA + 2000,
    keyId: 'v1',
    ...overrides,
  };
}

describe('base64url', () => {
  it('codifica y decodifica bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const codificado = bytesToBase64Url(bytes);
    expect(codificado).not.toContain('=');
    expect(codificado).not.toContain('+');
    expect(codificado).not.toContain('/');
    expect(Array.from(base64UrlToBytes(codificado))).toEqual(Array.from(bytes));
  });

  it('rechaza caracteres inválidos', () => {
    expect(() => base64UrlToBytes('abc$')).toThrow('BASE64_INVALIDO');
  });
});

describe('payload de licencia', () => {
  it('codifica y decodifica el token', () => {
    const original = payload();
    const token = `${encodeLicensePayload(original)}.firma`;
    expect(decodeLicenseToken(token)).toEqual(original);
  });

  it('rechaza un token sin firma', () => {
    expect(() => decodeLicenseToken(encodeLicensePayload(payload()))).toThrow(
      'LICENCIA_MALFORMADA'
    );
  });
});

describe('vigencia de licencia', () => {
  it('está activa antes de expirar', () => {
    expect(licenseIsActive(payload(), AHORA)).toBe(true);
    expect(licenseInGrace(payload(), AHORA)).toBe(false);
  });

  it('entra en gracia después de expirar', () => {
    const licencia = payload({ exp: AHORA - 10, graceUntil: AHORA + 10 });
    expect(licenseIsActive(licencia, AHORA)).toBe(false);
    expect(licenseInGrace(licencia, AHORA)).toBe(true);
    expect(licenseAllowsFeature(licencia, 'ventas', AHORA)).toBe(true);
  });

  it('queda vencida al terminar la gracia', () => {
    const licencia = payload({ exp: AHORA - 10, graceUntil: AHORA - 1 });
    expect(licenseInGrace(licencia, AHORA)).toBe(false);
    expect(licenseAllowsFeature(licencia, 'ventas', AHORA)).toBe(false);
    expect(evaluateLicense(licencia, { ahoraSegundos: AHORA })).toMatchObject({
      valida: false,
      vencida: true,
      motivo: 'vencida',
    });
  });

  it('valida empresa y dispositivo', () => {
    expect(
      evaluateLicense(payload(), {
        empresaId: '44444444-4444-4444-8444-444444444444',
        ahoraSegundos: AHORA,
      }).motivo
    ).toBe('empresa');

    expect(
      evaluateLicense(payload(), {
        deviceId: '55555555-5555-4555-8555-555555555555',
        ahoraSegundos: AHORA,
      }).motivo
    ).toBe('dispositivo');
  });

  it('marca suspendida', () => {
    expect(evaluateLicense(payload(), { suspendida: true, ahoraSegundos: AHORA })).toMatchObject({
      valida: false,
      motivo: 'suspendida',
    });
  });
});
