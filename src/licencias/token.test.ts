import { describe, expect, it } from 'vitest';
import {
  clavePublicaDesdeSpki,
  decodificarTokenLicencia,
  type PayloadLicencia,
} from './token';

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function bytesDe(texto: string): Uint8Array {
  return new Uint8Array(Buffer.from(texto, 'utf8'));
}

const payloadBase: PayloadLicencia = {
  v: 1,
  licenseId: '1f0a3c2e-8b4d-4a7e-9c1f-2d3e4f5a6b7c',
  empresaId: 'a1b2c3d4-0000-4000-8000-000000000001',
  deviceId: 'a1b2c3d4-0000-4000-8000-000000000002',
  plan: 'basico',
  features: ['ventas', 'inventario', 'reportes'],
  iat: 1_760_000_000,
  exp: 1_791_536_000,
  graceUntil: 1_792_130_800,
  keyId: 'v1',
};

function tokenDePayload(payload: PayloadLicencia): string {
  const segmento = b64url(bytesDe(JSON.stringify(payload)));
  return `${segmento}.${b64url(new Uint8Array(64).fill(7))}`;
}

describe('decodificarTokenLicencia', () => {
  it('decodifica un token bien formado', () => {
    const decodificado = decodificarTokenLicencia(tokenDePayload(payloadBase));
    expect(decodificado.payload).toEqual(payloadBase);
    expect(decodificado.firma).toHaveLength(64);
    // Los bytes firmados son el segmento ASCII original, no el JSON.
    expect(Buffer.from(decodificado.payloadBytes).toString()).toBe(
      Buffer.from(decodificado.segmentoPayload).toString()
    );
  });

  it('acepta relleno "=" y espacios en el base64url', () => {
    const conRelleno = `${b64url(bytesDe(JSON.stringify(payloadBase)))}==`;
    const decodificado = decodificarTokenLicencia(`${conRelleno}.${b64url(new Uint8Array(64))}`);
    expect(decodificado.payload.plan).toBe('basico');
  });

  it('rechaza tokens con más o menos de dos segmentos', () => {
    expect(() => decodificarTokenLicencia('solo-un-segmento')).toThrow('LICENCIA_MALFORMADA');
    expect(() => decodificarTokenLicencia('a.b.c')).toThrow('LICENCIA_MALFORMADA');
    expect(() => decodificarTokenLicencia('')).toThrow('LICENCIA_MALFORMADA');
  });

  it('rechaza base64 inválido', () => {
    const payloadMalo = b64url(bytesDe('{"v":1}')).replace(/Q$/, '!');
    expect(() => decodificarTokenLicencia(`${payloadMalo}.firma`)).toThrow('BASE64_INVALIDO');
  });

  it('rechaza payloads sin los campos obligatorios', () => {
    const casos: unknown[] = [
      null,
      {},
      { v: 2 },
      { v: 1 },
      { v: 1, licenseId: 'x', empresaId: 'y', plan: 'p', features: 'no-array', exp: 1 },
      { v: 1, licenseId: 'x', empresaId: 'y', plan: 'p', features: [], exp: 'no-numero' },
    ];
    for (const caso of casos) {
      const segmento = b64url(bytesDe(JSON.stringify(caso)));
      expect(() => decodificarTokenLicencia(`${segmento}.firma`)).toThrow('LICENCIA_MALFORMADA');
    }
  });

  it('rechaza JSON no parseable', () => {
    const segmento = b64url(bytesDe('{no-es-json'));
    expect(() => decodificarTokenLicencia(`${segmento}.firma`)).toThrow();
  });
});

describe('clavePublicaDesdeSpki', () => {
  it('extrae los últimos 32 bytes de la clave DER', () => {
    const clave = new Uint8Array(32).map((_, i) => i);
    const der = new Uint8Array([...new Uint8Array(12).fill(0x30), ...clave]);
    const extraida = clavePublicaDesdeSpki(Buffer.from(der).toString('base64'));
    expect(Array.from(extraida)).toEqual(Array.from(clave));
  });

  it('rechaza una clave demasiado corta', () => {
    expect(() => clavePublicaDesdeSpki(Buffer.from(new Uint8Array(31)).toString('base64'))).toThrow(
      'CLAVE_PUBLICA_INVALIDA'
    );
  });
});
