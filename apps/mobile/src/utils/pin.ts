import * as Crypto from 'expo-crypto';

// Formatos almacenados:
//   sha256$<salt hex>$<hash hex>             (una pasada, heredado)
//   sha256it$<rounds>$<salt hex>$<hash hex>  (iterado)
const PREFIJO_SIMPLE = 'sha256';
const PREFIJO_ITERADO = 'sha256it';
const SEPARADOR = '$';

/** Rondas de estiramiento para los PIN nuevos (y para los migrados al entrar). */
export const RONDAS_PIN = 1000;
const MAX_RONDAS = 100_000;

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

async function estirarHash(hash: string, salt: string, rondas: number): Promise<string> {
  let actual = hash;
  for (let i = 0; i < rondas; i += 1) {
    actual = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${salt}${actual}`,
      { encoding: Crypto.CryptoEncoding.HEX }
    );
  }
  return actual;
}

export function esPinHasheado(valor: string): boolean {
  return (
    valor.startsWith(`${PREFIJO_SIMPLE}${SEPARADOR}`) ||
    valor.startsWith(`${PREFIJO_ITERADO}${SEPARADOR}`)
  );
}

/** ¿El hash almacenado ya usa el formato iterado actual? */
export function esPinIterado(valor: string): boolean {
  return valor.startsWith(`${PREFIJO_ITERADO}${SEPARADOR}`);
}

/** Genera un PIN protegido con SHA-256 encadenado y una sal aleatoria de 16 bytes. */
export async function crearPinHash(pin: string): Promise<string> {
  const salt = bytesAHex(Crypto.getRandomBytes(16));
  const inicial = await calcularHash(pin, salt);
  const hash = await estirarHash(inicial, salt, RONDAS_PIN);
  return `${PREFIJO_ITERADO}${SEPARADOR}${RONDAS_PIN}${SEPARADOR}${salt}${SEPARADOR}${hash}`;
}

/**
 * Verifica un PIN contra el valor almacenado.
 * Acepta los dos formatos hasheados y valores antiguos en texto plano para
 * poder migrarlos sin perder acceso.
 */
export async function verificarPin(pin: string, almacenado: string): Promise<boolean> {
  if (!esPinHasheado(almacenado)) {
    return almacenado.length > 0 && pin === almacenado;
  }

  const partes = almacenado.split(SEPARADOR);

  if (partes[0] === PREFIJO_SIMPLE && partes.length === 3) {
    const hashCalculado = await calcularHash(pin, partes[1]);
    return hashCalculado === partes[2];
  }

  if (partes[0] === PREFIJO_ITERADO && partes.length === 4) {
    const rondas = Number.parseInt(partes[1], 10);
    if (!Number.isFinite(rondas) || rondas < 1 || rondas > MAX_RONDAS) return false;
    const salt = partes[2];
    const inicial = await calcularHash(pin, salt);
    const hashCalculado = await estirarHash(inicial, salt, rondas);
    return hashCalculado === partes[3];
  }

  return false;
}

export function esPinValido(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/**
 * Alias genéricos: el mismo hash iterado se usa para el PIN y para el código
 * de recuperación de la cuenta.
 */
export const crearHashIterado = crearPinHash;
export const verificarHashIterado = verificarPin;
