import { randomUUID as uuidV4 } from 'node:crypto';

/**
 * Sustituto de `expo-crypto` para Vitest. `contexto.ts` solo usa
 * `Crypto.randomUUID()`, que Node proporciona de forma nativa.
 */
export const randomUUID = uuidV4;
