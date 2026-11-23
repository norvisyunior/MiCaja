import { describe, expect, it } from 'vitest';
import { destinoPostActivacion } from './postActivacion';

describe('destinoPostActivacion', () => {
  it('va a login con código del negocio aunque no haya usuarios locales', () => {
    expect(destinoPostActivacion('codigo', false)).toBe('login');
    expect(destinoPostActivacion(null, false)).toBe('login');
  });

  it('va a login si ya hay usuarios locales', () => {
    expect(destinoPostActivacion('codigo', true)).toBe('login');
    expect(destinoPostActivacion('invitacion', true)).toBe('login');
  });

  it('va al alta del trabajador solo con invitación y sin usuarios', () => {
    expect(destinoPostActivacion('invitacion', false)).toBe('trabajador');
  });
});
