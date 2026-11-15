import * as Crypto from 'expo-crypto';

// Formato almacenado: sha256$<salt hex>$<hash hex>
const PREFIJO = 'sha256';
const SEPARADOR = '$';

function bytesAHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function calcularHash(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${pin}`,
    { encoding: Crypto.CryptoEncoding.HEX }
  );
}

export function esPinHasheado(valor: string): boolean {
  return valor.startsWith(`${PREFIJO}${SEPARADOR}`);
}

/** Genera un PIN protegido con SHA-256 y una sal aleatoria de 16 bytes. */
export async function crearPinHash(pin: string): Promise<string> {
  const salt = bytesAHex(Crypto.getRandomBytes(16));
  const hash = await calcularHash(pin, salt);
  return `${PREFIJO}${SEPARADOR}${salt}${SEPARADOR}${hash}`;
}

/**
 * Verifica un PIN contra el valor almacenado.
 * Acepta valores antiguos en texto plano para poder migrarlos sin perder acceso.
 */
export async function verificarPin(pin: string, almacenado: string): Promise<boolean> {
  if (!esPinHasheado(almacenado)) {
    return almacenado.length > 0 && pin === almacenado;
  }

  const partes = almacenado.split(SEPARADOR);
  if (partes.length !== 3 || partes[0] !== PREFIJO) return false;

  const [, salt, hashGuardado] = partes;
  const hashCalculado = await calcularHash(pin, salt);
  return hashCalculado === hashGuardado;
}

export function esPinValido(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
