export interface ProgramadorSync {
  solicitar: (esperaMs?: number) => void;
  ejecutar: () => Promise<void>;
  detener: () => void;
}

export interface OpcionesProgramadorSync {
  sincronizar: () => Promise<void>;
  ahora?: () => number;
  programar?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancelar?: (id: ReturnType<typeof setTimeout>) => void;
  intervaloMinimoMs?: number;
}

export function crearProgramadorSync({
  sincronizar,
  ahora = Date.now,
  programar = (callback, ms) => setTimeout(callback, ms),
  cancelar = (id) => clearTimeout(id),
  intervaloMinimoMs = 10_000,
}: OpcionesProgramadorSync): ProgramadorSync {
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let ultimoIntento = Number.NEGATIVE_INFINITY;
  let ejecutando = false;
  let pendiente = false;
  let detenido = false;

  function solicitar(esperaMs = 0): void {
    if (detenido || temporizador !== null) return;

    const desdeUltimo = ahora() - ultimoIntento;
    const retraso = Math.max(esperaMs, intervaloMinimoMs - desdeUltimo);

    temporizador = programar(() => {
      temporizador = null;
      void ejecutar().catch(() => undefined);
    }, Math.max(0, retraso));
  }

  async function ejecutar(): Promise<void> {
    if (detenido) return;
    if (ejecutando) {
      pendiente = true;
      return;
    }

    ejecutando = true;
    ultimoIntento = ahora();

    try {
      await sincronizar();
    } finally {
      ejecutando = false;
      if (pendiente && !detenido) {
        pendiente = false;
        solicitar();
      }
    }
  }

  function detener(): void {
    detenido = true;
    pendiente = false;
    if (temporizador !== null) {
      cancelar(temporizador);
      temporizador = null;
    }
  }

  return { solicitar, ejecutar, detener };
}
