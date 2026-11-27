import { useEffect, useState, type FormEvent } from 'react';
import { apiControl } from '../api/client';
import type { FilaControl } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import {
  Aviso,
  Boton,
  BotonIcono,
  Campo,
  Cargando,
  EncabezadoPagina,
  Insignia,
  Modal,
  Paginacion,
} from '../components/UI';
import { useToast } from '../components/Toast';
import { ModalEliminarAdministrador } from '../components/ModalEliminarAdministrador';
import { mensajeError } from '../lib/errores';

const LIMITE = 25;

interface FormularioAdmin {
  email: string;
  nombre: string;
  password: string;
  activo: boolean;
}

export function AdministradoresPage() {
  const { mostrarToast } = useToast();
  const { admin } = useAuth();
  const [administradores, setAdministradores] = useState<FilaControl[]>([]);
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<FilaControl | null>(null);
  const [formulario, setFormulario] = useState<FormularioAdmin>({
    email: '',
    nombre: '',
    password: '',
    activo: true,
  });
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<unknown>(null);
  const [eliminando, setEliminando] = useState<FilaControl | null>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const respuesta = await apiControl.administradores({ page: pagina, limit: LIMITE });
      setAdministradores(respuesta.administradores);
      setTotal(respuesta.total);
    } catch (fallo) {
      setError(fallo);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, [pagina]);

  function abrir(admin?: FilaControl) {
    setEditando(admin ?? null);
    setNuevo(!admin);
    setFormulario({
      email: String(admin?.email ?? ''),
      nombre: String(admin?.nombre ?? ''),
      password: '',
      activo: admin ? Boolean(admin.activo) : true,
    });
    setErrorGuardar(null);
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setGuardando(true);
    setErrorGuardar(null);
    try {
      const datos = {
        email: formulario.email.trim(),
        nombre: formulario.nombre.trim(),
        activo: formulario.activo,
        ...(formulario.password ? { password: formulario.password } : {}),
      };
      if (editando) await apiControl.editarAdministrador(String(editando.id), datos);
      else await apiControl.crearAdministrador({ ...datos, password: formulario.password });
      setNuevo(false);
      setEditando(null);
      mostrarToast('Administrador guardado.');
      await cargar();
    } catch (fallo) {
      setErrorGuardar(fallo);
    } finally {
      setGuardando(false);
    }
  }

  function alEliminar() {
    setEliminando(null);
    if (administradores.length === 1 && pagina > 1) setPagina(pagina - 1);
    else void cargar();
  }

  return (
    <div className="pila">
      <EncabezadoPagina
        titulo="Administradores"
        descripcion="Cuentas con acceso total al panel. Todas las acciones quedan auditadas."
        acciones={<Boton icono="mas" onClick={() => abrir()}>Nuevo administrador</Boton>}
      />

      <section className="panel panel--plano">
        {error ? (
          <div className="pila pila--compacta">
            <Aviso>{mensajeError(error)}</Aviso>
            <Boton variante="secundario" onClick={() => void cargar()}>Reintentar</Boton>
          </div>
        ) : cargando ? (
          <Cargando etiqueta="Cargando administradores…" />
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {administradores.map((fila) => {
                  const protegido = Boolean(fila.protegido);
                  const propio = String(admin?.id) === String(fila.id);
                  return (
                    <tr key={String(fila.id)}>
                      <td className="celda-principal">
                        {String(fila.nombre)}
                        {protegido ? (
                          <span className="celda-secundaria">Propietario protegido</span>
                        ) : null}
                      </td>
                      <td>{String(fila.email)}</td>
                      <td><Insignia tono="info" punto={false}>{String(fila.rol)}</Insignia></td>
                      <td>
                        <Insignia tono={fila.activo ? 'ok' : 'neutral'} punto={false}>
                          {fila.activo ? 'Activo' : 'Inactivo'}
                        </Insignia>
                      </td>
                      <td className="acciones-fila">
                        <div className="acciones-grupo">
                          <BotonIcono
                            icono="editar"
                            etiqueta={`Editar a ${String(fila.nombre)}`}
                            onClick={() => abrir(fila)}
                          />
                          <BotonIcono
                            icono="papelera"
                            etiqueta={
                              protegido
                                ? 'La cuenta del propietario no se puede eliminar'
                                : propio
                                  ? 'No puedes eliminar tu propia cuenta'
                                  : `Eliminar a ${String(fila.nombre)}`
                            }
                            variante="peligro"
                            disabled={protegido || propio}
                            onClick={() => setEliminando(fila)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
            <Paginacion
              pagina={pagina}
              totalPaginas={Math.max(1, Math.ceil(total / LIMITE))}
              total={total}
              onCambiar={setPagina}
            />
          </>
        )}
      </section>

      <Modal
        abierto={nuevo || Boolean(editando)}
        titulo={editando ? 'Editar administrador' : 'Nuevo administrador'}
        onCerrar={() => { setNuevo(false); setEditando(null); }}
        ancho="ancho"
        pie={
          <>
            <Boton variante="fantasma" onClick={() => { setNuevo(false); setEditando(null); }} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" form="formulario-admin" cargando={guardando}>Guardar</Boton>
          </>
        }
      >
        {errorGuardar ? <Aviso>{mensajeError(errorGuardar)}</Aviso> : null}
        <form id="formulario-admin" className="formulario formulario--rejilla" onSubmit={guardar}>
          <Campo etiqueta="Nombre" requerido>
            <input value={formulario.nombre} onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })} required />
          </Campo>
          <Campo etiqueta="Correo" requerido>
            <input type="email" value={formulario.email} onChange={(e) => setFormulario({ ...formulario, email: e.target.value })} required />
          </Campo>
          <Campo etiqueta="Contraseña" ayuda={editando ? 'Vacío para conservar la actual.' : 'Mínimo 8 caracteres.'} ancho>
            <input type="password" value={formulario.password} onChange={(e) => setFormulario({ ...formulario, password: e.target.value })} />
          </Campo>
          <Campo etiqueta="Estado">
            <select value={formulario.activo ? 'true' : 'false'} onChange={(e) => setFormulario({ ...formulario, activo: e.target.value === 'true' })}>
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </Campo>
        </form>
      </Modal>

      <ModalEliminarAdministrador
        administrador={
          eliminando
            ? {
                id: String(eliminando.id),
                email: String(eliminando.email),
                nombre: String(eliminando.nombre),
              }
            : null
        }
        onCerrar={() => setEliminando(null)}
        onEliminado={alEliminar}
      />
    </div>
  );
}
