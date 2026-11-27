import crypto from 'node:crypto';

const PREFIJO_SIMPLE = 'sha256';
const PREFIJO_ITERADO = 'sha256it';
const SEPARADOR = '$';
const MAX_RONDAS = 100_000;
const RONDAS_PIN = 1000;

function igualSeguro(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB);
}

function sha256(valor: string): string {
  return crypto.createHash('sha256').update(valor).digest('hex');
}

/**
 * Verifica un PIN contra el mismo formato que produce la app móvil:
 * `sha256$<salt>$<hash>` (heredado) o `sha256it$<rondas>$<salt>$<hash>`.
 * El PIN viaja por HTTPS y el servidor lo compara con el hash sincronizado;
 * el hash nunca se devuelve al cliente.
 */
export function verificarPinServidor(pin: string, almacenado: string | null): boolean {
  if (!almacenado) return false;

  const partes = almacenado.split(SEPARADOR);
  if (partes[0] === PREFIJO_SIMPLE && partes.length === 3) {
    return igualSeguro(sha256(`${partes[1]}:${pin}`), partes[2]);
  }

  if (partes[0] === PREFIJO_ITERADO && partes.length === 4) {
    const rondas = Number.parseInt(partes[1], 10);
    if (!Number.isInteger(rondas) || rondas < 1 || rondas > MAX_RONDAS) return false;

    const salt = partes[2];
    let hash = sha256(`${salt}:${pin}`);
    for (let i = 0; i < rondas; i += 1) {
      hash = sha256(`${salt}${hash}`);
    }
    return igualSeguro(hash, partes[3]);
  }

  return false;
}

/**
 * Genera el mismo formato que produce la app móvil. Se usa cuando el panel
 * crea cuentas con un PIN inicial; el usuario lo cambia desde la app.
 */
export function crearHashPin(pin: string): string {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('PIN_INVALIDO');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  let hash = sha256(`${salt}:${pin}`);
  for (let i = 0; i < RONDAS_PIN; i += 1) {
    hash = sha256(`${salt}${hash}`);
  }
  return `${PREFIJO_ITERADO}${SEPARADOR}${RONDAS_PIN}${SEPARADOR}${salt}${SEPARADOR}${hash}`;
}

/**
 * Hash de relleno para que un usuario inexistente tarde lo mismo que uno
 * real y no se pueda enumerar por tiempo de respuesta.
 */
export const PIN_HASH_FICTICIO =
  'sha256it$1000$00000000000000000000000000000000$' + '0'.repeat(64);
