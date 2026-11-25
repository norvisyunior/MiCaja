import type { EmpresaEstado, Licencia, LicenciaEstado } from '../api/types';

const DIA_MS = 86_400_000;
const FECHA_SIMPLE = /^\d{4}-\d{2}-\d{2}$/;

function aFecha(valor: string | Date): Date {
  if (valor instanceof Date) return valor;
  if (FECHA_SIMPLE.test(valor)) {
    const [anio, mes, dia] = valor.split('-').map(Number);
    return new Date(anio, mes - 1, dia);
  }
  return new Date(valor);
}

export const ETIQUETAS_EMPRESA: Record<EmpresaEstado, string> = {
  pendiente: 'Pendiente',
  activa: 'Activa',
  suspendida: 'Suspendida',
  cancelada: 'Cancelada',
};

export const ETIQUETAS_LICENCIA: Record<LicenciaEstado, string> = {
  pendiente: 'Pendiente',
  activa: 'Activa',
  vencida: 'Vencida',
  suspendida: 'Suspendida',
};

export const ETIQUETAS_EVENTO: Record<string, string> = {
  creada: 'Licencia creada',
  activada: 'Licencia activada',
  renovada: 'Licencia renovada',
  suspendida: 'Licencia suspendida',
  reactivada: 'Licencia reactivada',
  vencida: 'Licencia vencida',
};

export const ETIQUETAS_FEATURE: Record<string, string> = {
  ventas: 'Ventas',
  inventario: 'Inventario',
  reportes: 'Reportes',
  backup: 'Respaldos',
  multiusuario: 'Multiusuario',
};

export const ETIQUETAS_ESTADO_DISPOSITIVO: Record<string, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  bloqueado: 'Bloqueado',
};

export function fecha(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const fechaValor = aFecha(valor);
  if (Number.isNaN(fechaValor.getTime())) return '—';
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
    .format(fechaValor)
    .replace(/\.$/, '');
}

export function fechaHora(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const fechaValor = aFecha(valor);
  if (Number.isNaN(fechaValor.getTime())) return '—';
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(fechaValor);
}

export function fechaHoraCorta(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const fechaValor = aFecha(valor);
  if (Number.isNaN(fechaValor.getTime())) return '—';
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(fechaValor);
}

function dosDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}

export function fechaInput(valor: string | Date | null | undefined): string {
  if (!valor) return '';
  const fechaValor = aFecha(valor);
  if (Number.isNaN(fechaValor.getTime())) return '';
  return `${fechaValor.getFullYear()}-${dosDigitos(fechaValor.getMonth() + 1)}-${dosDigitos(
    fechaValor.getDate()
  )}`;
}

export function fechaHoraInput(valor: string | Date | null | undefined): string {
  if (!valor) return '';
  const fechaValor = aFecha(valor);
  if (Number.isNaN(fechaValor.getTime())) return '';
  return `${fechaInput(fechaValor)}T${dosDigitos(fechaValor.getHours())}:${dosDigitos(
    fechaValor.getMinutes()
  )}`;
}

export function isoDesdeFecha(valor: string): string | null {
  if (!valor) return null;
  const fechaValor = new Date(`${valor}T23:59:59`);
  return Number.isNaN(fechaValor.getTime()) ? null : fechaValor.toISOString();
}

export function isoDesdeFechaHora(valor: string): string | null {
  if (!valor) return null;
  const fechaValor = new Date(valor);
  return Number.isNaN(fechaValor.getTime()) ? null : fechaValor.toISOString();
}

export function fechaEnDias(dias: number, base = Date.now()): string {
  return fechaInput(new Date(base + dias * DIA_MS));
}

export type Duracion = 1 | 3 | 6 | 12 | 'personalizado';

export function sumarMeses(fechaValor: Date, meses: number): Date {
  const resultado = new Date(fechaValor.getTime());
  const dia = resultado.getDate();
  resultado.setDate(1);
  resultado.setMonth(resultado.getMonth() + meses);
  const ultimoDia = new Date(resultado.getFullYear(), resultado.getMonth() + 1, 0).getDate();
  resultado.setDate(Math.min(dia, ultimoDia));
  return resultado;
}

export function fechaConMeses(meses: number, base = new Date()): string {
  return fechaInput(sumarMeses(base, meses));
}

export function detectarDuracion(venceEn: string | Date, base = new Date()): Duracion {
  const vence = fechaInput(venceEn);
  for (const meses of [1, 3, 6, 12] as const) {
    if (fechaConMeses(meses, base) === vence) return meses;
  }
  return 'personalizado';
}

export function resolverVencimiento(
  duracion: Duracion,
  fechaPersonalizada: string,
  base = new Date()
): string {
  return duracion === 'personalizado' ? fechaPersonalizada : fechaConMeses(duracion, base);
}

export function sumarDiasIso(desde: string, dias: number): string {
  return new Date(new Date(desde).getTime() + dias * DIA_MS).toISOString();
}

export function diasHasta(valor: string | null | undefined, ahora = Date.now()): number | null {
  if (!valor) return null;
  const objetivo = new Date(valor).getTime();
  if (Number.isNaN(objetivo)) return null;
  return Math.ceil((objetivo - ahora) / DIA_MS);
}

export function finGracia(licencia: Pick<Licencia, 'venceEn' | 'graceDias'>): string {
  return sumarDiasIso(licencia.venceEn, licencia.graceDias);
}

export interface EstadoLicenciaEfectivo {
  estado: LicenciaEstado;
  enGracia: boolean;
  diasHastaVencer: number | null;
  diasHastaFinGracia: number | null;
}

export function estadoLicenciaEfectivo(
  licencia: Pick<Licencia, 'estado' | 'venceEn' | 'graceDias'>,
  ahora = Date.now()
): EstadoLicenciaEfectivo {
  const vence = new Date(licencia.venceEn).getTime();
  const fin = vence + licencia.graceDias * DIA_MS;
  const diasHastaVencer = Number.isNaN(vence) ? null : Math.ceil((vence - ahora) / DIA_MS);
  const diasHastaFinGracia = Number.isNaN(fin) ? null : Math.ceil((fin - ahora) / DIA_MS);

  if (licencia.estado === 'suspendida' || licencia.estado === 'vencida') {
    return {
      estado: licencia.estado,
      enGracia: false,
      diasHastaVencer,
      diasHastaFinGracia,
    };
  }

  if (!Number.isNaN(fin) && ahora > fin) {
    return { estado: 'vencida', enGracia: false, diasHastaVencer, diasHastaFinGracia };
  }

  if (licencia.estado === 'pendiente') {
    return { estado: 'pendiente', enGracia: false, diasHastaVencer, diasHastaFinGracia };
  }

  return {
    estado: 'activa',
    enGracia: !Number.isNaN(vence) && ahora > vence,
    diasHastaVencer,
    diasHastaFinGracia,
  };
}

export function etiquetaVencimiento(
  licencia: Pick<Licencia, 'estado' | 'venceEn' | 'graceDias'>,
  ahora = Date.now()
): string {
  const efectivo = estadoLicenciaEfectivo(licencia, ahora);

  if (efectivo.estado === 'suspendida') return 'Sincronización detenida';
  if (efectivo.estado === 'vencida') {
    const dias = efectivo.diasHastaFinGracia;
    if (dias !== null && dias < 0) {
      const pasado = Math.abs(dias);
      return pasado === 1 ? 'Venció hace 1 día' : `Venció hace ${pasado} días`;
    }
    return 'Vencida';
  }
  if (efectivo.estado === 'pendiente') return `Sin activar · ${fecha(licencia.venceEn)}`;
  if (efectivo.enGracia) {
    const dias = efectivo.diasHastaFinGracia ?? 0;
    return dias <= 0
      ? 'Gracia agotada'
      : dias === 1
        ? 'En gracia · queda 1 día'
        : `En gracia · quedan ${dias} días`;
  }
  const dias = efectivo.diasHastaVencer ?? 0;
  if (dias <= 0) return 'Vence hoy';
  return dias === 1 ? 'Vence en 1 día' : `Vence en ${dias} días`;
}

export function plural(cantidad: number, singular: string, plurales: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plurales}`;
}
