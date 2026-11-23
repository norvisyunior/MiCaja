import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeLicenseToken } from '@micaja/shared';
import {
  construirPayloadLicencia,
  firmarLicenciaConClave,
  verificarLicenciaConClave,
} from '../src/services/licencias';

function claves(): { privada: string; publica: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    privada: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    publica: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
  };
}

describe('firma de licencias', () => {
  it('firma y verifica un payload Ed25519', () => {
    const { privada, publica } = claves();
    const payload = construirPayloadLicencia({
      licenseId: '11111111-1111-4111-8111-111111111111',
      empresaId: '22222222-2222-4222-8222-222222222222',
      plan: 'pro',
      features: ['ventas', 'inventario'],
      venceEn: new Date('2030-01-01T00:00:00.000Z'),
      graceDias: 7,
    });

    const token = firmarLicenciaConClave(payload, privada);
    expect(verificarLicenciaConClave(token, publica)).toBe(true);
    expect(payload.deviceId).toBeNull();
    expect(decodeLicenseToken(token)).toEqual(payload);
  });

  it('rechaza una firma manipulada', () => {
    const { privada, publica } = claves();
    const payload = construirPayloadLicencia({
      licenseId: '11111111-1111-4111-8111-111111111111',
      empresaId: '22222222-2222-4222-8222-222222222222',
      deviceId: '33333333-3333-4333-8333-333333333333',
      plan: 'basico',
      features: ['ventas'],
      venceEn: new Date('2030-01-01T00:00:00.000Z'),
      graceDias: 0,
    });

    const token = firmarLicenciaConClave(payload, privada);
    const [cuerpo, firma] = token.split('.');
    const alterado = `${cuerpo.slice(0, -1)}${cuerpo.endsWith('A') ? 'B' : 'A'}.${firma}`;
    expect(verificarLicenciaConClave(alterado, publica)).toBe(false);
  });

  it('rechaza una clave pública distinta', () => {
    const { privada } = claves();
    const { publica: otraPublica } = claves();
    const payload = construirPayloadLicencia({
      licenseId: '11111111-1111-4111-8111-111111111111',
      empresaId: '22222222-2222-4222-8222-222222222222',
      deviceId: '33333333-3333-4333-8333-333333333333',
      plan: 'basico',
      features: ['ventas'],
      venceEn: new Date('2030-01-01T00:00:00.000Z'),
      graceDias: 0,
    });

    const token = firmarLicenciaConClave(payload, privada);
    expect(verificarLicenciaConClave(token, otraPublica)).toBe(false);
  });
});
