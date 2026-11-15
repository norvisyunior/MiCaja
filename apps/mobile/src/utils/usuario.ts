/**
 * Normaliza el nombre de usuario que se escribe en el login.
 * Se guarda siempre en minúsculas para que el acceso no dependa del teclado.
 */
export function normalizarUsuario(valor: string): string {
  return valor.trim().toLowerCase();
}

/**
 * Convierte un nombre visible ("María José") en un usuario técnico válido
 * ("mariajose"). Se usa para migrar cuentas antiguas y para autocompletar.
 */
export function generarUsuarioDesdeNombre(nombre: string): string {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '')
    .slice(0, 20);

  return limpio || 'usuario';
}

export function esUsuarioValido(usuario: string): boolean {
  return /^[a-z0-9._-]{3,20}$/.test(normalizarUsuario(usuario));
}
