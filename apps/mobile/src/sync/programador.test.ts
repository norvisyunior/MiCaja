import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearProgramadorSync } from './programador';

describe('crearProgramadorSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('agrupa varias solicitudes en una sola sincronización', async () => {
    const sincronizar = vi.fn(async () => undefined);
    const programador = crearProgramadorSync({ sincronizar });

    programador.solicitar();
    programador.solicitar();
    programador.solicitar();

    expect(sincronizar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(sincronizar).toHaveBeenCalledTimes(1);

    programador.detener();
  });

  it('respeta el intervalo mínimo entre intentos', async () => {
    const sincronizar = vi.fn(async () => undefined);
    const programador = crearProgramadorSync({ sincronizar, intervaloMinimoMs: 10_000 });

    programador.solicitar();
    await vi.advanceTimersByTimeAsync(1);
    expect(sincronizar).toHaveBeenCalledTimes(1);

    programador.solicitar();
    await vi.advanceTimersByTimeAsync(9_998);
    expect(sincronizar).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(sincronizar).toHaveBeenCalledTimes(2);

    programador.detener();
  });

  it('cancela los intentos pendientes al detenerse', async () => {
    const sincronizar = vi.fn(async () => undefined);
    const programador = crearProgramadorSync({ sincronizar });

    programador.solicitar();
    programador.detener();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(sincronizar).not.toHaveBeenCalled();
  });
});
