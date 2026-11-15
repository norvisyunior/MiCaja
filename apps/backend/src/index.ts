import { createApp } from './app';
import { env } from './config';
import { verificarConexion } from './db';

const app = createApp();

app.listen(env.PORT, async () => {
  console.log(`[micaja-api] escuchando en http://localhost:${env.PORT}`);

  if (!env.DATABASE_URL) {
    console.warn('[micaja-api] DATABASE_URL no configurada; solo /health está operativo');
    return;
  }

  try {
    const version = await verificarConexion();
    const nombre = version.match(/^PostgreSQL\s+\S+/)?.[0] ?? version;
    console.log(`[micaja-api] base de datos conectada (${nombre})`);
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    console.error(`[micaja-api] SIN CONEXIÓN a la base de datos: ${detalle}`);
    console.error('[micaja-api] revisa DATABASE_URL en apps/backend/.env');
  }
});
