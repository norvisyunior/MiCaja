import { describe, expect, it } from 'vitest';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  encolarPinHashesPendientes,
  encolarSettingUpsert,
  encolarUsuarioUpsert,
} from './encolar';

function dbConUsuario(pin: string): {
  db: SQLiteDatabase;
  llamadas: Array<{ sql: string; args: unknown[] }>;
} {
  const llamadas: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    getFirstAsync: async (sql: string) => {
      if (sql.includes('FROM usuarios')) {
        return {
          id: 7,
          uuid: '11111111-1111-4111-8111-111111111111',
          nombre: 'Ana',
          usuario: 'ana',
          rol: 'dependiente',
          pin,
          activo: 1,
          version: 3,
          deleted_at: null,
        };
      }
      return null;
    },
    getAllAsync: async () => [],
    runAsync: async (sql: string, ...args: unknown[]) => {
      llamadas.push({ sql, args });
      return { lastInsertRowId: 0, changes: 1 };
    },
  } as unknown as SQLiteDatabase;
  return { db, llamadas };
}

function payloadUsuario(llamadas: Array<{ sql: string; args: unknown[] }>): Record<string, unknown> {
  const insert = llamadas.find((fila) => fila.sql.includes('INSERT OR IGNORE INTO sync_outbox'));
  if (!insert) throw new Error('No se encoló el usuario');
  return JSON.parse(insert.args[7] as string) as Record<string, unknown>;
}

describe('encolarUsuarioUpsert', () => {
  it('migra un PIN en texto plano y sube solo el hash', async () => {
    const { db, llamadas } = dbConUsuario('1234');
    await encolarUsuarioUpsert(db, 7);

    const update = llamadas.find((fila) => fila.sql.includes('UPDATE usuarios SET pin'));
    expect(update).toBeTruthy();
    expect(update!.args[0]).toMatch(/^sha256it\$1000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(payloadUsuario(llamadas).pinHash).toBe(update!.args[0]);
    expect(JSON.stringify(payloadUsuario(llamadas))).not.toContain('1234');
  });

  it('envía un hash existente sin volver a hashearlo', async () => {
    const hash = `sha256it$1000$${'a'.repeat(32)}$${'b'.repeat(64)}`;
    const { db, llamadas } = dbConUsuario(hash);
    await encolarUsuarioUpsert(db, 7);

    expect(llamadas.some((fila) => fila.sql.includes('UPDATE usuarios SET pin'))).toBe(false);
    expect(payloadUsuario(llamadas).pinHash).toBe(hash);
  });

  it('omite pinHash si la cuenta no tiene PIN local', async () => {
    const { db, llamadas } = dbConUsuario('');
    await encolarUsuarioUpsert(db, 7);

    expect(payloadUsuario(llamadas)).not.toHaveProperty('pinHash');
  });
});

describe('encolarSettingUpsert', () => {
  it('encola settings sin importar el rol del dispositivo', async () => {
    const { db, llamadas } = dbConUsuario('');
    await encolarSettingUpsert(db, 'moneda', 'USD', 4);

    expect(payloadUsuario(llamadas)).toEqual({
      clave: 'moneda',
      valor: 'USD',
      version: 4,
    });
  });
});

function dbPinHashes(opciones: { marca?: string; rol?: string }) {
  const llamadas: Array<{ sql: string; args: unknown[] }> = [];
  const usuario = {
    id: 7,
    uuid: '11111111-1111-4111-8111-111111111111',
    nombre: 'Ana',
    usuario: 'ana',
    rol: 'dependiente',
    pin: `sha256it$1000$${'a'.repeat(32)}$${'b'.repeat(64)}`,
    activo: 1,
    version: 3,
    deleted_at: null,
  };
  const db = {
    getFirstAsync: async (sql: string, ...args: unknown[]) => {
      if (sql.includes('FROM usuarios')) return usuario;
      if (sql.includes('FROM sync_outbox')) return null;
      if (sql.includes('FROM settings')) {
        if (args[0] === 'sync_pin_hashes_hecho') {
          return opciones.marca ? { valor: opciones.marca } : null;
        }
        if (args[0] === 'activacion_rol') {
          return opciones.rol ? { valor: opciones.rol } : null;
        }
      }
      return null;
    },
    getAllAsync: async (sql: string) => {
      if (sql.includes('FROM usuarios')) {
        return [{ id: usuario.id, uuid: usuario.uuid }];
      }
      return [];
    },
    runAsync: async (sql: string, ...args: unknown[]) => {
      llamadas.push({ sql, args });
      return { lastInsertRowId: 0, changes: 1 };
    },
  } as unknown as SQLiteDatabase;
  return { db, llamadas };
}

describe('encolarPinHashesPendientes', () => {
  it('no repite la pasada si ya se hizo hace menos de 24 horas', async () => {
    const { db, llamadas } = dbPinHashes({
      marca: String(Date.now()),
      rol: 'propietario',
    });

    expect(await encolarPinHashesPendientes(db)).toBe(0);
    expect(llamadas).toEqual([]);
  });

  it('reenvía los hashes aunque exista una marca antigua', async () => {
    const { db, llamadas } = dbPinHashes({ marca: '1', rol: 'propietario' });

    expect(await encolarPinHashesPendientes(db)).toBe(1);
    expect(
      llamadas.some((fila) => fila.sql.includes('INSERT OR IGNORE INTO sync_outbox'))
    ).toBe(true);
    const marca = llamadas.find(
      (fila) => fila.sql.includes('ON CONFLICT(clave)') && fila.args[0] === 'sync_pin_hashes_hecho'
    );
    expect(marca).toBeTruthy();
    expect(Number(marca!.args[1])).toBeGreaterThan(1);
  });

  it('no sube hashes desde una terminal de dependiente', async () => {
    const { db, llamadas } = dbPinHashes({ rol: 'dependiente' });

    expect(await encolarPinHashesPendientes(db)).toBe(0);
    expect(
      llamadas.some((fila) => fila.sql.includes('INSERT OR IGNORE INTO sync_outbox'))
    ).toBe(false);
  });
});
