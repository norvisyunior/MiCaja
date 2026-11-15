import bcrypt from 'bcryptjs';
import { withAdmin, pool } from '../db';
import { env } from '../config';

async function main(): Promise<void> {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL no configurada');
  }

  const [email, password, nombre] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Uso: npm run seed:admin -- admin@micaja.app "ClaveSegura123" [Nombre]');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres');
  }

  const hash = await bcrypt.hash(password, 12);

  await withAdmin(async (client) => {
    const existente = await client.query<{ id: string }>(
      `select id from admin_usuarios where lower(email) = lower($1)`,
      [email]
    );

    if (existente.rowCount) {
      await client.query(
        `update admin_usuarios
         set nombre = $2, password_hash = $3, activo = true, updated_at = now()
         where id = $1`,
        [existente.rows[0].id, nombre ?? 'Administrador', hash]
      );
      console.log(`Administrador actualizado: ${email}`);
      return;
    }

    await client.query(
      `insert into admin_usuarios (email, nombre, password_hash, rol)
       values ($1, $2, $3, 'superadmin')`,
      [email, nombre ?? 'Administrador', hash]
    );
    console.log(`Administrador creado: ${email}`);
  });

  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exitCode = 1;
});
