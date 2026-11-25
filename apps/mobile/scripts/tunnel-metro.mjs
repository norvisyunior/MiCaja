/**
 * Arranca Expo con túnel y reintenta si ngrok tarda demasiado en conectarse.
 *
 * Expo CLI sólo espera 10 segundos a ngrok (TUNNEL_TIMEOUT en AsyncNgrok.js).
 * En equipos cargados, la sesión de ngrok tarda un poco más y el CLI aborta con
 * "ngrok tunnel took too long to connect" o se queda sin túnel y cae a la LAN.
 * Este envoltorio detecta ese aviso, cierra el intento y vuelve a arrancar.
 *
 * También elimina EXPO_OFFLINE del entorno: con esa variable puesta Expo
 * desactiva la red y nunca intenta abrir el túnel (usa la URL de la LAN).
 *
 * Uso:
 *   npm run mobile:tunnel            # desde la raíz del monorepo
 *   npm run start:tunnel             # desde apps/mobile
 *   TUNNEL_RETRIES=5 npm run start:tunnel
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raizMobile = resolve(aqui, '..');
const cli = resolve(raizMobile, 'node_modules', 'expo', 'bin', 'cli');

const MAX_INTENTOS = Math.max(1, Number(process.env.TUNNEL_RETRIES ?? 3));
const AVISO_LISTO = /tunnel ready\./i;
const FALLOS = [
  /ngrok tunnel took too long to connect/i,
  /tunnel url not found[\s\S]{0,80}falling back to lan url/i,
  /ngrok_connect/i,
  /address already in use/i,
];

if (!existsSync(cli)) {
  console.error(`[tunnel] No se encontró Expo en ${cli}. Ejecuta npm install en apps/mobile.`);
  process.exit(1);
}

const argumentos = process.argv.slice(2).filter((arg) => arg !== '--offline');
let intento = 0;
let deteniendo = false;

function iniciar() {
  intento += 1;
  const entorno = { ...process.env };
  delete entorno.EXPO_OFFLINE;

  const hijo = spawn(process.execPath, [cli, 'start', '--tunnel', ...argumentos], {
    cwd: raizMobile,
    env: entorno,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let cola = '';
  let listo = false;
  let reintentando = false;

  const escribir = (datos) => {
    const texto = datos.toString();
    cola = (cola + texto).slice(-4000);
    process.stdout.write(texto);
    if (AVISO_LISTO.test(texto)) listo = true;
    if (!listo && !reintentando && FALLOS.some((patron) => patron.test(cola))) {
      reintentando = true;
      if (intento < MAX_INTENTOS) {
        console.error(
          `\n[tunnel] El túnel no se pudo abrir (intento ${intento}/${MAX_INTENTOS}). Reintentando...\n`
        );
      }
      hijo.kill();
    }
  };

  hijo.stdout.on('data', escribir);
  hijo.stderr.on('data', escribir);

  hijo.on('exit', (codigo) => {
    if (deteniendo) return;
    if (reintentando && intento < MAX_INTENTOS) {
      setTimeout(iniciar, 1500);
    } else if (reintentando) {
      console.error(
        '\n[tunnel] No se pudo abrir el túnel tras varios intentos.\n' +
          'Comprueba tu conexión y que no haya otro ngrok usando el puerto 4040.\n'
      );
      process.exitCode = 1;
    } else if (codigo && codigo !== 0) {
      process.exitCode = codigo;
    }
  });

  hijo.on('error', (error) => {
    console.error(`[tunnel] No se pudo arrancar Expo: ${error.message}`);
    process.exitCode = 1;
  });

  return hijo;
}

let actual = iniciar();
process.on('SIGINT', () => {
  deteniendo = true;
  actual.kill();
  process.exit(0);
});
process.on('SIGTERM', () => {
  deteniendo = true;
  actual.kill();
  process.exit(0);
});
