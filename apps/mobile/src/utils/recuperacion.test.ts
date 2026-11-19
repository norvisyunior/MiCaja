import { describe, expect, it } from 'vitest';
import {
  crearHashCodigoRecuperacion,
  esCodigoRecuperacionValido,
  formatearCodigoRecuperacion,
  generarCodigoRecuperacion,
  LONGITUD_CODIGO_RECUPERACION,
  normalizarCodigoRecuperacion,
  verificarCodigoRecuperacion,
} from './recuperacion';

const CODIGO = 'ABCD-EFGH-JKLM';

describe('generarCodigoRecuperacion', () => {
  it('genera códigos válidos con el formato esperado', () => {
    for (let i = 0; i < 20; i += 1) {
      const codigo = generarCodigoRecuperacion();
      expect(codigo).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(esCodigoRecuperacionValido(codigo)).toBe(true);
      expect(normalizarCodigoRecuperacion(codigo)).toHaveLength(
        LONGITUD_CODIGO_RECUPERACION
      );
    }
  });

  it('no usa caracteres ambiguos y produce códigos distintos', () => {
    const codigos = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const codigo = normalizarCodigoRecuperacion(generarCodigoRecuperacion());
      expect(codigo).not.toMatch(/[IO01]/);
      codigos.add(codigo);
    }
    expect(codigos.size).toBe(20);
  });
});

describe('normalización y formato', () => {
  it('acepta mayúsculas, minúsculas, espacios y guiones', () => {
    expect(normalizarCodigoRecuperacion(' abcd-efgh jklm ')).toBe('ABCDEFGHJKLM');
    expect(normalizarCodigoRecuperacion('a.b/c_d')).toBe('ABCD');
  });

  it('formatea en grupos de cuatro y recorta el excedente', () => {
    expect(formatearCodigoRecuperacion('abcdefghjklm')).toBe(CODIGO);
    expect(formatearCodigoRecuperacion('ABC')).toBe('ABC');
    expect(formatearCodigoRecuperacion('abcdefghjklmxyz')).toBe(CODIGO);
    expect(formatearCodigoRecuperacion('')).toBe('');
  });

  it('valida longitud y alfabeto sin caracteres ambiguos', () => {
    expect(esCodigoRecuperacionValido(CODIGO)).toBe(true);
    expect(esCodigoRecuperacionValido('abcd efgh jklm')).toBe(true);
    expect(esCodigoRecuperacionValido('ABCDEFGHJKL')).toBe(false);
    expect(esCodigoRecuperacionValido('ABCDEFGHJKLMX')).toBe(false);
    expect(esCodigoRecuperacionValido('ABCD-EFGH-JKLI')).toBe(false);
    expect(esCodigoRecuperacionValido('ABCD-EFGH-JKLO')).toBe(false);
    expect(esCodigoRecuperacionValido('ABCD-EFGH-JKL0')).toBe(false);
    expect(esCodigoRecuperacionValido('ABCD-EFGH-JKL1')).toBe(false);
    expect(esCodigoRecuperacionValido('')).toBe(false);
  });
});

describe('hash del código de recuperación', () => {
  it('verifica el código correcto con cualquier formato de entrada', async () => {
    const hash = await crearHashCodigoRecuperacion(CODIGO);

    expect(hash.startsWith('sha256it$')).toBe(true);
    expect(await verificarCodigoRecuperacion(CODIGO, hash)).toBe(true);
    expect(await verificarCodigoRecuperacion('abcd efgh jklm', hash)).toBe(true);
    expect(await verificarCodigoRecuperacion('ZZZZ-ZZZZ-ZZZZ', hash)).toBe(false);
  });

  it('usa una sal distinta en cada hash', async () => {
    const primero = await crearHashCodigoRecuperacion(CODIGO);
    const segundo = await crearHashCodigoRecuperacion(CODIGO);

    expect(primero).not.toBe(segundo);
    expect(await verificarCodigoRecuperacion(CODIGO, primero)).toBe(true);
    expect(await verificarCodigoRecuperacion(CODIGO, segundo)).toBe(true);
  });

  it('rechaza códigos inválidos o hashes vacíos sin calcular el hash', async () => {
    const hash = await crearHashCodigoRecuperacion(CODIGO);

    expect(await verificarCodigoRecuperacion('', hash)).toBe(false);
    expect(await verificarCodigoRecuperacion('ABCD', hash)).toBe(false);
    expect(await verificarCodigoRecuperacion('ABCD-EFGH-JKLI', hash)).toBe(false);
    expect(await verificarCodigoRecuperacion(CODIGO, '')).toBe(false);
  });

  it('normaliza el código antes de hashearlo', async () => {
    const hash = await crearHashCodigoRecuperacion(' abcd-efgh jklm ');
    expect(await verificarCodigoRecuperacion(CODIGO, hash)).toBe(true);
  });
});
