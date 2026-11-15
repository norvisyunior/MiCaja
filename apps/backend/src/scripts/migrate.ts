import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { env } from '../config';

async function main(): Promise<void> {
  const connectionString = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Configura DIRECT_URL o DATABASE_URL');
  }

  const directorio = path.resolve(__dirname, '../../supabase/migrations');
  const archivos = fs
    .readdirSync(directorio)
    .filter((archivo) => archivo.endsWith('.sql'))
    .sort();

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        nombre text primary key,
        aplicada_en timestamptz not null default now()
      )
    `);

    const aplicadas = await client.query<{ nombre: string }>(
      `select nombre from schema_migrations`
    );
    const conjunto = new Set(aplicadas.rows.map((fila) => fila.nombre));

    for (const archivo of archivos) {
      if (conjunto.has(archivo)) {
        console.log(`= ${archivo} (ya aplicada)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(directorio, archivo), 'utf8');
      console.log(`> ${archivo}`);

      await client.query('begin');
      try {
        await client.query(sql);
        await client.query(`insert into schema_migrations (nombre) values ($1)`, [archivo]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }

    console.log('Migraciones al día.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
