import { describe, expect, it } from 'vitest';
import type { SQLiteDatabase } from 'expo-sqlite';
import { CLAVE_FINGERPRINT_DISPOSITIVO } from '../api/config';
import { describirNavegador, obtenerFingerprintDispositivo } from './fingerprint';

const navegador = {
  userAgent: 'Mozilla/5.0 Chrome/120',
  platform: 'Win32',
  vendor: 'Google Inc.',
  language: 'es',
  languages: ['es', 'en'],
  hardwareConcurrency: 8,
  deviceMemory: 8,
  maxTouchPoints: 0,
};

const pantalla = {
  width: 1920,
  height: 1080,
  availWidth: 1920,
  availHeight: 1040,
  colorDepth: 24,
};

function dbConFingerprint(guardada: string | null): SQLiteDatabase {
  return {
    getFirstAsync: async (_sql: string, ...args: unknown[]) => {
      if (args[0] === CLAVE_FINGERPRINT_DISPOSITIVO && guardada) {
        return { valor: guardada };
      }
      return null;
    },
    getAllAsync: async () => [
      { clave: 'empresa_id', valor: 'empresa-local' },
      { clave: 'device_id', valor: 'uuid-local' },
    ],
    runAsync: async () => ({ lastInsertRowId: 0, changes: 1 }),
  } as unknown as SQLiteDatabase;
}

describe('describirNavegador', () => {
  it('incluye datos estables y no depende del viewport', () => {
    const descripcion = describirNavegador(
      navegador,
      pantalla,
      'America/Mexico_City',
      1
    );

    expect(descripcion).toContain('Chrome/120');
    expect(descripcion).toContain('America/Mexico_City');
    expect(descripcion).toContain('1920x1080');
    expect(descripcion).toContain('8cpu');
    expect(descripcion).not.toContain('innerWidth');
  });

  it('cambia si cambia un dato del navegador', () => {
    const base = describirNavegador(navegador, pantalla, 'UTC', 1);
    const otro = describirNavegador(
      { ...navegador, userAgent: 'Mozilla/5.0 Firefox/130' },
      pantalla,
      'UTC',
      1
    );

    expect(base).not.toBe(otro);
  });
});

describe('obtenerFingerprintDispositivo', () => {
  it('reutiliza la huella guardada por un login global', async () => {
    await expect(obtenerFingerprintDispositivo(dbConFingerprint('web-abc'))).resolves.toBe(
      'web-abc'
    );
  });

  it('en nativo usa el id local cuando no hay huella guardada', async () => {
    await expect(obtenerFingerprintDispositivo(dbConFingerprint(null))).resolves.toBe(
      'uuid-local'
    );
  });
});
