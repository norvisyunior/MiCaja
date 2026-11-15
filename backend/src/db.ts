import { Pool, type PoolClient } from 'pg';
import { env } from './config';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

export async function withTenant<T>(
  empresaId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.tenant_id', $1, true)", [empresaId]);
    await client.query("select set_config('app.admin', 'false', true)");
    const resultado = await fn(client);
    await client.query('commit');
    return resultado;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function withAdmin<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.admin', 'true', true)");
    await client.query("select set_config('app.tenant_id', '', true)");
    const resultado = await fn(client);
    await client.query('commit');
    return resultado;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export function requireDatabase(): void {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL_NO_CONFIGURADA');
  }
}

/**
 * Comprueba la conexión contra Postgres y devuelve la versión del servidor.
 * Se usa en el arranque para que la consola diga de una si la BD conectó.
 */
export async function verificarConexion(): Promise<string> {
  requireDatabase();
  const resultado = await pool.query<{ version: string }>(
    'select version() as version'
  );
  return resultado.rows[0].version;
}
