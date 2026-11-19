import { createHash, randomBytes, randomUUID as uuidV4 } from 'node:crypto';

/**
 * Sustituto de `expo-crypto` para Vitest. Implementa lo que usa la app:
 * UUID, bytes aleatorios y SHA-256 en hexadecimal.
 */
export const randomUUID = uuidV4;

export function getRandomBytes(byteCount: number): Uint8Array {
  return new Uint8Array(randomBytes(byteCount));
}

export const CryptoDigestAlgorithm = {
  SHA256: 'SHA-256',
} as const;

export const CryptoEncoding = {
  HEX: 'hex',
} as const;

export async function digestStringAsync(
  _algorithm: string,
  data: string,
  _options?: { encoding?: string }
): Promise<string> {
  return createHash('sha256').update(data).digest('hex');
}
