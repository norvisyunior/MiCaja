import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SQLiteDatabase } from 'expo-sqlite';
import { pullConsulta, verificarServidor } from './cliente';

const db = {
  getFirstAsync: async () => ({ valor: 'http://192.168.1.10:4000/' }),
} as unknown as SQLiteDatabase;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('verificarServidor', () => {
  it('devuelve true cuando el backend responde correctamente', async () => {
    const fetch = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetch);

    await expect(verificarServidor(db)).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'http://192.168.1.10:4000/health',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('devuelve false cuando el backend responde con error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));

    await expect(verificarServidor(db)).resolves.toBe(false);
  });

  it('devuelve false cuando no se puede alcanzar el backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('sin red');
      })
    );

    await expect(verificarServidor(db)).resolves.toBe(false);
  });
});

describe('pullConsulta', () => {
  it('pide el pull de solo lectura al endpoint dedicado', async () => {
    const respuesta = {
      cambios: [],
      hayMas: false,
      cursor: null,
      licencia: null,
      soloLectura: true,
      serverTime: '2026-01-01T00:00:00.000Z',
    };
    const fetch = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify(respuesta),
    }));
    vi.stubGlobal('fetch', fetch);

    const resultado = await pullConsulta(db, '11111111-1111-4111-8111-111111111111');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/sync/pull-consulta?'),
      expect.objectContaining({ method: 'GET' })
    );
    expect(resultado.soloLectura).toBe(true);
  });
});
