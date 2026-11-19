/**
 * Impide compilar un APK con la clave pública de licencias de desarrollo.
 *
 * La app verifica las licencias Ed25519 con la clave pública incluida en
 * `src/licencias/verificar.ts`. Si el APK sale con la clave del backend local,
 * los teléfonos rechazan las licencias del backend real (motivo `firma`) y la
 * caja queda bloqueada: no se puede vender.
 *
 * Uso:
 *   npm run check:clave            # desde la raíz o desde apps/mobile
 *
 * Sale con código 1 si la clave activa no es la de producción.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const archivo = resolve(aqui, '..', 'src', 'licencias', 'verificar.ts');
const fuente = readFileSync(archivo, 'utf8');

/** Valor literal de una constante (`export const X = '...'`). */
function literal(nombre) {
  const patron = new RegExp(
    `export const ${nombre}\\s*=\\s*'([^']+)'`
  );
  return fuente.match(patron)?.[1] ?? null;
}

/** Identificador al que apunta una constante (`export const X = Y`). */
function referencia(nombre) {
  const patron = new RegExp(
    `export const ${nombre}\\s*=\\s*([A-Za-z_$][\\w$]*)\\s*;`
  );
  return fuente.match(patron)?.[1] ?? null;
}

const produccion = literal('CLAVE_PUBLICA_LICENCIA_PRODUCCION');
const desarrollo = literal('CLAVE_PUBLICA_LICENCIA_DESARROLLO');
const activaDirecta = literal('CLAVE_PUBLICA_LICENCIA');
const destino = referencia('CLAVE_PUBLICA_LICENCIA');
const activa = activaDirecta ?? (destino ? literal(destino) : null);

if (!produccion || !desarrollo || !activa) {
  console.error(
    '✖ No se pudieron leer las claves públicas en src/licencias/verificar.ts'
  );
  process.exit(1);
}

if (activa === produccion) {
  console.log('✔ APK de producción: la clave pública activa es la de producción.');
  process.exit(0);
}

if (activa === desarrollo) {
  console.error(
    [
      '',
      '✖ ALTO: el APK se compilaría con la CLAVE PÚBLICA DE DESARROLLO.',
      '',
      '  Con esa clave los teléfonos rechazan las licencias del backend real',
      '  y la app queda bloqueada para vender.',
      '',
      '  En apps/mobile/src/licencias/verificar.ts cambia:',
      '',
      '    export const CLAVE_PUBLICA_LICENCIA = CLAVE_PUBLICA_LICENCIA_DESARROLLO;',
      '  por:',
      '    export const CLAVE_PUBLICA_LICENCIA = CLAVE_PUBLICA_LICENCIA_PRODUCCION;',
      '',
      '  Y asegúrate de que el backend usa la LICENSE_PRIVATE_KEY de producción.',
      '',
    ].join('\n')
  );
  process.exit(1);
}

console.error(
  '✖ La clave pública activa no coincide ni con la de producción ni con la de desarrollo.'
);
process.exit(1);
