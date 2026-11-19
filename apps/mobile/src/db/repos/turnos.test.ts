import { describe, expect, it } from 'vitest';
import type { SQLiteDatabase } from 'expo-sqlite';
import { turnoAbierto } from './turnos';

const TURNO = {
  id: 9,
  uuid: '99999999-9999-4999-8999-999999999999',
  usuario_id: 1,
  apertura: '2026-11-18T20:00:00.000Z',
  cierre: null,
  ventas_count: 2,
  total_esperado: 100,
  desglose_json: '{"efectivo":100}',
  dinero_real: null,
  diferencia: null,
  estado: 'abierto',
};

/**
 * SQLite falsa que aplica el filtro `device_id IN (...)` como lo haría la
 * consulta real, para comprobar que un turno ajeno nunca se devuelve.
 */
function dbConTurno(deviceId: string): {
  db: SQLiteDatabase;
  llamadas: Array<{ sql: string; args: unknown[] }>;
} {
  const llamadas: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    getAllAsync: async (sql: string, ...args: unknown[]) => {
      llamadas.push({ sql, args });
      if (sql.includes('FROM settings')) {
        return [
          { clave: 'empresa_id', valor: 'empresa-local' },
          { clave: 'device_id', valor: 'device-local' },
        ];
      }
      return [];
    },
    getFirstAsync: async (sql: string, ...args: unknown[]) => {
      llamadas.push({ sql, args });
      if (sql.includes('FROM settings')) {
        return { valor: 'device-servidor' };
      }
      if (sql.includes('FROM turnos_caja')) {
        const [, local, servidor] = args as [number, string, string];
        return deviceId === local || deviceId === servidor ? TURNO : null;
      }
      return null;
    },
    runAsync: async () => ({ lastInsertRowId: 0, changes: 0 }),
  } as unknown as SQLiteDatabase;
  return { db, llamadas };
}

describe('turnoAbierto', () => {
  it('devuelve el turno abierto por este dispositivo local', async () => {
    const { db } = dbConTurno('device-local');
    const turno = await turnoAbierto(db, 1);
    expect(turno?.id).toBe(TURNO.id);
  });

  it('devuelve el turno que el pull marcó con el id de servidor de este dispositivo', async () => {
    const { db } = dbConTurno('device-servidor');
    const turno = await turnoAbierto(db, 1);
    expect(turno?.id).toBe(TURNO.id);
  });

  it('ignora un turno abierto en otra terminal', async () => {
    const { db, llamadas } = dbConTurno('device-de-otro-telefono');
    const turno = await turnoAbierto(db, 1);

    expect(turno).toBeNull();
    const consulta = llamadas.find((fila) => fila.sql.includes('FROM turnos_caja'));
    expect(consulta?.sql).toContain('device_id IN');
    expect(consulta?.args).toEqual([1, 'device-local', 'device-servidor']);
  });
});
