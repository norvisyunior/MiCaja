import { useEffect, useState, type FormEvent } from 'react';
import { api, apiControl } from '../api/client';
import type { Plan } from '../api/types';

const LIMITE = 25;
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
import { mensajeError } from '../lib/errores';

interface FormularioPlan {
  codigo: string;
  nombre: string;
  maxDispositivos: string;
  features: string;
  precioMensual: string;
  activo: boolean;
}

export function PlanesPage() {
  const { mostrarToast } = useToast();
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [pagina, setPagina] = useState(1);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [editando, setEditando] = useState<Plan | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [formulario, setFormulario] = useState<FormularioPlan>({
    codigo: '',
    nombre: '',
    maxDispositivos: '',
    features: '',
    precioMensual: '0',
    activo: true,
  });
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<unknown>(null);

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const respuesta = await api.planes({ page: pagina, limit: LIMITE });
      setPlanes(respuesta.items);
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

  function abrir(plan?: Plan) {
    setEditando(plan ?? null);
    setNuevo(!plan);
    setFormulario({
      codigo: plan?.codigo ?? '',
      nombre: plan?.nombre ?? '',
      maxDispositivos: plan?.maxDispositivos ? String(plan.maxDispositivos) : '',
      features: plan?.features.join(', ') ?? '',
      precioMensual: String(plan?.precioMensual ?? 0),
      activo: plan?.activo ?? true,
    });
    setErrorGuardar(null);
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setGuardando(true);
    setErrorGuardar(null);
    const datos = {
      codigo: formulario.codigo.trim(),
      nombre: formulario.nombre.trim(),
      maxDispositivos: formulario.maxDispositivos ? Number(formulario.maxDispositivos) : null,
      features: formulario.features.split(',').map((f) => f.trim()).filter(Boolean),
      precioMensual: Number(formulario.precioMensual),
      activo: formulario.activo,
    };
    try {
      if (editando) await apiControl.editarPlan(editando.id, datos);
      else await apiControl.crearPlan(datos);
      setNuevo(false);
      setEditando(null);
      mostrarToast('Plan guardado.');
      await cargar();
    } catch (fallo) {
      setErrorGuardar(fallo);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="pila">
      <EncabezadoPagina
        titulo="Planes"
        descripcion="Condiciones comerciales y funcionalidades entregadas a cada licencia."
        acciones={<Boton icono="mas" onClick={() => abrir()}>Nuevo plan</Boton>}
      />

      <section className="panel panel--plano">
        {error ? (
          <div className="pila pila--compacta">
            <Aviso>{mensajeError(error)}</Aviso>
            <Boton variante="secundario" onClick={() => void cargar()}>Reintentar</Boton>
          </div>
        ) : cargando ? (
          <Cargando etiqueta="Cargando planes…" />
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Precio mensual</th>
                  <th>Terminales</th>
                  <th>Funciones</th>
                  <th>Estado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {planes.map((plan) => (
                  <tr key={plan.id}>
                    <td>
                      <span className="celda-principal">{plan.nombre}</span>
                      <span className="celda-secundaria">{plan.codigo}</span>
                    </td>
                    <td>${plan.precioMensual.toFixed(2)}</td>
                    <td>{plan.maxDispositivos ?? 'Sin límite'}</td>
                    <td>{plan.features.join(', ') || '—'}</td>
                    <td>
                      <Insignia tono={plan.activo ? 'ok' : 'neutral'} punto={false}>
                        {plan.activo ? 'Activo' : 'Inactivo'}
                      </Insignia>
                    </td>
                    <td className="acciones-fila">
                      <div className="acciones-grupo">
                        <BotonIcono icono="editar" etiqueta={`Editar plan ${plan.nombre}`} onClick={() => abrir(plan)} />
                      </div>
                    </td>
                  </tr>
                ))}
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
        titulo={editando ? 'Editar plan' : 'Nuevo plan'}
        onCerrar={() => { setNuevo(false); setEditando(null); }}
        ancho="ancho"
        pie={
          <>
            <Boton variante="fantasma" onClick={() => { setNuevo(false); setEditando(null); }} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" form="formulario-plan" cargando={guardando}>Guardar</Boton>
          </>
        }
      >
        {errorGuardar ? <Aviso>{mensajeError(errorGuardar)}</Aviso> : null}
        <form id="formulario-plan" className="formulario formulario--rejilla" onSubmit={guardar}>
          <Campo etiqueta="Código" requerido>
            <input value={formulario.codigo} onChange={(e) => setFormulario({ ...formulario, codigo: e.target.value })} required />
          </Campo>
          <Campo etiqueta="Nombre" requerido>
            <input value={formulario.nombre} onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })} required />
          </Campo>
          <Campo etiqueta="Precio mensual">
            <input type="number" min="0" step="0.01" value={formulario.precioMensual} onChange={(e) => setFormulario({ ...formulario, precioMensual: e.target.value })} />
          </Campo>
          <Campo etiqueta="Máx. terminales" ayuda="Vacío = sin límite">
            <input type="number" min="1" value={formulario.maxDispositivos} onChange={(e) => setFormulario({ ...formulario, maxDispositivos: e.target.value })} />
          </Campo>
          <Campo etiqueta="Funciones" ayuda="Separadas por coma" ancho>
            <input value={formulario.features} onChange={(e) => setFormulario({ ...formulario, features: e.target.value })} />
          </Campo>
          <Campo etiqueta="Estado">
            <select value={formulario.activo ? 'true' : 'false'} onChange={(e) => setFormulario({ ...formulario, activo: e.target.value === 'true' })}>
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </Campo>
        </form>
      </Modal>
    </div>
  );
}
