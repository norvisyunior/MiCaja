import { ErrorApi } from '../api/client';

const MENSAJES: Record<string, string> = {
  CREDENCIALES_INVALIDAS: 'El correo o la contraseña no son correctos.',
  TOKEN_REQUERIDO: 'La sesión expiró. Vuelve a entrar.',
  TOKEN_INVALIDO: 'La sesión expiró. Vuelve a entrar.',
  EMPRESA_NO_ENCONTRADA: 'No se encontró esa empresa.',
  LICENCIA_NO_ENCONTRADA: 'No se encontró esa licencia.',
  PLAN_INVALIDO: 'Ese plan no existe o está desactivado.',
  EMPRESA_INACTIVA: 'El negocio está suspendido o cancelado. Reactívalo antes de continuar.',
  VENCIMIENTO_INVALIDO: 'La fecha de vencimiento debe estar en el futuro.',
  DATOS_INVALIDOS: 'Hay datos inválidos. Revisa el formulario.',
  JSON_INVALIDO: 'La solicitud no tiene un formato válido.',
  SIN_CONEXION: 'No se pudo conectar con el backend. Revisa la URL y que esté en marcha.',
  TIEMPO_AGOTADO: 'El servidor tardó demasiado en responder. Inténtalo otra vez.',
  ERROR_INTERNO: 'El servidor tuvo un error. Inténtalo de nuevo en unos segundos.',
  NO_ENCONTRADO: 'La ruta solicitada no existe en la API.',
};

export function mensajeError(error: unknown): string {
  if (error instanceof ErrorApi) {
    return MENSAJES[error.codigo] ?? error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Ocurrió un error inesperado.';
}

export function detallesError(error: unknown): string[] {
  if (!(error instanceof ErrorApi)) return [];
  if (!Array.isArray(error.detalles)) return [];
  return error.detalles
    .map((detalle) => {
      if (typeof detalle !== 'object' || detalle === null) return null;
      const fila = detalle as { path?: string; message?: string };
      if (!fila.message) return null;
      return fila.path ? `${fila.path}: ${fila.message}` : fila.message;
    })
    .filter((linea): linea is string => Boolean(linea));
}
