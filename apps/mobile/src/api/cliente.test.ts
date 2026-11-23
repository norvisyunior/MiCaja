import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SQLiteDatabase } from 'expo-sqlite';
import { verificarServidor } from './cliente';

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
