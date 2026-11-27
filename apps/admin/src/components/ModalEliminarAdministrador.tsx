import { useEffect, useId, useState } from 'react';
import { apiControl } from '../api/client';
import { mensajeError } from '../lib/errores';
import { useToast } from './Toast';
import { Aviso, Boton, Campo, Modal } from './UI';

interface AdminEliminar {
  id: string;
  email: string;
  nombre: string;
}

interface Props {
  administrador: AdminEliminar | null;
  onCerrar: () => void;
  onEliminado: () => void;
}

export function ModalEliminarAdministrador({ administrador, onCerrar, onEliminado }: Props) {
  const { mostrarToast } = useToast();
  const [email, setEmail] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const idEmail = useId();

  useEffect(() => {
    setEmail('');
    setCargando(false);
    setError(null);
  }, [administrador?.id]);

  if (!administrador) return null;

  const actual = administrador;
  const coincide = email.trim().toLowerCase() === actual.email.toLowerCase();

  function cerrar() {
    if (!cargando) onCerrar();
  }

  async function eliminar() {
    if (!coincide || cargando) return;
    setCargando(true);
    setError(null);
    try {
      await apiControl.eliminarAdministrador(actual.id, actual.email);
      mostrarToast('Administrador eliminado.');
      onEliminado();
    } catch (fallo) {
      setError(fallo);
      setCargando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Eliminar administrador"
      descripcion="Esta acción no se puede deshacer."
      onCerrar={cerrar}
      pie={
        <>
          <Boton variante="fantasma" onClick={cerrar} disabled={cargando}>
            Cancelar
          </Boton>
          <Boton
            variante="peligro"
            icono="papelera"
            onClick={() => void eliminar()}
            disabled={!coincide}
            cargando={cargando}
          >
            Eliminar administrador
          </Boton>
        </>
      }
    >
      {error ? <Aviso>{mensajeError(error)}</Aviso> : null}
      <p className="texto-confirmacion">
        Se revocará el acceso de <strong>{actual.nombre}</strong> y todas sus acciones
        quedarán registradas en la auditoría.
      </p>
      <Campo
        etiqueta={`Escribe «${actual.email}» para confirmar`}
        htmlFor={idEmail}
        requerido
      >
        <input
          id={idEmail}
          type="email"
          value={email}
          onChange={(evento) => setEmail(evento.target.value)}
          autoComplete="off"
          autoFocus
        />
      </Campo>
    </Modal>
  );
}
