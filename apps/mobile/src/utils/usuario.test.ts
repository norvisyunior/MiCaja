import { describe, expect, it } from 'vitest';
import {
  esUsuarioValido,
  generarUsuarioDesdeNombre,
  normalizarUsuario,
} from './usuario';

describe('normalizarUsuario', () => {
  it('recorta y pasa a minúsculas', () => {
    expect(normalizarUsuario('  Ana  ')).toBe('ana');
    expect(normalizarUsuario('ANA')).toBe('ana');
    expect(normalizarUsuario('')).toBe('');
  });
});

describe('generarUsuarioDesdeNombre', () => {
  it('quita acentos, espacios y símbolos', () => {
    expect(generarUsuarioDesdeNombre('María José')).toBe('mariajose');
    expect(generarUsuarioDesdeNombre('  Café & Pan  ')).toBe('cafepan');
    expect(generarUsuarioDesdeNombre('Ñandú')).toBe('nandu');
  });

  it('conserva punto, guion y guion bajo', () => {
    expect(generarUsuarioDesdeNombre('Ana.Pérez-1')).toBe('ana.perez-1');
    expect(generarUsuarioDesdeNombre('a_b')).toBe('a_b');
  });

  it('limita a 20 caracteres', () => {
    const generado = generarUsuarioDesdeNombre('abcdefghijklmnopqrstuvwxyz');
    expect(generado).toBe('abcdefghijklmnopqrst');
    expect(generado).toHaveLength(20);
  });

  it('usa un valor por defecto si no queda nada', () => {
    expect(generarUsuarioDesdeNombre('###')).toBe('usuario');
    expect(generarUsuarioDesdeNombre('   ')).toBe('usuario');
    expect(generarUsuarioDesdeNombre('')).toBe('usuario');
  });
});

describe('esUsuarioValido', () => {
  it('acepta de 3 a 20 caracteres permitidos', () => {
    expect(esUsuarioValido('ana')).toBe(true);
    expect(esUsuarioValido('ANA')).toBe(true);
    expect(esUsuarioValido('ana_1')).toBe(true);
    expect(esUsuarioValido('ana-1')).toBe(true);
    expect(esUsuarioValido('ana.1')).toBe(true);
    expect(esUsuarioValido('a'.repeat(20))).toBe(true);
  });

  it('rechaza longitudes fuera de rango o caracteres no permitidos', () => {
    expect(esUsuarioValido('ab')).toBe(false);
    expect(esUsuarioValido('a'.repeat(21))).toBe(false);
    expect(esUsuarioValido('ana perez')).toBe(false);
    expect(esUsuarioValido('ana@perez')).toBe(false);
    expect(esUsuarioValido('maría')).toBe(false);
    expect(esUsuarioValido('')).toBe(false);
  });

  it('valida después de recortar espacios exteriores', () => {
    expect(esUsuarioValido('  ana  ')).toBe(true);
  });
});
