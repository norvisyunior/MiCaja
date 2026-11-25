import {
  mapaEmpresa,
  mapaEmpresaDetalle,
  mapaEvento,
  mapaLicencia,
  mapaPlan,
  mapaResumen,
  type ActualizarLicenciaInput,
  type ActivarLicenciaInput,
  type Admin,
  type CodigoResultado,
  type CrearEmpresaInput,
  type CrearEmpresaResultado,
  type Empresa,
  type EmpresaDetalle,
  type EmpresaEstado,
  type Evento,
  type Licencia,
  type LoginResultado,
  type Plan,
  type Resumen,
} from './types';

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
const CLAVE_TOKEN = 'micaja.admin.token';
const CLAVE_ADMIN = 'micaja.admin.sesion';

export const EVENTO_SESION_EXPIRADA = 'micaja:sesion-expirada';

export class ErrorApi extends Error {
  constructor(
    public readonly codigo: string,
    mensaje: string,
    public readonly estado: number,
    public readonly detalles?: unknown
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

export function guardarSesion(token: string, admin: Admin): void {
  localStorage.setItem(CLAVE_TOKEN, token);
  localStorage.setItem(CLAVE_ADMIN, JSON.stringify(admin));
}

export function limpiarSesion(): void {
  localStorage.removeItem(CLAVE_TOKEN);
  localStorage.removeItem(CLAVE_ADMIN);
}

export function leerSesionGuardada(): { token: string; admin: Admin } | null {
  const token = localStorage.getItem(CLAVE_TOKEN);
  const adminJson = localStorage.getItem(CLAVE_ADMIN);
  if (!token || !adminJson) return null;
  try {
    return { token, admin: JSON.parse(adminJson) as Admin };
  } catch {
    limpiarSesion();
    return null;
  }
}

function tokenGuardado(): string | null {
  return localStorage.getItem(CLAVE_TOKEN);
}

interface OpcionesPeticion {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  autenticada?: boolean;
}

async function peticion<T>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
  const autenticada = opciones.autenticada ?? true;
  const token = tokenGuardado();
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 15_000);

  try {
    const respuesta = await fetch(`${API_URL}${ruta}`, {
      method: opciones.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(opciones.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(autenticada && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
      signal: controlador.signal,
    });

    if (!respuesta.ok) {
      const datos = (await respuesta.json().catch(() => null)) as
        | { error?: string; message?: string; details?: unknown }
        | null;
      if (respuesta.status === 401 && autenticada) {
        limpiarSesion();
        window.dispatchEvent(new Event(EVENTO_SESION_EXPIRADA));
      }
      throw new ErrorApi(
        datos?.error ?? 'ERROR_API',
        datos?.message ?? `La API respondió ${respuesta.status}`,
        respuesta.status,
        datos?.details
      );
    }

    return (await respuesta.json()) as T;
  } catch (error) {
    if (error instanceof ErrorApi) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ErrorApi(
        'TIEMPO_AGOTADO',
        'El servidor tardó demasiado en responder. Inténtalo otra vez.',
        0
      );
    }
    throw new ErrorApi(
      'SIN_CONEXION',
      `No se pudo conectar con ${API_URL}. Revisa que el backend esté en marcha.`,
      0
    );
  } finally {
    clearTimeout(temporizador);
  }
}

interface EmpresaListaRespuesta {
  empresas: Parameters<typeof mapaEmpresa>[0][];
}

interface EmpresaDetalleRespuesta {
  empresa: Parameters<typeof mapaEmpresaDetalle>[0]['empresa'];
  dispositivos: Parameters<typeof mapaEmpresaDetalle>[0]['dispositivos'];
  conteos: Parameters<typeof mapaEmpresaDetalle>[0]['conteos'];
}

interface LicenciaListaRespuesta {
  licencias: Parameters<typeof mapaLicencia>[0][];
}

interface LicenciaRespuesta {
  licencia: Parameters<typeof mapaLicencia>[0];
}

interface EventosRespuesta {
  eventos: Parameters<typeof mapaEvento>[0][];
}

export const api = {
  async login(email: string, password: string): Promise<Admin> {
    const respuesta = await peticion<LoginResultado>('/api/admin/auth/login', {
      method: 'POST',
      body: { email, password },
      autenticada: false,
    });
    guardarSesion(respuesta.token, respuesta.admin);
    return respuesta.admin;
  },

  async resumen(): Promise<Resumen> {
    return mapaResumen(await peticion<Parameters<typeof mapaResumen>[0]>('/api/admin/resumen'));
  },

  async planes(): Promise<Plan[]> {
    const respuesta = await peticion<{ planes: Parameters<typeof mapaPlan>[0][] }>(
      '/api/admin/planes'
    );
    return respuesta.planes.map(mapaPlan);
  },

  async empresas(): Promise<Empresa[]> {
    const respuesta = await peticion<EmpresaListaRespuesta>('/api/admin/empresas');
    return respuesta.empresas.map(mapaEmpresa);
  },

  async empresa(id: string): Promise<EmpresaDetalle> {
    return mapaEmpresaDetalle(
      await peticion<EmpresaDetalleRespuesta>(`/api/admin/empresas/${id}`)
    );
  },

  async crearEmpresa(input: CrearEmpresaInput): Promise<CrearEmpresaResultado> {
    return peticion<CrearEmpresaResultado>('/api/admin/empresas', {
      method: 'POST',
      body: input,
    });
  },

  async actualizarEmpresa(
    id: string,
    input: Partial<Pick<Empresa, 'nombre' | 'propietario' | 'email' | 'telefono'>>
  ): Promise<void> {
    await peticion(`/api/admin/empresas/${id}/datos`, { method: 'PATCH', body: input });
  },

  async cambiarEstadoEmpresa(id: string, estado: EmpresaEstado): Promise<void> {
    await peticion(`/api/admin/empresas/${id}/estado`, {
      method: 'PATCH',
      body: { estado },
    });
  },

  async licencias(): Promise<Licencia[]> {
    const respuesta = await peticion<LicenciaListaRespuesta>('/api/admin/licencias');
    return respuesta.licencias.map(mapaLicencia);
  },

  async licencia(id: string): Promise<Licencia> {
    const respuesta = await peticion<LicenciaRespuesta>(`/api/admin/licencias/${id}`);
    return mapaLicencia(respuesta.licencia);
  },

  async actualizarLicencia(
    id: string,
    input: ActualizarLicenciaInput
  ): Promise<Licencia> {
    const respuesta = await peticion<LicenciaRespuesta>(`/api/admin/licencias/${id}`, {
      method: 'PATCH',
      body: input,
    });
    return mapaLicencia(respuesta.licencia);
  },

  async generarCodigo(id: string): Promise<CodigoResultado> {
    return peticion<CodigoResultado>(`/api/admin/licencias/${id}/codigo`, {
      method: 'POST',
    });
  },

  async renovar(id: string, venceEn: string, graceDias: number): Promise<CodigoResultado> {
    return peticion<CodigoResultado>(`/api/admin/licencias/${id}/renovar`, {
      method: 'POST',
      body: { venceEn, graceDias },
    });
  },

  async activarLicencia(id: string, input: ActivarLicenciaInput): Promise<Licencia> {
    const respuesta = await peticion<LicenciaRespuesta>(
      `/api/admin/licencias/${id}/activar`,
      { method: 'POST', body: input }
    );
    return mapaLicencia(respuesta.licencia);
  },

  async eventos(id: string): Promise<Evento[]> {
    const respuesta = await peticion<EventosRespuesta>(
      `/api/admin/licencias/${id}/eventos`
    );
    return respuesta.eventos.map(mapaEvento);
  },
};
