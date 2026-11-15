export function formatearDinero(
  monto: number,
  simbolo: string = '$'
): string {
  const formateado = monto.toLocaleString('es-CU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${simbolo}${formateado}`;
}

export function formatoFechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CU', {
    day: '2-digit',
    month: 'short',
  });
}

export function formatoFechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function formatoHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatoFechaHora(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-CU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })} ${d.toLocaleTimeString('es-CU', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function inicioDiaISO(fecha = new Date()): string {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function finDiaISO(fecha = new Date()): string {
  const d = new Date(fecha);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function inicioSemanaISO(fecha = new Date()): string {
  const d = new Date(fecha);
  d.setDate(d.getDate() - 6);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function inicioMesISO(fecha = new Date()): string {
  const d = new Date(fecha);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function claveDiaLocal(fecha = new Date()): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
