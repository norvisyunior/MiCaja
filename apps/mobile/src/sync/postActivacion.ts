export type DestinoPostActivacion = 'login' | 'trabajador';

/**
 * Tras activar con el código del negocio, la cuenta ya existe en el servidor:
 * hay que entrar con usuario + PIN para descargar los datos. Solo una
 * invitación crea la cuenta local del trabajador en este dispositivo.
 */
export function destinoPostActivacion(
  via: string | null,
  hayUsuariosLocales: boolean
): DestinoPostActivacion {
  return via === 'invitacion' && !hayUsuariosLocales ? 'trabajador' : 'login';
}
