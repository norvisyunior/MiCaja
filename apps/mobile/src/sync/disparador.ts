type OyenteSync = () => void;

let oyente: OyenteSync | null = null;

/**
 * Permite que el sincronizador automático se registre para atender pedidos de
 * sync inmediato desde los repositorios, sin acoplarlos al hook de React.
 */
export function registrarDisparadorSync(siguiente: OyenteSync): () => void {
  oyente = siguiente;
  return () => {
    if (oyente === siguiente) oyente = null;
  };
}

/** Pide una sincronización lo antes posible (sujeta al intervalo mínimo). */
export function pedirSyncAhora(): void {
  oyente?.();
}
