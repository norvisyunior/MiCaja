import { describe, expect, it, vi } from 'vitest';
import { pedirSyncAhora, registrarDisparadorSync } from './disparador';

describe('disparador de sincronización', () => {
  it('avisa al oyente registrado y deja de hacerlo al desregistrar', () => {
    const oyente = vi.fn();
    const desregistrar = registrarDisparadorSync(oyente);

    pedirSyncAhora();
    expect(oyente).toHaveBeenCalledTimes(1);

    desregistrar();
    pedirSyncAhora();
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it('no falla si no hay oyente registrado', () => {
    expect(() => pedirSyncAhora()).not.toThrow();
  });
});
