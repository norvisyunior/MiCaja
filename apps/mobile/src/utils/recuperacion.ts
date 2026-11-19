import * as Crypto from 'expo-crypto';
import { crearHashIterado, verificarHashIterado } from './pin';

// Sin caracteres ambiguos (I, O, 0, 1): el código se dicta y se copia a mano.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TAMANO_GRUPO = 4;

export const LONGITUD_CODIGO_RECUPERACION = 12;

/** Quita espacios, guiones y mayúsculas para comparar el código. */
export function normalizarCodigoRecuperacion(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Presenta el código en grupos de 4 caracteres: XXXX-XXXX-XXXX. */
export function formatearCodigoRecuperacion(valor: string): string {
  const limpio = normalizarCodigoRecuperacion(valor).slice(
    0,
    LONGITUD_CODIGO_RECUPERACION
  );
  if (!limpio) return '';
  return limpio.match(new RegExp(`.{1,${TAMANO_GRUPO}}`, 'g'))!.join('-');
}

export function esCodigoRecuperacionValido(valor: string): boolean {
  const limpio = normalizarCodigoRecuperacion(valor);
  return (
    limpio.length === LONGITUD_CODIGO_RECUPERACION &&
    Array.from(limpio).every((caracter) => ALFABETO.includes(caracter))
  );
}

/**
 * Genera un código aleatorio de 12 caracteres (~60 bits). El alfabeto tiene
 * 32 símbolos y 256 es múltiplo exacto de 32, así que el módulo no sesga.
 */
export function generarCodigoRecuperacion(): string {
  const bytes = Crypto.getRandomBytes(LONGITUD_CODIGO_RECUPERACION);
  let codigo = '';
  for (let i = 0; i < LONGITUD_CODIGO_RECUPERACION; i += 1) {
    codigo += ALFABETO[bytes[i] % ALFABETO.length];
  }
  return formatearCodigoRecuperacion(codigo);
}

export async function crearHashCodigoRecuperacion(codigo: string): Promise<string> {
  return crearHashIterado(normalizarCodigoRecuperacion(codigo));
}

export async function verificarCodigoRecuperacion(
  codigo: string,
  almacenado: string
): Promise<boolean> {
  if (!esCodigoRecuperacionValido(codigo) || !almacenado) return false;
  return verificarHashIterado(normalizarCodigoRecuperacion(codigo), almacenado);
}
