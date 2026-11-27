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
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
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

    if (respuesta.status === 204) return undefined as T;
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

interface ListaCruda {
  total: number;
  page: number;
  limit: number;
}

export interface ListaBasica<T> extends ListaCruda {
  items: T[];
}

interface EmpresaListaRespuesta {
  empresas: Parameters<typeof mapaEmpresa>[0][];
}

interface EmpresaDetalleRespuesta {
  empresa: Parameters<typeof mapaEmpresaDetalle>[0]['empresa'];
  dispositivos: Parameters<typeof mapaEmpresaDetalle>[0]['dispositivos'];
  dispositivosTotal: number;
  dispositivosPagina: number;
  conteos: Parameters<typeof mapaEmpresaDetalle>[0]['conteos'];
}

interface LicenciaListaRespuesta {
  licencias: Parameters<typeof mapaLicencia>[0][];
  conteos: {
    activas: number;
    gracia: number;
    vencidas: number;
    pendientes: number;
  };
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

  async planes(parametros: ParametrosControl = {}): Promise<ListaBasica<Plan>> {
    const respuesta = await peticion<{
      planes: Parameters<typeof mapaPlan>[0][];
      total: number;
      page: number;
      limit: number;
    }>(conParametros('/api/admin/planes', parametros));
    return {
      items: respuesta.planes.map(mapaPlan),
      total: respuesta.total,
      page: respuesta.page,
      limit: respuesta.limit,
    };
  },

  async empresas(parametros: ParametrosControl = {}): Promise<ListaBasica<Empresa>> {
    const respuesta = await peticion<EmpresaListaRespuesta & ListaCruda>(
      conParametros('/api/admin/empresas', parametros)
    );
    return {
      items: respuesta.empresas.map(mapaEmpresa),
      total: respuesta.total,
      page: respuesta.page,
      limit: respuesta.limit,
    };
  },

  async empresa(id: string, parametros: ParametrosControl = {}): Promise<EmpresaDetalle> {
    return mapaEmpresaDetalle(
      await peticion<EmpresaDetalleRespuesta>(
        conParametros(`/api/admin/empresas/${id}`, parametros)
      )
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

  async licencias(
    parametros: ParametrosControl = {}
  ): Promise<ListaBasica<Licencia> & { conteos: LicenciaListaRespuesta['conteos'] }> {
    const respuesta = await peticion<LicenciaListaRespuesta & ListaCruda>(
      conParametros('/api/admin/licencias', parametros)
    );
    return {
      items: respuesta.licencias.map(mapaLicencia),
      total: respuesta.total,
      page: respuesta.page,
      limit: respuesta.limit,
      conteos: respuesta.conteos,
    };
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

  async eventos(id: string, parametros: ParametrosControl = {}): Promise<ListaBasica<Evento>> {
    const respuesta = await peticion<EventosRespuesta & ListaCruda>(
      conParametros(`/api/admin/licencias/${id}/eventos`, parametros)
    );
    return {
      items: respuesta.eventos.map(mapaEvento),
      total: respuesta.total,
      page: respuesta.page,
      limit: respuesta.limit,
    };
  },
};

export type FilaControl = Record<string, unknown>;

export interface ListaControl {
  items: FilaControl[];
  total: number;
  page: number;
  limit: number;
}

export interface ParametrosControl {
  empresaId?: string;
  q?: string;
  page?: number;
  limit?: number;
  [clave: string]: string | number | boolean | undefined;
}

function conParametros(ruta: string, parametros: ParametrosControl = {}): string {
  const consulta = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== '') consulta.set(clave, String(valor));
  }
  const texto = consulta.toString();
  return texto ? `${ruta}?${texto}` : ruta;
}

function listar(ruta: string, parametros: ParametrosControl): Promise<ListaControl> {
  return peticion<ListaControl>(conParametros(ruta, parametros));
}

/**
 * Operaciones del panel con control total. Las filas llegan crudas desde
 * la API (snake_case) y cada vista decide qué columnas mostrar; así un cambio
 * de esquema no obliga a duplicar mapeadores en esta capa.
 */
export const apiControl = {
  usuarios: (parametros: ParametrosControl) => listar('/api/admin/usuarios', parametros),
  crearUsuario: (datos: unknown) =>
    peticion<{ usuario: FilaControl; pinInicial: string }>('/api/admin/usuarios', {
      method: 'POST',
      body: datos,
    }),
  editarUsuario: (id: string, datos: unknown) =>
    peticion<{ usuario: FilaControl }>(`/api/admin/usuarios/${id}`, {
      method: 'PATCH',
      body: datos,
    }),
  resetPinUsuario: (id: string) =>
    peticion<{ id: string; pinInicial: string }>(`/api/admin/usuarios/${id}/reset-pin`, {
      method: 'POST',
    }),
  eliminarUsuario: (id: string) =>
    peticion<void>(`/api/admin/usuarios/${id}`, { method: 'DELETE' }),

  categorias: (parametros: ParametrosControl) =>
    listar('/api/admin/catalogo/categorias', parametros),
  crearCategoria: (datos: unknown) =>
    peticion<{ categoria: FilaControl }>('/api/admin/catalogo/categorias', {
      method: 'POST',
      body: datos,
    }),
  editarCategoria: (id: string, datos: unknown) =>
    peticion<{ categoria: FilaControl }>(`/api/admin/catalogo/categorias/${id}`, {
      method: 'PATCH',
      body: datos,
    }),
  eliminarCategoria: (id: string) =>
    peticion<void>(`/api/admin/catalogo/categorias/${id}`, { method: 'DELETE' }),

  productos: (parametros: ParametrosControl) =>
    listar('/api/admin/catalogo/productos', parametros),
  crearProducto: (datos: unknown) =>
    peticion<{ producto: FilaControl }>('/api/admin/catalogo/productos', {
      method: 'POST',
      body: datos,
    }),
  editarProducto: (id: string, datos: unknown) =>
    peticion<{ producto: FilaControl }>(`/api/admin/catalogo/productos/${id}`, {
      method: 'PATCH',
      body: datos,
    }),
  eliminarProducto: (id: string) =>
    peticion<void>(`/api/admin/catalogo/productos/${id}`, { method: 'DELETE' }),
  ajustarStock: (id: string, cantidad: number, motivo: string) =>
    peticion<{ id: string; stockActual: number; version: number }>(
      `/api/admin/catalogo/productos/${id}/ajustar-stock`,
      { method: 'POST', body: { cantidad, motivo } }
    ),

  ventas: (parametros: ParametrosControl) => listar('/api/admin/operacion/ventas', parametros),
  anularVenta: (id: string, datos: unknown) =>
    peticion<{ ventaId: string; anulada: boolean }>(
      `/api/admin/operacion/ventas/${id}/anular`,
      { method: 'POST', body: datos }
    ),
  turnos: (parametros: ParametrosControl) => listar('/api/admin/operacion/turnos', parametros),
  gastos: (parametros: ParametrosControl) => listar('/api/admin/operacion/gastos', parametros),
  movimientosCaja: (parametros: ParametrosControl) =>
    listar('/api/admin/operacion/movimientos-caja', parametros),
  conteos: (parametros: ParametrosControl) => listar('/api/admin/operacion/conteos', parametros),

  dispositivos: (parametros: ParametrosControl) =>
    listar('/api/admin/plataforma/dispositivos', parametros),
  editarDispositivo: (id: string, datos: unknown) =>
    peticion<{ dispositivo: FilaControl }>(`/api/admin/plataforma/dispositivos/${id}`, {
      method: 'PATCH',
      body: datos,
    }),
  invitaciones: (parametros: ParametrosControl) =>
    listar('/api/admin/plataforma/invitaciones', parametros),
  auditoria: (parametros: ParametrosControl) =>
    listar('/api/admin/plataforma/auditoria', parametros),

  administradores: (parametros: ParametrosControl = {}) =>
    peticion<ListaControl>(conParametros('/api/admin/plataforma/administradores', parametros))
      .then((respuesta) => ({ ...respuesta, administradores: respuesta.items })),
  crearAdministrador: (datos: unknown) =>
    peticion<{ administrador: FilaControl }>('/api/admin/plataforma/administradores', {
      method: 'POST',
      body: datos,
    }),
  editarAdministrador: (id: string, datos: unknown) =>
    peticion<{ administrador: FilaControl }>(
      `/api/admin/plataforma/administradores/${id}`,
      { method: 'PATCH', body: datos }
    ),

  crearPlan: (datos: unknown) =>
    peticion<{ plan: FilaControl }>('/api/admin/planes', { method: 'POST', body: datos }),
  editarPlan: (id: string, datos: unknown) =>
    peticion<{ plan: FilaControl }>(`/api/admin/planes/${id}`, {
      method: 'PATCH',
      body: datos,
    }),
  eliminarEmpresa: (id: string) =>
    peticion<void>(`/api/admin/empresas/${id}`, { method: 'DELETE' }),
};
