import { describe, expect, it } from 'vitest';
import {
  limpiarDatosLocales,
  reiniciarLicenciaDelNegocio,
  restablecerDispositivo,
} from './activacion';

function dbFake() {
  const sentencias: string[] = [];
  const db = {
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
    runAsync: async (sql: string, ...parametros: unknown[]) => {
      sentencias.push(`${sql} ${JSON.stringify(parametros)}`);
    },
    getFirstAsync: async () => null,
    getAllAsync: async () => [],
  };
  return { db: db as never, sentencias };
}

describe('limpieza local al cambiar de negocio', () => {
  it('reiniciarLicenciaDelNegocio borra cursor, outbox y marcas de sync', async () => {
    const { db, sentencias } = dbFake();
    await reiniciarLicenciaDelNegocio(db);
    const todo = sentencias.join('\n');
    expect(todo).toContain('DELETE FROM sync_meta');
    expect(todo).toContain('DELETE FROM sync_outbox');
    expect(todo).toContain('sync_aplazados');
    expect(todo).toContain('sync_snapshot_hecho');
  });

  it('limpiarDatosLocales borra aplazados y marcas de PIN', async () => {
    const { db, sentencias } = dbFake();
    await limpiarDatosLocales(db);
    const todo = sentencias.join('\n');
    expect(todo).toContain('DELETE FROM sync_meta');
    expect(todo).toContain('sync_aplazados');
    expect(todo).toContain('sync_pin_hashes_hecho');
  });

  it('restablecerDispositivo conserva la identidad local', async () => {
    const { db, sentencias } = dbFake();
    await restablecerDispositivo(db);
    const todo = sentencias.join('\n');
    expect(todo).toContain("'empresa_id', 'device_id'");
    expect(todo).toContain('DELETE FROM sync_meta');
  });
});
