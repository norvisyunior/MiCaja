import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Pruebas de la lógica pura de la app móvil (licencias, API, sync) en Node.
 * Los módulos nativos de React Native se sustituyen por los stubs de
 * `vitest/mocks/`; la SQLite real no participa en estas pruebas.
 */
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^react-native$/,
        replacement: path.resolve(import.meta.dirname, 'vitest/mocks/react-native.ts'),
      },
      {
        find: /^expo-crypto$/,
        replacement: path.resolve(import.meta.dirname, 'vitest/mocks/expo-crypto.ts'),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
