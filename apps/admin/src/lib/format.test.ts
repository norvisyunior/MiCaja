import { describe, expect, it } from 'vitest';
import {
  detectarDuracion,
  estadoLicenciaEfectivo,
  etiquetaVencimiento,
  fechaConMeses,
  fechaInput,
  finGracia,
  isoDesdeFecha,
  plural,
  resolverVencimiento,
  sumarMeses,
} from './format';

const AHORA = Date.parse('2026-06-15T12:00:00.000Z');
const DIA = 86_400_000;

function licencia(estado: 'activa' | 'pendiente' | 'vencida' | 'suspendida', dias: number) {
  return {
    estado,
    venceEn: new Date(AHORA + dias * DIA).toISOString(),
    graceDias: 7,
  };
}

describe('estadoLicenciaEfectivo', () => {
  it('mantiene activa una licencia con vencimiento futuro', () => {
    const resultado = estadoLicenciaEfectivo(licencia('activa', 30), AHORA);
    expect(resultado.estado).toBe('activa');
    expect(resultado.enGracia).toBe(false);
    expect(resultado.diasHastaVencer).toBe(30);
  });

  it('marca la gracia después del vencimiento y antes de fin de gracia', () => {
    const resultado = estadoLicenciaEfectivo(licencia('activa', -3), AHORA);
    expect(resultado.estado).toBe('activa');
    expect(resultado.enGracia).toBe(true);
    expect(resultado.diasHastaFinGracia).toBe(4);
  });

  it('vence cuando se agota la gracia', () => {
    const resultado = estadoLicenciaEfectivo(licencia('activa', -10), AHORA);
    expect(resultado.estado).toBe('vencida');
    expect(resultado.enGracia).toBe(false);
  });

  it('respeta la suspensión almacenada aunque la fecha sea futura', () => {
    const resultado = estadoLicenciaEfectivo(licencia('suspendida', 30), AHORA);
    expect(resultado.estado).toBe('suspendida');
  });

  it('mantiene pendiente una licencia sin activar', () => {
    const resultado = estadoLicenciaEfectivo(licencia('pendiente', 30), AHORA);
    expect(resultado.estado).toBe('pendiente');
  });
});

describe('etiquetaVencimiento', () => {
  it('describe los días restantes de gracia', () => {
    expect(etiquetaVencimiento(licencia('activa', -3), AHORA)).toBe(
      'En gracia · quedan 4 días'
    );
  });

  it('indica la sincronización detenida al estar suspendida', () => {
    expect(etiquetaVencimiento(licencia('suspendida', 30), AHORA)).toBe(
      'Sincronización detenida'
    );
  });
});

describe('duraciones', () => {
  it('suma meses ajustando el fin de mes', () => {
    expect(fechaConMeses(1, new Date(2026, 0, 31))).toBe('2026-02-28');
    expect(fechaConMeses(1, new Date(2024, 0, 31))).toBe('2024-02-29');
    expect(fechaConMeses(3, new Date(2026, 0, 31))).toBe('2026-04-30');
  });

  it('calcula una fecha por defecto de un mes', () => {
    expect(fechaConMeses(1, new Date(2026, 5, 15))).toBe('2026-07-15');
  });

  it('detecta presets de duración y deja el resto como personalizado', () => {
    const base = new Date(2026, 5, 15);
    expect(detectarDuracion(fechaConMeses(3, base), base)).toBe(3);
    expect(detectarDuracion('2027-12-31', base)).toBe('personalizado');
  });

  it('resuelve la fecha según la duración elegida', () => {
    const base = new Date(2026, 5, 15);
    expect(resolverVencimiento(1, '2027-01-01', base)).toBe('2026-07-15');
    expect(resolverVencimiento('personalizado', '2027-01-01', base)).toBe('2027-01-01');
  });

  it('suma meses conservando el día', () => {
    expect(fechaInput(sumarMeses(new Date(2026, 5, 15), 6))).toBe('2026-12-15');
  });
});

describe('utilidades', () => {
  it('suma los días de gracia al vencimiento', () => {
    const base = licencia('activa', 10);
    expect(new Date(finGracia(base)).getTime() - new Date(base.venceEn).getTime()).toBe(
      7 * DIA
    );
  });

  it('convierte una fecha de input al final del día', () => {
    const iso = isoDesdeFecha('2026-06-30');
    expect(iso).not.toBeNull();
    expect(new Date(iso as string).getDate()).toBe(30);
  });

  it('devuelve null para fechas vacías', () => {
    expect(isoDesdeFecha('')).toBeNull();
  });

  it('pluraliza según la cantidad', () => {
    expect(plural(1, 'licencia', 'licencias')).toBe('1 licencia');
    expect(plural(2, 'licencia', 'licencias')).toBe('2 licencias');
  });
});
