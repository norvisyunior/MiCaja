import type { Dispositivo, EmpresaEstado, Licencia } from '../api/types';
import {
  ETIQUETAS_EMPRESA,
  ETIQUETAS_ESTADO_DISPOSITIVO,
  ETIQUETAS_LICENCIA,
  estadoLicenciaEfectivo,
  etiquetaVencimiento,
} from '../lib/format';
import { Insignia } from './UI';

type Tono = 'ok' | 'warn' | 'danger' | 'neutral' | 'info';

const TONOS_EMPRESA: Record<EmpresaEstado, Tono> = {
  pendiente: 'warn',
  activa: 'ok',
  suspendida: 'danger',
  cancelada: 'neutral',
};

export function InsigniaEmpresa({ estado }: { estado: EmpresaEstado }) {
  return <Insignia tono={TONOS_EMPRESA[estado]}>{ETIQUETAS_EMPRESA[estado]}</Insignia>;
}

type LicenciaEstadoDatos = Pick<Licencia, 'estado' | 'venceEn' | 'graceDias'>;

export function InsigniaLicencia({ licencia }: { licencia: LicenciaEstadoDatos }) {
  const efectivo = estadoLicenciaEfectivo(licencia);
  if (efectivo.enGracia) {
    return <Insignia tono="warn">En gracia</Insignia>;
  }
  const tonos: Record<string, Tono> = {
    pendiente: 'warn',
    activa: 'ok',
    vencida: 'danger',
    suspendida: 'danger',
  };
  return (
    <Insignia tono={tonos[efectivo.estado] ?? 'neutral'}>
      {ETIQUETAS_LICENCIA[efectivo.estado]}
    </Insignia>
  );
}

export function InsigniaDispositivo({ dispositivo }: { dispositivo: Dispositivo }) {
  const tonos: Record<string, Tono> = {
    activo: 'ok',
    inactivo: 'neutral',
    bloqueado: 'danger',
  };
  return (
    <Insignia tono={tonos[dispositivo.estado] ?? 'neutral'} punto={false}>
      {ETIQUETAS_ESTADO_DISPOSITIVO[dispositivo.estado] ?? dispositivo.estado}
    </Insignia>
  );
}

export function MarcaVencimiento({ licencia }: { licencia: LicenciaEstadoDatos }) {
  const efectivo = estadoLicenciaEfectivo(licencia);
  const tono = efectivo.enGracia
    ? 'gracia'
    : efectivo.estado === 'vencida'
      ? 'vencida'
      : efectivo.estado === 'activa'
        ? 'activa'
        : 'neutra';
  return <span className={`vencimiento vencimiento--${tono}`}>{etiquetaVencimiento(licencia)}</span>;
}
