import { useId, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type {
  CodigoResultado,
  EmpresaDetalle,
  EmpresaEstado,
  Plan,
} from '../api/types';
import {
  InsigniaDispositivo,
  InsigniaEmpresa,
  InsigniaLicencia,
  MarcaVencimiento,
} from '../components/Estados';
import { SelectDuracion } from '../components/Duracion';
import { useToast } from '../components/Toast';
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  Confirmacion,
  EncabezadoPagina,
  Modal,
  TicketCodigo,
  Vacio,
} from '../components/UI';
import { useCargar } from '../hooks/useCargar';
import { detallesError, mensajeError } from '../lib/errores';
import {
  detectarDuracion,
  estadoLicenciaEfectivo,
  fecha,
  fechaConMeses,
  fechaHora,
  fechaInput,
  finGracia,
  isoDesdeFecha,
  plural,
  resolverVencimiento,
  type Duracion,
} from '../lib/format';

interface DatosEmpresa {
  empresa: EmpresaDetalle;
  planes: Plan[];
}

type ConfirmacionTipo = 'suspender' | 'reactivar' | 'cancelar';

export function EmpresaDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { mostrarToast } = useToast();
  const { datos, error, cargando, recargar } = useCargar<DatosEmpresa>(
    async () => {
      if (!id) throw new Error('EMPRESA_NO_ENCONTRADA');
      return {
        empresa: await api.empresa(id),
        planes: await api.planes(),
      };
    },
    [id]
  );

  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [propietario, setPropietario] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorEditar, setErrorEditar] = useState<unknown>(null);

  const [activando, setActivando] = useState(false);
  const [duracion, setDuracion] = useState<Duracion>(1);
  const [venceFecha, setVenceFecha] = useState(fechaConMeses(1));
  const [graceDias, setGraceDias] = useState(7);
  const [planCodigo, setPlanCodigo] = useState('');
  const [activandoCargando, setActivandoCargando] = useState(false);
  const [errorActivar, setErrorActivar] = useState<unknown>(null);

  const [codigo, setCodigo] = useState<CodigoResultado | null>(null);
  const [generando, setGenerando] = useState(false);

  const [confirmacion, setConfirmacion] = useState<ConfirmacionTipo | null>(null);
  const [estadoCargando, setEstadoCargando] = useState(false);

  const idNombre = useId();
  const idPropietario = useId();
  const idEmail = useId();
  const idTelefono = useId();
  const idVence = useId();
  const idGracia = useId();
  const idPlan = useId();

  if (cargando && !datos) return <Cargando etiqueta="Cargando empresa…" />;
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

  const empresa = datos.empresa;
  const licencia = empresa.licenciaEstado && empresa.venceEn
    ? {
        estado: empresa.licenciaEstado,
        venceEn: empresa.venceEn,
        graceDias: empresa.graceDias ?? 0,
      }
    : null;
  const efectivo = licencia ? estadoLicenciaEfectivo(licencia) : null;
  const planActual = datos.planes.find((plan) => plan.codigo === empresa.planCodigo);

  function abrirEditar() {
    setNombre(empresa.nombre);
    setPropietario(empresa.propietario);
    setEmail(empresa.email ?? '');
    setTelefono(empresa.telefono ?? '');
    setErrorEditar(null);
    setEditando(true);
  }

  async function guardarDatos(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setGuardando(true);
    setErrorEditar(null);
    try {
      await api.actualizarEmpresa(empresa.id, {
        nombre: nombre.trim(),
        propietario: propietario.trim(),
        email: email.trim() || undefined,
        telefono: telefono.trim() || undefined,
      });
      setEditando(false);
      mostrarToast('Datos del negocio actualizados.');
      await recargar();
    } catch (fallo) {
      setErrorEditar(fallo);
    } finally {
      setGuardando(false);
    }
  }

  function abrirActivar() {
    const actual = empresa.venceEn ? new Date(empresa.venceEn) : null;
    if (actual && actual.getTime() > Date.now()) {
      setDuracion(detectarDuracion(actual));
      setVenceFecha(fechaInput(actual));
    } else {
      setDuracion(1);
      setVenceFecha(fechaConMeses(1));
    }
    setGraceDias(empresa.graceDias ?? 7);
    setPlanCodigo(empresa.planCodigo ?? datos?.planes[0]?.codigo ?? '');
    setErrorActivar(null);
    setActivando(true);
  }

  async function activarDirecto(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!empresa.licenciaId) return;
    const venceEn = isoDesdeFecha(resolverVencimiento(duracion, venceFecha));
    if (!venceEn) {
      setErrorActivar(new Error('Elige una fecha válida.'));
      return;
    }
    setActivandoCargando(true);
    setErrorActivar(null);
    try {
      await api.activarLicencia(empresa.licenciaId, {
        venceEn,
        graceDias,
        planCodigo: planCodigo || undefined,
      });
      setActivando(false);
      mostrarToast('Licencia activada. Las terminales la recibirán al sincronizar.');
      await recargar();
    } catch (fallo) {
      setErrorActivar(fallo);
    } finally {
      setActivandoCargando(false);
    }
  }

  async function generarCodigo() {
    if (!empresa.licenciaId) return;
    setGenerando(true);
    try {
      const resultado = await api.generarCodigo(empresa.licenciaId);
      setCodigo(resultado);
      await recargar();
    } catch (fallo) {
      mostrarToast(mensajeError(fallo), 'error');
    } finally {
      setGenerando(false);
    }
  }

  async function cambiarEstado(estado: EmpresaEstado) {
    setEstadoCargando(true);
    try {
      await api.cambiarEstadoEmpresa(empresa.id, estado);
      setConfirmacion(null);
      mostrarToast(
        estado === 'activa'
          ? 'Negocio reactivado.'
          : estado === 'suspendida'
            ? 'Negocio suspendido. Las terminales dejarán de sincronizar.'
            : 'Negocio cancelado.'
      );
      await recargar();
    } catch (fallo) {
      mostrarToast(mensajeError(fallo), 'error');
    } finally {
      setEstadoCargando(false);
    }
  }

  const textosConfirmacion: Record<
    ConfirmacionTipo,
    { titulo: string; descripcion: string; texto: string; peligro: boolean; estado: EmpresaEstado }
  > = {
    suspender: {
      titulo: 'Suspender negocio',
      descripcion:
        'La licencia se suspende y se borran los tokens firmados. Las terminales podrán consultar sus datos, pero no vender ni sincronizar hasta reactivar.',
      texto: 'Suspender negocio',
      peligro: true,
      estado: 'suspendida',
    },
    reactivar: {
      titulo: 'Reactivar negocio',
      descripcion:
        'La empresa y su licencia vuelven a estar activas. Se firman licencias nuevas para las terminales al sincronizar.',
      texto: 'Reactivar negocio',
      peligro: false,
      estado: 'activa',
    },
    cancelar: {
      titulo: 'Cancelar negocio',
      descripcion:
        'El negocio queda cancelado y su licencia suspendida. Los datos se conservan, pero el cliente no podrá operar.',
      texto: 'Cancelar negocio',
      peligro: true,
      estado: 'cancelada',
    },
  };

  const confirmacionActual = confirmacion ? textosConfirmacion[confirmacion] : null;

  return (
    <div className="pila">
      <EncabezadoPagina
        volver={{ etiqueta: 'Empresas', a: '/empresas' }}
        titulo={empresa.nombre}
        descripcion={`${empresa.propietario} · ${empresa.email ?? 'sin correo'}`}
        acciones={
          <>
            <Boton variante="secundario" icono="refrescar" onClick={() => void recargar()}>
              Actualizar
            </Boton>
            <Boton variante="secundario" icono="edificio" onClick={abrirEditar}>
              Editar datos
            </Boton>
            {empresa.licenciaId ? (
              <Link to={`/licencias/${empresa.licenciaId}`} className="boton boton--primario">
                Gestionar licencia <span aria-hidden="true">→</span>
              </Link>
            ) : null}
          </>
        }
      />

      <div className="ficha-resumen">
        <div className="ficha-resumen__item">
          <span>Estado del negocio</span>
          <InsigniaEmpresa estado={empresa.estado} />
        </div>
        <div className="ficha-resumen__item">
          <span>Licencia</span>
          {licencia ? <InsigniaLicencia licencia={licencia} /> : <span>—</span>}
        </div>
        <div className="ficha-resumen__item">
          <span>Plan</span>
          <strong>{planActual?.nombre ?? empresa.planCodigo ?? '—'}</strong>
        </div>
        <div className="ficha-resumen__item">
          <span>Terminales activas</span>
          <strong>{empresa.dispositivos}</strong>
        </div>
        <div className="ficha-resumen__item">
          <span>Ventas registradas</span>
          <strong>{empresa.conteos.ventas}</strong>
        </div>
      </div>

      <div className="rejilla-dos rejilla-dos--lateral">
        <div className="pila">
          <section className="panel">
            <div className="panel__cabecera">
              <div>
                <h2>Datos del negocio</h2>
                <p>Información de contacto y propiedad.</p>
              </div>
            </div>
            <dl className="lista-datos">
              <div>
                <dt>Propietario</dt>
                <dd>{empresa.propietario}</dd>
              </div>
              <div>
                <dt>Correo</dt>
                <dd>{empresa.email ?? 'Sin correo'}</dd>
              </div>
              <div>
                <dt>Teléfono</dt>
                <dd>{empresa.telefono ?? 'Sin teléfono'}</dd>
              </div>
              <div>
                <dt>Alta</dt>
                <dd>{fechaHora(empresa.createdAt)}</dd>
              </div>
              <div>
                <dt>Última actualización</dt>
                <dd>{fechaHora(empresa.updatedAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="panel">
            <div className="panel__cabecera">
              <div>
                <h2>Terminales</h2>
                <p>
                  {empresa.dispositivosLista.length === 0
                    ? 'Sin instalaciones registradas.'
                    : plural(empresa.dispositivosLista.length, 'instalación', 'instalaciones')}
                </p>
              </div>
            </div>
            {empresa.dispositivosLista.length === 0 ? (
              <Vacio
                icono="dispositivo"
                titulo="Sin terminales"
                descripcion="La primera terminal aparece cuando el cliente canjea el código de activación."
              />
            ) : (
              <div className="tabla-contenedor">
                <table className="tabla tabla--compacta">
                  <thead>
                    <tr>
                      <th>Terminal</th>
                      <th>Plataforma</th>
                      <th>Estado</th>
                      <th>Última sync</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empresa.dispositivosLista.map((dispositivo) => (
                      <tr key={dispositivo.id}>
                        <td>
                          <span className="celda-principal">{dispositivo.nombre}</span>
                          <span className="celda-secundaria">
                            v{dispositivo.appVersion || '—'} · alta {fecha(dispositivo.createdAt)}
                          </span>
                        </td>
                        <td className="celda-secundaria">{dispositivo.plataforma}</td>
                        <td>
                          <InsigniaDispositivo dispositivo={dispositivo} />
                        </td>
                        <td className="celda-secundaria">
                          {dispositivo.lastSyncAt ? fechaHora(dispositivo.lastSyncAt) : 'Nunca'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="pila">
          <section className="panel" id="licencia">
            <div className="panel__cabecera">
              <div>
                <h2>Licencia</h2>
                <p>{licencia ? <MarcaVencimiento licencia={licencia} /> : 'Sin licencia asociada'}</p>
              </div>
              {licencia ? <InsigniaLicencia licencia={licencia} /> : null}
            </div>

            {licencia ? (
              <>
                <dl className="lista-datos lista-datos--compacta">
                  <div>
                    <dt>Plan</dt>
                    <dd>{planActual?.nombre ?? empresa.planCodigo ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Vence</dt>
                    <dd>{fecha(licencia.venceEn)}</dd>
                  </div>
                  <div>
                    <dt>Fin de gracia</dt>
                    <dd>{fecha(finGracia(licencia))}</dd>
                  </div>
                  <div>
                    <dt>Días de gracia</dt>
                    <dd>{licencia.graceDias}</dd>
                  </div>
                  <div>
                    <dt>Terminales</dt>
                    <dd>
                      {empresa.dispositivos}
                      {planActual?.maxDispositivos
                        ? ` de ${planActual.maxDispositivos}`
                        : ' · sin límite'}
                    </dd>
                  </div>
                </dl>

                {efectivo?.enGracia ? (
                  <Aviso tono="info">
                    La licencia está en período de gracia. Renueva o activa una nueva vigencia
                    antes de que termine.
                  </Aviso>
                ) : null}

                <div className="acciones-panel">
                  <Boton icono="rayo" onClick={abrirActivar}>
                    Activar ahora
                  </Boton>
                  <Boton
                    variante="secundario"
                    icono="ticket"
                    cargando={generando}
                    onClick={() => void generarCodigo()}
                  >
                    Generar código
                  </Boton>
                </div>
                <p className="nota-panel">
                  <strong>Activar ahora</strong> aplica la vigencia y re-firma la licencia sin
                  código. <strong>Generar código</strong> crea una clave para que el cliente la
                  canjee desde la app.
                </p>
              </>
            ) : (
              <p className="texto-suave">Esta empresa no tiene una licencia registrada.</p>
            )}
          </section>

          <section className="panel">
            <div className="panel__cabecera">
              <div>
                <h2>Estado del negocio</h2>
                <p>Suspender corta la sincronización de todas las terminales.</p>
              </div>
            </div>
            <div className="acciones-panel acciones-panel--columna">
              {empresa.estado === 'activa' || empresa.estado === 'pendiente' ? (
                <Boton
                  variante="peligro"
                  icono="candado"
                  onClick={() => setConfirmacion('suspender')}
                >
                  Suspender negocio
                </Boton>
              ) : (
                <Boton
                  variante="secundario"
                  icono="refrescar"
                  onClick={() => setConfirmacion('reactivar')}
                >
                  Reactivar negocio
                </Boton>
              )}
              {empresa.estado !== 'cancelada' ? (
                <Boton variante="fantasma" onClick={() => setConfirmacion('cancelar')}>
                  Cancelar negocio
                </Boton>
              ) : null}
            </div>
            <p className="nota-panel">
              Datos operativos: {empresa.conteos.usuarios} usuarios, {empresa.conteos.productos}{' '}
              productos y {empresa.conteos.ventas} ventas.
            </p>
          </section>
        </div>
      </div>

      <Modal
        abierto={editando}
        titulo="Editar datos del negocio"
        descripcion="Estos datos no afectan a la licencia ni a las terminales."
        onCerrar={() => setEditando(false)}
        pie={
          <>
            <Boton variante="fantasma" onClick={() => setEditando(false)} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" form="formulario-editar-empresa" cargando={guardando}>
              Guardar cambios
            </Boton>
          </>
        }
      >
        {errorEditar ? <Aviso>{mensajeError(errorEditar)}</Aviso> : null}
        <form
          id="formulario-editar-empresa"
          className="formulario formulario--rejilla"
          onSubmit={guardarDatos}
        >
          <Campo etiqueta="Nombre" htmlFor={idNombre} requerido ancho>
            <input
              id={idNombre}
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              required
              maxLength={120}
            />
          </Campo>
          <Campo etiqueta="Propietario" htmlFor={idPropietario} requerido ancho>
            <input
              id={idPropietario}
              value={propietario}
              onChange={(evento) => setPropietario(evento.target.value)}
              required
              maxLength={120}
            />
          </Campo>
          <Campo etiqueta="Correo" htmlFor={idEmail}>
            <input
              id={idEmail}
              type="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
            />
          </Campo>
          <Campo etiqueta="Teléfono" htmlFor={idTelefono}>
            <input
              id={idTelefono}
              value={telefono}
              onChange={(evento) => setTelefono(evento.target.value)}
              maxLength={30}
            />
          </Campo>
        </form>
      </Modal>

      <Modal
        abierto={activando}
        titulo="Activar licencia ahora"
        descripcion="No se necesita código. La licencia y las terminales quedan activas al sincronizar."
        onCerrar={() => setActivando(false)}
        pie={
          <>
            <Boton variante="fantasma" onClick={() => setActivando(false)} disabled={activandoCargando}>
              Cancelar
            </Boton>
            <Boton type="submit" form="formulario-activar-empresa" cargando={activandoCargando}>
              Activar licencia
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
          id="formulario-activar-empresa"
          className="formulario formulario--rejilla"
          onSubmit={activarDirecto}
        >
          <Campo etiqueta="Plan" htmlFor={idPlan} ancho>
            <select
              id={idPlan}
              value={planCodigo}
              onChange={(evento) => setPlanCodigo(evento.target.value)}
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
            duracion={duracion}
            onCambiar={setDuracion}
            fechaPersonalizada={venceFecha}
          />
          <Campo etiqueta="Días de gracia" htmlFor={idGracia}>
            <input
              id={idGracia}
              type="number"
              min={0}
              max={365}
              value={graceDias}
              onChange={(evento) => setGraceDias(Number(evento.target.value))}
              required
            />
          </Campo>
          {duracion === 'personalizado' ? (
            <Campo etiqueta="Vence el" htmlFor={idVence} requerido ancho>
              <input
                id={idVence}
                type="date"
                value={venceFecha}
                min={fechaInput(new Date())}
                onChange={(evento) => setVenceFecha(evento.target.value)}
                required
              />
            </Campo>
          ) : null}
        </form>
      </Modal>

      <Modal
        abierto={codigo !== null}
        titulo="Código de activación"
        descripcion="Úsalo en la pantalla de activación de la app."
        onCerrar={() => setCodigo(null)}
        ancho="ancho"
        pie={
          <Boton variante="secundario" onClick={() => setCodigo(null)}>
            Cerrar
          </Boton>
        }
      >
        {codigo ? <TicketCodigo codigo={codigo.codigo} expira={codigo.expira} /> : null}
      </Modal>

      {confirmacionActual ? (
        <Confirmacion
          abierto
          titulo={confirmacionActual.titulo}
          descripcion={confirmacionActual.descripcion}
          textoConfirmar={confirmacionActual.texto}
          peligro={confirmacionActual.peligro}
          cargando={estadoCargando}
          onConfirmar={() => void cambiarEstado(confirmacionActual.estado)}
          onCerrar={() => setConfirmacion(null)}
        />
      ) : null}
    </div>
  );
}
