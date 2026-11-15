import ngrok from '@expo/ngrok';

/**
 * Expone el backend local (puerto 4000) por un túnel https de ngrok para
 * probar la app desde un teléfono que no puede alcanzar la PC por la red
 * local. La URL impresa es la que se guarda en Ajustes › Sincronización.
 *
 * Uso (desde apps/mobile):  node scripts/tunel-api.mjs   (dejar corriendo mientras se prueba)
 *                           node scripts/tunel-api.mjs 4001   (otro puerto)
 */
const puerto = Number(process.argv[2] ?? process.env.PORT ?? 4000);

try {
  const url = await ngrok.connect({ addr: puerto });
  console.log(`[tunel-api] ${url} -> http://localhost:${puerto}`);
  console.log('[tunel-api] usa esta URL en la app (Ajustes › Sincronización). Ctrl+C para cerrar.');
} catch (error) {
  console.error('[tunel-api] no se pudo abrir el túnel:');
  console.error(JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
  process.exit(1);
}

process.on('SIGINT', async () => {
  await ngrok.kill();
  process.exit(0);
});

// Mantener el proceso vivo.
setInterval(() => {}, 1 << 30);
