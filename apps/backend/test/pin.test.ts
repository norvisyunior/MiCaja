import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  PIN_HASH_FICTICIO,
  crearHashPin,
  verificarPinServidor,
} from '../src/services/pin';

function sha256(valor: string): string {
  return crypto.createHash('sha256').update(valor).digest('hex');
}

function hashSimple(pin: string, salt: string): string {
  return `sha256$${salt}$${sha256(`${salt}:${pin}`)}`;
}

function hashIterado(pin: string, salt: string, rondas: number): string {
  let hash = sha256(`${salt}:${pin}`);
  for (let i = 0; i < rondas; i += 1) {
    hash = sha256(`${salt}${hash}`);
  }
  return `sha256it$${rondas}$${salt}$${hash}`;
}

describe('verificación de PIN del servidor', () => {
  const salt = '00112233445566778899aabbccddeeff';

  it('acepta el formato iterado que usa la app', () => {
    expect(verificarPinServidor('1234', hashIterado('1234', salt, 1000))).toBe(true);
  });

  it('acepta el formato simple heredado', () => {
    expect(verificarPinServidor('1234', hashSimple('1234', salt))).toBe(true);
  });

  it('rechaza un PIN incorrecto', () => {
    expect(verificarPinServidor('9999', hashIterado('1234', salt, 1000))).toBe(false);
  });

  it('rechaza hashes vacíos, corruptos o con demasiadas rondas', () => {
    expect(verificarPinServidor('1234', null)).toBe(false);
    expect(verificarPinServidor('1234', '')).toBe(false);
    expect(verificarPinServidor('1234', 'texto-plano')).toBe(false);
    expect(verificarPinServidor('1234', hashIterado('1234', salt, 100_001))).toBe(false);
  });

  it('mantiene un hash ficticio válido para usuarios inexistentes', () => {
    expect(verificarPinServidor('1234', PIN_HASH_FICTICIO)).toBe(false);
  });
});

describe('generación de hash de PIN del backend', () => {
  it('produce un hash que el servidor puede verificar', () => {
    const hash = crearHashPin('1234');
    expect(hash).toMatch(/^sha256it\$1000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(verificarPinServidor('1234', hash)).toBe(true);
    expect(verificarPinServidor('9999', hash)).toBe(false);
  });

  it('usa una sal distinta en cada generación', () => {
    expect(crearHashPin('1234')).not.toBe(crearHashPin('1234'));
  });
});
