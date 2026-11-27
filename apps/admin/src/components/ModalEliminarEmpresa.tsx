import { useEffect, useId, useState } from 'react';
import { apiControl } from '../api/client';
import { mensajeError } from '../lib/errores';
import { useToast } from './Toast';
import { Aviso, Boton, Campo, Modal } from './UI';

interface EmpresaEliminar {
  id: string;
  nombre: string;
}

interface Props {
  empresa: EmpresaEliminar | null;
  onCerrar: () => void;
  onEliminada: () => void;
}

export function ModalEliminarEmpresa({ empresa, onCerrar, onEliminada }: Props) {
  const { mostrarToast } = useToast();
  const [nombre, setNombre] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const idNombre = useId();

  useEffect(() => {
    setNombre('');
    setCargando(false);
    setError(null);
  }, [empresa?.id]);

  if (!empresa) return null;

  const actual = empresa;
  const coincide = nombre.trim() === actual.nombre;

  function cerrar() {
    if (!cargando) onCerrar();
  }

  async function eliminar() {
    if (!coincide || cargando) return;
    setCargando(true);
    setError(null);
    try {
      await apiControl.eliminarEmpresaDefinitivamente(actual.id, nombre.trim());
      mostrarToast('Empresa y todos sus datos eliminados definitivamente.');
      onEliminada();
    } catch (fallo) {
      setError(fallo);
      setCargando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Eliminar empresa definitivamente"
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
            Eliminar definitivamente
          </Boton>
        </>
      }
    >
      {error ? <Aviso>{mensajeError(error)}</Aviso> : null}
      <p className="texto-confirmacion">
        Se borrarán permanentemente la empresa, sus usuarios, licencias, terminales,
        catálogo, ventas, inventario, gastos, auditoría y cualquier otro dato asociado.
      </p>
      <Campo
        etiqueta={`Escribe «${actual.nombre}» para confirmar`}
        htmlFor={idNombre}
        requerido
      >
        <input
          id={idNombre}
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
          autoComplete="off"
          autoFocus
        />
      </Campo>
    </Modal>
  );
}
