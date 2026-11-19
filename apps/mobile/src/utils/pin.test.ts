import { describe, expect, it } from 'vitest';
import * as Crypto from 'expo-crypto';
import {
  crearHashIterado,
  crearPinHash,
  esPinHasheado,
  esPinIterado,
  esPinValido,
  RONDAS_PIN,
  verificarHashIterado,
  verificarPin,
} from './pin';

async function crearHashHeredado(pin: string, salt: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${pin}`,
    { encoding: Crypto.CryptoEncoding.HEX }
  );
  return `sha256$${salt}$${hash}`;
}

describe('crearPinHash y verificarPin', () => {
  it('crea un hash iterado con sal y verifica el PIN correcto', async () => {
    const hash = await crearPinHash('1234');

    expect(hash.startsWith(`sha256it$${RONDAS_PIN}$`)).toBe(true);
    expect(hash.split('$')).toHaveLength(4);
    expect(hash).not.toContain('1234');
    expect(await verificarPin('1234', hash)).toBe(true);
    expect(await verificarPin('4321', hash)).toBe(false);
  });

  it('usa una sal distinta en cada hash', async () => {
    const primero = await crearPinHash('1234');
    const segundo = await crearPinHash('1234');

    expect(primero).not.toBe(segundo);
    expect(await verificarPin('1234', primero)).toBe(true);
    expect(await verificarPin('1234', segundo)).toBe(true);
  });

  it('acepta el formato heredado de una sola pasada', async () => {
    const heredado = await crearHashHeredado('1234', 'aabbccdd');

    expect(esPinHasheado(heredado)).toBe(true);
    expect(esPinIterado(heredado)).toBe(false);
    expect(await verificarPin('1234', heredado)).toBe(true);
    expect(await verificarPin('9999', heredado)).toBe(false);
  });

  it('acepta valores antiguos en texto plano únicamente si coinciden', async () => {
    expect(await verificarPin('1234', '1234')).toBe(true);
    expect(await verificarPin('1234', '9999')).toBe(false);
    expect(await verificarPin('1234', '')).toBe(false);
  });

  it('rechaza hashes malformados o con rondas fuera de rango', async () => {
    const valido = await crearPinHash('1234');
    const partes = valido.split('$');
    const salt = partes[2];
    const hash = partes[3];

    expect(await verificarPin('1234', `sha256it$0$${salt}$${hash}`)).toBe(false);
    expect(await verificarPin('1234', `sha256it$abc$${salt}$${hash}`)).toBe(false);
    expect(await verificarPin('1234', `sha256it$100001$${salt}$${hash}`)).toBe(false);
    expect(await verificarPin('1234', `sha256it$${salt}$${hash}`)).toBe(false);
    expect(await verificarPin('1234', `sha256$${salt}`)).toBe(false);
    expect(await verificarPin('1234', 'sha256it$1000$salt$hash$extra')).toBe(false);
  });

  it('detecta hashes manipulados', async () => {
    const hash = await crearPinHash('1234');
    const manipulado = `${hash.slice(0, -1)}${hash.endsWith('0') ? '1' : '0'}`;
    expect(await verificarPin('1234', manipulado)).toBe(false);
  });
});

describe('esPinValido y detección de formato', () => {
  it('solo admite exactamente cuatro dígitos', () => {
    expect(esPinValido('0000')).toBe(true);
    expect(esPinValido('9876')).toBe(true);
    expect(esPinValido('123')).toBe(false);
    expect(esPinValido('12345')).toBe(false);
    expect(esPinValido('12a4')).toBe(false);
    expect(esPinValido(' 1234')).toBe(false);
    expect(esPinValido('')).toBe(false);
  });

  it('reconoce los prefijos almacenados', () => {
    expect(esPinHasheado('sha256$aa$bb')).toBe(true);
    expect(esPinHasheado('sha256it$1000$aa$bb')).toBe(true);
    expect(esPinHasheado('1234')).toBe(false);

    expect(esPinIterado('sha256it$1000$aa$bb')).toBe(true);
    expect(esPinIterado('sha256$aa$bb')).toBe(false);
    expect(esPinIterado('1234')).toBe(false);
  });

  it('expone alias equivalentes para hashes genéricos', () => {
    expect(crearHashIterado).toBe(crearPinHash);
    expect(verificarHashIterado).toBe(verificarPin);
  });
});
