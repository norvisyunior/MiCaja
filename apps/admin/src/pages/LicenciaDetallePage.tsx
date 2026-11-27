import { useId, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type ListaBasica } from '../api/client';
import type {
  CodigoResultado,
  Evento,
  Licencia,
  LicenciaEstado,
  Plan,
} from '../api/types';
import { SelectDuracion } from '../components/Duracion';
import { InsigniaLicencia, MarcaVencimiento } from '../components/Estados';
import { useToast } from '../components/Toast';
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  Confirmacion,
  EncabezadoPagina,
  Modal,
  Paginacion,
  TicketCodigo,
  Vacio,
} from '../components/UI';
import { useCargar } from '../hooks/useCargar';
import { detallesError, mensajeError } from '../lib/errores';
import {
  ETIQUETAS_EVENTO,
  ETIQUETAS_FEATURE,
  ETIQUETAS_LICENCIA,
  detectarDuracion,
  estadoLicenciaEfectivo,
  fecha,
  fechaConMeses,
  fechaHora,
  fechaHoraCorta,
  fechaInput,
  finGracia,
  isoDesdeFecha,
  resolverVencimiento,
  type Duracion,
} from '../lib/format';

interface DatosLicencia {
  licencia: Licencia;
  planes: Plan[];
  eventos: ListaBasica<Evento>;
}

type ConfirmacionTipo = 'suspender' | 'reactivar';

function resumenPayload(payload: Record<string, unknown>): string {
  const partes: string[] = [];
  if (typeof payload.via === 'string') partes.push(`Vía: ${payload.via}`);
  if (typeof payload.plan === 'string') partes.push(`Plan: ${payload.plan}`);
  if (typeof payload.venceEn === 'string') {
    const valor = new Date(payload.venceEn);
    if (!Number.isNaN(valor.getTime())) partes.push(`Vence: ${fecha(valor)}`);
  }
  if (typeof payload.nombre === 'string') partes.push(payload.nombre);
  if (typeof payload.plataforma === 'string') partes.push(payload.plataforma);
  return partes.join(' · ') || 'Sin detalle adicional';
}

export function LicenciaDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { mostrarToast } = useToast();
  const [paginaEventos, setPaginaEventos] = useState(1);
  const { datos, error, cargando, recargar } = useCargar<DatosLicencia>(
    async () => {
      if (!id) throw new Error('LICENCIA_NO_ENCONTRADA');
      const [licencia, planes, eventos] = await Promise.all([
        api.licencia(id),
        api.planes({ limit: 200 }).then((respuesta) => respuesta.items),
        api.eventos(id, { page: paginaEventos, limit: 10 }),
      ]);
      return { licencia, planes, eventos };
    },
    [id, paginaEventos]
  );

  const [codigo, setCodigo] = useState<CodigoResultado | null>(null);
  const [generando, setGenerando] = useState(false);

  const [activarAbierto, setActivarAbierto] = useState(false);
  const [activarDuracion, setActivarDuracion] = useState<Duracion>(1);
  const [activarFecha, setActivarFecha] = useState(fechaConMeses(1));
  const [activarGracia, setActivarGracia] = useState(7);
  const [activarPlan, setActivarPlan] = useState('');
  const [activarCargando, setActivarCargando] = useState(false);
  const [errorActivar, setErrorActivar] = useState<unknown>(null);

  const [renovarAbierto, setRenovarAbierto] = useState(false);
  const [renovarDuracion, setRenovarDuracion] = useState<Duracion>(1);
  const [renovarFecha, setRenovarFecha] = useState(fechaConMeses(1));
  const [renovarGracia, setRenovarGracia] = useState(7);
  const [renovarCargando, setRenovarCargando] = useState(false);
  const [errorRenovar, setErrorRenovar] = useState<unknown>(null);

  const [editarAbierto, setEditarAbierto] = useState(false);
  const [editarPlan, setEditarPlan] = useState('');
  const [editarDuracion, setEditarDuracion] = useState<Duracion>('personalizado');
  const [editarFecha, setEditarFecha] = useState('');
  const [editarGracia, setEditarGracia] = useState(7);
  const [editarEstado, setEditarEstado] = useState<LicenciaEstado>('activa');
  const [editarCargando, setEditarCargando] = useState(false);
  const [errorEditar, setErrorEditar] = useState<unknown>(null);

  const [confirmacion, setConfirmacion] = useState<ConfirmacionTipo | null>(null);
  const [estadoCargando, setEstadoCargando] = useState(false);

  const idActivacion = useId();
  const idActivacionPlan = useId();
  const idActivacionGracia = useId();
  const idRenovar = useId();
  const idRenovarGracia = useId();
  const idEditarPlan = useId();
  const idEditarFecha = useId();
  const idEditarGracia = useId();
  const idEditarEstado = useId();

  if (cargando && !datos) return <Cargando etiqueta="Cargando licencia…" />;
  if (error && !datos) {
    return (
      <div className="panel">
        <Aviso>{mensajeError(error)}</Aviso>
        <Boton variante="secundario" icono="refrescar" onClick={() => void recargar()}>
          Reintentar
        </Boton>
      </div>
    );
  }
  if (!datos) return null;

  const licencia = datos.licencia;
  const efectivo = estadoLicenciaEfectivo(licencia);
  const planActual = datos.planes.find((plan) => plan.codigo === licencia.planCodigo);
  const features = licencia.features?.length
    ? licencia.features
    : (licencia.planFeatures ?? planActual?.features ?? []);
  const etiquetaEstado = efectivo.enGracia
    ? 'EN GRACIA'
    : ETIQUETAS_LICENCIA[efectivo.estado].toUpperCase();
  const etiquetaActivar = efectivo.estado === 'activa' ? 'Actualizar vigencia' : 'Activar ahora';
  const etiquetaActivarCabecera = efectivo.estado === 'activa' ? 'Actualizar' : 'Activar ahora';

  function abrirActivar() {
    const actual = new Date(licencia.venceEn);
    if (actual.getTime() > Date.now()) {
      setActivarDuracion(detectarDuracion(actual));
      setActivarFecha(fechaInput(actual));
    } else {
      setActivarDuracion(1);
      setActivarFecha(fechaConMeses(1));
    }
    setActivarGracia(licencia.graceDias);
    setActivarPlan(licencia.planCodigo);
    setErrorActivar(null);
    setActivarAbierto(true);
  }

  function abrirRenovar() {
    setRenovarDuracion(1);
    setRenovarFecha(fechaConMeses(1));
    setRenovarGracia(licencia.graceDias);
    setErrorRenovar(null);
    setRenovarAbierto(true);
  }

  function abrirEditar() {
    setEditarPlan(licencia.planCodigo);
    setEditarDuracion(detectarDuracion(licencia.venceEn));
    setEditarFecha(fechaInput(licencia.venceEn));
    setEditarGracia(licencia.graceDias);
    setEditarEstado(licencia.estado);
    setErrorEditar(null);
    setEditarAbierto(true);
  }

  async function generarCodigo() {
    setGenerando(true);
    try {
      const resultado = await api.generarCodigo(licencia.id);
      setCodigo(resultado);
      await recargar();
    } catch (fallo) {
      mostrarToast(mensajeError(fallo), 'error');
    } finally {
      setGenerando(false);
    }
  }

  async function activarDirecto(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const venceEn = isoDesdeFecha(resolverVencimiento(activarDuracion, activarFecha));
    if (!venceEn) {
      setErrorActivar(new Error('Elige una fecha válida.'));
      return;
    }
    setActivarCargando(true);
    setErrorActivar(null);
    try {
      await api.activarLicencia(licencia.id, {
        venceEn,
        graceDias: activarGracia,
        planCodigo: activarPlan || undefined,
      });
      setActivarAbierto(false);
      mostrarToast('Licencia activada. Las terminales la recibirán al sincronizar.');
      await recargar();
    } catch (fallo) {
      setErrorActivar(fallo);
    } finally {
      setActivarCargando(false);
    }
  }

  async function renovar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const venceEn = isoDesdeFecha(resolverVencimiento(renovarDuracion, renovarFecha));
    if (!venceEn) {
      setErrorRenovar(new Error('Elige una fecha válida.'));
      return;
    }
    setRenovarCargando(true);
    setErrorRenovar(null);
    try {
      const resultado = await api.renovar(licencia.id, venceEn, renovarGracia);
      setRenovarAbierto(false);
      setCodigo({ ...resultado, venceEn });
      await recargar();
    } catch (fallo) {
      setErrorRenovar(fallo);
    } finally {
      setRenovarCargando(false);
    }
  }

  async function guardarEdicion(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const venceEn = isoDesdeFecha(resolverVencimiento(editarDuracion, editarFecha));
    if (!venceEn) {
      setErrorEditar(new Error('Elige una fecha válida.'));
      return;
    }
    setEditarCargando(true);
    setErrorEditar(null);
    try {
      await api.actualizarLicencia(licencia.id, {
        planCodigo: editarPlan,
        venceEn,
        graceDias: editarGracia,
        estado: editarEstado,
      });
      setEditarAbierto(false);
      mostrarToast('Licencia actualizada.');
      await recargar();
    } catch (fallo) {
      setErrorEditar(fallo);
    } finally {
      setEditarCargando(false);
    }
  }

  async function cambiarEstado(estado: LicenciaEstado) {
    setEstadoCargando(true);
    try {
      await api.actualizarLicencia(licencia.id, { estado });
      setConfirmacion(null);
      mostrarToast(
        estado === 'suspendida'
          ? 'Licencia suspendida. Se borraron los tokens de las terminales.'
          : 'Licencia reactivada. Las terminales recibirán un token nuevo.'
      );
      await recargar();
    } catch (fallo) {
      mostrarToast(mensajeError(fallo), 'error');
    } finally {
      setEstadoCargando(false);
    }
  }

  return (
    <div className="pila">
      <EncabezadoPagina
        volver={{ etiqueta: 'Licencias', a: '/licencias' }}
        titulo={licencia.empresaNombre}
        descripcion={`Plan ${licencia.planNombre ?? licencia.planCodigo} · Alta ${fechaHora(
          licencia.createdAt
        )}`}
        acciones={
          <>
            <Link to={`/empresas/${licencia.empresaId}`} className="boton boton--fantasma">
              Ver empresa
            </Link>
            <Boton variante="secundario" icono="ticket" cargando={generando} onClick={() => void generarCodigo()}>
              Generar código
            </Boton>
            <Boton icono="rayo" onClick={abrirActivar}>
              {etiquetaActivarCabecera}
            </Boton>
          </>
        }
      />

      <div className="licencia-hero">
        <div className="licencia-hero__datos">
          <span className="eyebrow">Licencia</span>
          <div className="licencia-hero__estado">
            <InsigniaLicencia licencia={licencia} />
            <MarcaVencimiento licencia={licencia} />
          </div>
          <p className="licencia-hero__vence">
            Vence el <strong>{fecha(licencia.venceEn)}</strong>
            {licencia.graceDias > 0 ? ` · gracia hasta ${fecha(finGracia(licencia))}` : ''}
          </p>
          <div className="licencia-hero__features">
            {features.map((feature) => (
              <span key={feature} className="chip-feature">
                {ETIQUETAS_FEATURE[feature] ?? feature}
              </span>
            ))}
          </div>
        </div>
        <div className={`sello sello--${efectivo.enGracia ? 'gracia' : efectivo.estado}`}>
          {etiquetaEstado}
        </div>
      </div>

      <div className="rejilla-dos rejilla-dos--lateral">
        <div className="pila">
          <section className="panel">
            <div className="panel__cabecera">
              <div>
                <h2>Ficha de la licencia</h2>
                <p>Datos de vigencia y uso.</p>
              </div>
            </div>
            <dl className="lista-datos lista-datos--compacta">
              <div>
                <dt>Plan</dt>
                <dd>{licencia.planNombre ?? licencia.planCodigo}</dd>
              </div>
              <div>
                <dt>Terminales activas</dt>
                <dd>
                  {licencia.dispositivos}
                  {licencia.maxDispositivos ? ` de ${licencia.maxDispositivos}` : ' · sin límite'}
                </dd>
              </div>
              <div>
                <dt>Activada</dt>
                <dd>{licencia.activadaEn ? fechaHora(licencia.activadaEn) : 'Todavía no'}</dd>
              </div>
              <div>
                <dt>Vence</dt>
                <dd>{fecha(licencia.venceEn)}</dd>
              </div>
              <div>
                <dt>Días de gracia</dt>
                <dd>{licencia.graceDias}</dd>
              </div>
              <div>
                <dt>Fin de gracia</dt>
                <dd>{fecha(finGracia(licencia))}</dd>
              </div>
              <div>
                <dt>Código vigente hasta</dt>
                <dd>
                  {licencia.codigoExpiraEn
                    ? fechaHora(licencia.codigoExpiraEn)
                    : 'Sin código generado'}
                </dd>
              </div>
              <div>
                <dt>Último código usado</dt>
                <dd>{licencia.codigoUsadoEn ? fechaHora(licencia.codigoUsadoEn) : 'Nunca'}</dd>
              </div>
            </dl>
          </section>

          <section className="panel">
            <div className="panel__cabecera">
              <div>
                <h2>Historial</h2>
                <p>Eventos registrados para esta licencia.</p>
              </div>
            </div>
            {datos.eventos.items.length === 0 ? (
              <Vacio
                titulo="Sin eventos"
                descripcion="Las activaciones, renovaciones y suspensiones se registrarán aquí."
              />
            ) : (
              <ol className="linea-tiempo">
                {datos.eventos.items.map((evento) => (
                  <li key={evento.id}>
                    <span className="linea-tiempo__punto" aria-hidden="true" />
                    <div>
                      <strong>{ETIQUETAS_EVENTO[evento.tipo] ?? evento.tipo}</strong>
                      <span>{resumenPayload(evento.payload)}</span>
                    </div>
                    <time dateTime={evento.createdAt}>{fechaHoraCorta(evento.createdAt)}</time>
                  </li>
                ))}
              </ol>
            )}
            <Paginacion
              pagina={paginaEventos}
              totalPaginas={Math.max(1, Math.ceil(datos.eventos.total / 10))}
              total={datos.eventos.total}
              onCambiar={setPaginaEventos}
            />
          </section>
        </div>

        <div className="pila">
          <section className="panel">
            <div className="panel__cabecera">
              <div>
                <h2>Acciones</h2>
                <p>Todo cambio queda en auditoría.</p>
              </div>
            </div>
            <div className="acciones-panel acciones-panel--columna">
              <Boton icono="rayo" onClick={abrirActivar}>
                {etiquetaActivar}
              </Boton>
              <Boton
                variante="secundario"
                icono="ticket"
                cargando={generando}
                onClick={() => void generarCodigo()}
              >
                Generar código de activación
              </Boton>
              <Boton variante="secundario" icono="refrescar" onClick={abrirRenovar}>
                Renovar con código
              </Boton>
              <Boton variante="fantasma" icono="calendario" onClick={abrirEditar}>
                Editar plan y vigencia
              </Boton>
              {licencia.estado === 'suspendida' ? (
                <Boton
                  variante="secundario"
                  icono="refrescar"
                  onClick={() => setConfirmacion('reactivar')}
                >
                  Reactivar licencia
                </Boton>
              ) : (
                <Boton
                  variante="peligro"
                  icono="candado"
                  onClick={() => setConfirmacion('suspender')}
                >
                  Suspender licencia
                </Boton>
              )}
            </div>
          </section>

          <section className="panel panel--nota">
            <h2>Cómo funcionan las acciones</h2>
            <ul className="lista-ayuda">
              <li>
                <strong>Activar ahora</strong> o <strong>Actualizar vigencia</strong> aplica la
                fecha y re-firma el token de las terminales ya registradas. Una instalación
                nueva necesita un código de activación.
              </li>
              <li>
                <strong>Generar código</strong> permite registrar terminales sin cambiar la
                vigencia. Sustituye el código anterior.
              </li>
              <li>
                <strong>Renovar con código</strong> fija una nueva fecha y entrega un código
                para registrar terminales. Si la licencia ya estaba activa, sigue activa; si
                estaba vencida, seguirá vencida hasta que el cliente canjee el código.
              </li>
              <li>
                <strong>Suspender</strong> borra los tokens firmados y corta la
                sincronización de todas las terminales.
              </li>
            </ul>
          </section>
        </div>
      </div>

      <Modal
        abierto={activarAbierto}
        titulo={etiquetaActivar}
        descripcion={
          efectivo.estado === 'activa'
            ? 'Aplica una nueva vigencia y re-firma el token de las terminales ya registradas.'
            : 'Activa la licencia sin código y prepara el token para las terminales ya registradas.'
        }
        onCerrar={() => setActivarAbierto(false)}
        pie={
          <>
            <Boton variante="fantasma" onClick={() => setActivarAbierto(false)} disabled={activarCargando}>
              Cancelar
            </Boton>
            <Boton type="submit" form="formulario-activar-licencia" cargando={activarCargando}>
              {efectivo.estado === 'activa' ? 'Guardar vigencia' : 'Activar licencia'}
            </Boton>
          </>
        }
      >
        {errorActivar ? (
          <Aviso>
            <strong>{mensajeError(errorActivar)}</strong>
            {detallesError(errorActivar).length > 0 ? (
              <ul>
                {detallesError(errorActivar).map((detalle) => (
                  <li key={detalle}>{detalle}</li>
                ))}
              </ul>
            ) : null}
          </Aviso>
        ) : null}
        <form
          id="formulario-activar-licencia"
          className="formulario formulario--rejilla"
          onSubmit={activarDirecto}
        >
          <Campo etiqueta="Plan" htmlFor={idActivacionPlan} ancho>
            <select
              id={idActivacionPlan}
              value={activarPlan}
              onChange={(evento) => setActivarPlan(evento.target.value)}
            >
              {datos.planes
                .filter((plan) => plan.activo)
                .map((plan) => (
                  <option key={plan.id} value={plan.codigo}>
                    {plan.nombre}
                  </option>
                ))}
            </select>
          </Campo>
          <SelectDuracion
            duracion={activarDuracion}
            onCambiar={setActivarDuracion}
            fechaPersonalizada={activarFecha}
          />
          <Campo etiqueta="Días de gracia" htmlFor={idActivacionGracia}>
            <input
              id={idActivacionGracia}
              type="number"
              min={0}
              max={365}
              value={activarGracia}
              onChange={(evento) => setActivarGracia(Number(evento.target.value))}
              required
            />
          </Campo>
          {activarDuracion === 'personalizado' ? (
            <Campo etiqueta="Vence el" htmlFor={idActivacion} requerido ancho>
              <input
                id={idActivacion}
                type="date"
                value={activarFecha}
                min={fechaInput(new Date())}
                onChange={(evento) => setActivarFecha(evento.target.value)}
                required
              />
            </Campo>
          ) : null}
        </form>
      </Modal>

      <Modal
        abierto={renovarAbierto}
        titulo="Renovar con código"
        descripcion="Fija la nueva vigencia y entrega un código para que el cliente lo canjee."
        onCerrar={() => setRenovarAbierto(false)}
        pie={
          <>
            <Boton variante="fantasma" onClick={() => setRenovarAbierto(false)} disabled={renovarCargando}>
              Cancelar
            </Boton>
            <Boton type="submit" form="formulario-renovar" cargando={renovarCargando}>
              Generar código de renovación
            </Boton>
          </>
        }
      >
        {errorRenovar ? <Aviso>{mensajeError(errorRenovar)}</Aviso> : null}
        <Aviso tono="info">
          {efectivo.estado === 'vencida'
            ? 'La licencia seguirá vencida hasta que el cliente canjee el código en la app. Si necesitas activarla de inmediato, usa Activar ahora.'
            : 'Se actualizará el vencimiento en el panel y se generará un código. Las terminales actuales conservan su token anterior hasta que el cliente canjee el código; si necesitas aplicarlo de inmediato, usa Activar ahora.'}
        </Aviso>
        <form id="formulario-renovar" className="formulario formulario--rejilla" onSubmit={renovar}>
          <SelectDuracion
            duracion={renovarDuracion}
            onCambiar={setRenovarDuracion}
            fechaPersonalizada={renovarFecha}
          />
          <Campo etiqueta="Días de gracia" htmlFor={idRenovarGracia}>
            <input
              id={idRenovarGracia}
              type="number"
              min={0}
              max={365}
              value={renovarGracia}
              onChange={(evento) => setRenovarGracia(Number(evento.target.value))}
              required
            />
          </Campo>
          {renovarDuracion === 'personalizado' ? (
            <Campo etiqueta="Vence el" htmlFor={idRenovar} requerido ancho>
              <input
                id={idRenovar}
                type="date"
                value={renovarFecha}
                min={fechaInput(new Date())}
                onChange={(evento) => setRenovarFecha(evento.target.value)}
                required
              />
            </Campo>
          ) : null}
        </form>
      </Modal>

      <Modal
        abierto={editarAbierto}
        titulo="Editar licencia"
        descripcion="Cambia el plan, la vigencia o el estado almacenado."
        onCerrar={() => setEditarAbierto(false)}
        ancho="ancho"
        pie={
          <>
            <Boton variante="fantasma" onClick={() => setEditarAbierto(false)} disabled={editarCargando}>
              Cancelar
            </Boton>
            <Boton type="submit" form="formulario-editar-licencia" cargando={editarCargando}>
              Guardar cambios
            </Boton>
          </>
        }
      >
        {errorEditar ? (
          <Aviso>
            <strong>{mensajeError(errorEditar)}</strong>
            {detallesError(errorEditar).length > 0 ? (
              <ul>
                {detallesError(errorEditar).map((detalle) => (
                  <li key={detalle}>{detalle}</li>
                ))}
              </ul>
            ) : null}
          </Aviso>
        ) : null}
        <form
          id="formulario-editar-licencia"
          className="formulario formulario--rejilla"
          onSubmit={guardarEdicion}
        >
          <Campo etiqueta="Plan" htmlFor={idEditarPlan} ancho>
            <select
              id={idEditarPlan}
              value={editarPlan}
              onChange={(evento) => setEditarPlan(evento.target.value)}
            >
              {datos.planes.map((plan) => (
                <option key={plan.id} value={plan.codigo}>
                  {plan.nombre}
                  {plan.activo ? '' : ' (inactivo)'}
                </option>
              ))}
            </select>
          </Campo>
          <SelectDuracion
            duracion={editarDuracion}
            onCambiar={setEditarDuracion}
            fechaPersonalizada={editarFecha}
          />
          <Campo etiqueta="Días de gracia" htmlFor={idEditarGracia}>
            <input
              id={idEditarGracia}
              type="number"
              min={0}
              max={365}
              value={editarGracia}
              onChange={(evento) => setEditarGracia(Number(evento.target.value))}
              required
            />
          </Campo>
          {editarDuracion === 'personalizado' ? (
            <Campo
              etiqueta="Vence el"
              htmlFor={idEditarFecha}
              requerido
              ancho
              ayuda="Puedes usar una fecha pasada para dejar la licencia vencida."
            >
              <input
                id={idEditarFecha}
                type="date"
                value={editarFecha}
                onChange={(evento) => setEditarFecha(evento.target.value)}
                required
              />
            </Campo>
          ) : null}
          <Campo
            etiqueta="Estado"
            htmlFor={idEditarEstado}
            ayuda="La fecha también decide si la licencia está vencida."
            ancho
          >
            <select
              id={idEditarEstado}
              value={editarEstado}
              onChange={(evento) => setEditarEstado(evento.target.value as LicenciaEstado)}
            >
              <option value="pendiente">Pendiente</option>
              <option value="activa">Activa</option>
              <option value="vencida">Vencida</option>
              <option value="suspendida">Suspendida</option>
            </select>
          </Campo>
        </form>
      </Modal>

      <Modal
        abierto={codigo !== null}
        titulo="Código de activación"
        descripcion="Compártelo con el negocio. Es reutilizable mientras esté vigente."
        onCerrar={() => setCodigo(null)}
        ancho="ancho"
        pie={
          <Boton variante="secundario" onClick={() => setCodigo(null)}>
            Cerrar
          </Boton>
        }
      >
        {codigo ? (
          <TicketCodigo
            codigo={codigo.codigo}
            expira={codigo.expira}
            venceEn={codigo.venceEn}
            nota="Guárdalo ahora: no se vuelve a mostrar. Generar otro código invalida este."
          />
        ) : null}
      </Modal>

      {confirmacion ? (
        <Confirmacion
          abierto
          titulo={confirmacion === 'suspender' ? 'Suspender licencia' : 'Reactivar licencia'}
          descripcion={
            confirmacion === 'suspender'
              ? 'Se borran los tokens firmados y las terminales dejarán de sincronizar. Podrás reactivarla cuando quieras.'
              : 'La licencia vuelve a estar activa y se firma un token nuevo para las terminales. Comprueba que la fecha de vencimiento siga siendo futura.'
          }
          textoConfirmar={
            confirmacion === 'suspender' ? 'Suspender licencia' : 'Reactivar licencia'
          }
          peligro={confirmacion === 'suspender'}
          cargando={estadoCargando}
          onConfirmar={() =>
            void cambiarEstado(confirmacion === 'suspender' ? 'suspendida' : 'activa')
          }
          onCerrar={() => setConfirmacion(null)}
        />
      ) : null}
    </div>
  );
}
