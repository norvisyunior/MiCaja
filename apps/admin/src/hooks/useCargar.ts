import { useCallback, useEffect, useRef, useState } from 'react';

export function useCargar<T>(cargar: () => Promise<T>, deps: unknown[]) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [cargando, setCargando] = useState(true);
  const montado = useRef(true);

  const ejecutar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const resultado = await cargar();
      if (montado.current) setDatos(resultado);
    } catch (fallo) {
      if (montado.current) setError(fallo);
    } finally {
      if (montado.current) setCargando(false);
    }
    // Las dependencias las decide la pantalla que llama al hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    montado.current = true;
    void ejecutar();
    return () => {
      montado.current = false;
    };
  }, [ejecutar]);

  return { datos, error, cargando, recargar: ejecutar };
}
