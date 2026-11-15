import { afterEach, describe, expect, it } from 'vitest';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import {
  CLAVE_URL_SERVIDOR,
  leerSetting,
  normalizarUrlServidor,
  urlServidorPorDefecto,
} from './config';

afterEach(() => {
  Platform.OS = 'ios';
});

describe('urlServidorPorDefecto', () => {
  it('usa 10.0.2.2 en el emulador de Android', () => {
    Platform.OS = 'android';
    expect(urlServidorPorDefecto()).toBe('http://10.0.2.2:4000');
  });

  it('usa localhost en el resto de plataformas', () => {
    Platform.OS = 'ios';
    expect(urlServidorPorDefecto()).toBe('http://localhost:4000');
  });
});

describe('normalizarUrlServidor', () => {
  it('conserva una URL correcta', () => {
    expect(normalizarUrlServidor('https://api.micaja.cu')).toBe('https://api.micaja.cu');
  });

  it('quita barras finales sobrantes', () => {
    expect(normalizarUrlServidor('http://192.168.1.5:4000/')).toBe('http://192.168.1.5:4000');
    expect(normalizarUrlServidor('http://192.168.1.5:4000///')).toBe('http://192.168.1.5:4000');
  });

  it('añade el esquema si falta', () => {
    expect(normalizarUrlServidor('192.168.1.5:4000')).toBe('http://192.168.1.5:4000');
  });

  it('descarta valores vacíos y devuelve el valor por defecto', () => {
    expect(normalizarUrlServidor('   ')).toBe('http://localhost:4000');
  });
});

describe('leerSetting', () => {
  const dbCon = (fila: { valor: string } | null) =>
    ({
      getFirstAsync: async () => fila,
    }) as unknown as SQLiteDatabase;

  it('devuelve el valor guardado', async () => {
    expect(await leerSetting(dbCon({ valor: 'abc' }), CLAVE_URL_SERVIDOR)).toBe('abc');
  });

  it('devuelve null si la clave no existe', async () => {
    expect(await leerSetting(dbCon(null), CLAVE_URL_SERVIDOR)).toBeNull();
  });
});
