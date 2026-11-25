import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type {
  CrearEmpresaResultado,
  Empresa,
  EmpresaEstado,
  Plan,
} from '../api/types';
import { InsigniaEmpresa, InsigniaLicencia, MarcaVencimiento } from '../components/Estados';
import { SelectDuracion } from '../components/Duracion';
import { Icono } from '../components/Iconos';
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  EncabezadoPagina,
  Modal,
  TicketCodigo,
  Vacio,
} from '../components/UI';
import { useCargar } from '../hooks/useCargar';
import { detallesError, mensajeError } from '../lib/errores';
import {
  ETIQUETAS_EMPRESA,
  fechaConMeses,
  fechaInput,
  isoDesdeFecha,
  resolverVencimiento,
  type Duracion,
} from '../lib/format';

interface DatosEmpresas {
  empresas: Empresa[];
  planes: Plan[];
}

const ESTADOS: Array<EmpresaEstado | 'todas'> = [
  'todas',
  'activa',
  'pendiente',
  'suspendida',
  'cancelada',
];

function datosLicencia(empresa: Empresa) {
  if (!empresa.licenciaEstado || !empresa.venceEn) return null;
  return {
    estado: empresa.licenciaEstado,
    venceEn: empresa.venceEn,
    graceDias: empresa.graceDias ?? 0,
  };
}

export function EmpresasPage() {
  const { datos, error, cargando, recargar } = useCargar<DatosEmpresas>(
    async () => ({
      empresas: await api.empresas(),
      planes: await api.planes(),
    }),
    []
  );
  const [parametros, setParametros] = useSearchParams();
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<EmpresaEstado | 'todas'>('todas');
  const [resultado, setResultado] = useState<CrearEmpresaResultado | null>(null);

  const [nombre, setNombre] = useState('');
  const [propietario, setPropietario] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [planCodigo, setPlanCodigo] = useState('basico');
  const [duracion, setDuracion] = useState<Duracion>(1);
  const [venceFecha, setVenceFecha] = useState(fechaConMeses(1));
  const [graceDias, setGraceDias] = useState(7);
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState<unknown>(null);
  const idNombre = useId();
  const idPropietario = useId();
  const idEmail = useId();
  const idTelefono = useId();
  const idPlan = useId();
  const idVence = useId();
  const idGracia = useId();

  const crearAbierto = parametros.get('nueva') === '1';
  const planesActivos = useMemo(
    () => datos?.planes.filter((plan) => plan.activo) ?? [],
    [datos]
  );

  useEffect(() => {
    if (crearAbierto && planesActivos.length > 0 && !planesActivos.some((p) => p.codigo === planCodigo)) {
      setPlanCodigo(planesActivos[0].codigo);
    }
  }, [crearAbierto, planesActivos, planCodigo]);

  useEffect(() => {
    if (!crearAbierto) return;
    setDuracion(1);
    setVenceFecha(fechaConMeses(1));
  }, [crearAbierto]);

  function abrirCrear() {
    setErrorCrear(null);
    setParametros((actuales) => {
      const copia = new URLSearchParams(actuales);
      copia.set('nueva', '1');
      return copia;
    });
  }

  function cerrarCrear() {
    setParametros((actuales) => {
      const copia = new URLSearchParams(actuales);
      copia.delete('nueva');
      return copia;
    });
  }

  async function crear(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErrorCrear(null);
    const venceEn = isoDesdeFecha(resolverVencimiento(duracion, venceFecha));
    if (!venceEn) {
      setErrorCrear(new Error('Elige una fecha de vencimiento válida.'));
      return;
    }

    setCreando(true);
    try {
      const creada = await api.crearEmpresa({
        nombre: nombre.trim(),
        propietario: propietario.trim(),
        email: email.trim() || undefined,
        telefono: telefono.trim() || undefined,
        planCodigo,
        venceEn,
        graceDias,
      });
      setResultado(creada);
      setNombre('');
      setPropietario('');
      setEmail('');
      setTelefono('');
      setGraceDias(7);
      setDuracion(1);
      setVenceFecha(fechaConMeses(1));
      cerrarCrear();
      await recargar();
    } catch (fallo) {
      setErrorCrear(fallo);
    } finally {
      setCreando(false);
    }
  }

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (datos?.empresas ?? []).filter((empresa) => {
      if (estado !== 'todas' && empresa.estado !== estado) return false;
      if (!texto) return true;
      return [empresa.nombre, empresa.propietario, empresa.email ?? '', empresa.telefono ?? '']
        .join(' ')
        .toLowerCase()
        .includes(texto);
    });
  }, [datos, busqueda, estado]);

  return (
    <div className="pila">
      <EncabezadoPagina
        titulo="Empresas"
        descripcion="Cada negocio con su licencia, terminales y estado de sincronización."
        acciones={
          <Boton icono="mas" onClick={abrirCrear}>
            Nueva empresa
          </Boton>
        }
      />

      <section className="panel panel--plano">
        <div className="barra-herramientas">
          <label className="buscador">
            <Icono nombre="buscar" tamano={17} />
            <span className="visualmente-oculto">Buscar empresa</span>
            <input
              type="search"
              placeholder="Buscar por negocio, dueño o contacto…"
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
            />
          </label>
          <div className="filtros">
            <label className="filtro">
              <span>Estado</span>
              <select
                value={estado}
                onChange={(evento) => setEstado(evento.target.value as EmpresaEstado | 'todas')}
              >
                {ESTADOS.map((valor) => (
                  <option key={valor} value={valor}>
                    {valor === 'todas' ? 'Todos' : ETIQUETAS_EMPRESA[valor]}
                  </option>
                ))}
              </select>
            </label>
            <span className="contador">{filtradas.length} de {datos?.empresas.length ?? 0}</span>
          </div>
        </div>

        {error ? (
          <div className="pila pila--compacta">
            <Aviso>{mensajeError(error)}</Aviso>
            <Boton variante="secundario" icono="refrescar" onClick={() => void recargar()}>
              Reintentar
            </Boton>
          </div>
        ) : cargando && !datos ? (
          <Cargando etiqueta="Cargando empresas…" />
        ) : filtradas.length === 0 ? (
          <Vacio
            icono="edificio"
            titulo={datos?.empresas.length ? 'Sin resultados' : 'Todavía no hay empresas'}
            descripcion={
              datos?.empresas.length
                ? 'Prueba con otro texto o cambia el filtro de estado.'
                : 'Crea la primera empresa para generar su licencia y código de activación.'
            }
            accion={!datos?.empresas.length ? <Boton icono="mas" onClick={abrirCrear}>Nueva empresa</Boton> : undefined}
          />
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Contacto</th>
                  <th>Plan</th>
                  <th>Licencia</th>
                  <th className="num">Terminales</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {filtradas.map((empresa) => {
                  const licencia = datosLicencia(empresa);
                  return (
                    <tr key={empresa.id}>
                      <td>
                        <Link to={`/empresas/${empresa.id}`} className="celda-principal">
                          {empresa.nombre}
                        </Link>
                        <span className="celda-secundaria">{empresa.propietario}</span>
                      </td>
                      <td>
                        <span className="celda-secundaria">{empresa.email ?? 'Sin correo'}</span>
                        <span className="celda-secundaria">{empresa.telefono ?? 'Sin teléfono'}</span>
                      </td>
                      <td>
                        <span className="chip-plan">{empresa.planCodigo ?? '—'}</span>
                      </td>
                      <td>
                        {licencia ? (
                          <div className="celda-estado">
                            <InsigniaLicencia licencia={licencia} />
                            <MarcaVencimiento licencia={licencia} />
                          </div>
                        ) : (
                          <span className="celda-secundaria">Sin licencia</span>
                        )}
                      </td>
                      <td className="num">{empresa.dispositivos}</td>
                      <td className="acciones-fila">
                        <InsigniaEmpresa estado={empresa.estado} />
                        <Link to={`/empresas/${empresa.id}`} className="enlace-fila">
                          Ver <span aria-hidden="true">→</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        abierto={crearAbierto}
        titulo="Nueva empresa"
        descripcion="Al crearla se genera una licencia pendiente y un código de activación."
        onCerrar={cerrarCrear}
        ancho="ancho"
        pie={
          <>
            <Boton variante="fantasma" onClick={cerrarCrear} disabled={creando}>
              Cancelar
            </Boton>
            <Boton type="submit" form="formulario-empresa" cargando={creando}>
              Crear empresa y licencia
            </Boton>
          </>
        }
      >
        {errorCrear ? (
          <Aviso>
            <strong>{mensajeError(errorCrear)}</strong>
            {detallesError(errorCrear).length > 0 ? (
              <ul>
                {detallesError(errorCrear).map((detalle) => (
                  <li key={detalle}>{detalle}</li>
                ))}
              </ul>
            ) : null}
          </Aviso>
        ) : null}

        <form id="formulario-empresa" className="formulario formulario--rejilla" onSubmit={crear}>
          <Campo etiqueta="Nombre del negocio" htmlFor={idNombre} requerido ancho>
            <input
              id={idNombre}
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              placeholder="Panadería La Espiga"
              maxLength={120}
              required
              autoFocus
            />
          </Campo>
          <Campo etiqueta="Propietario" htmlFor={idPropietario} requerido>
            <input
              id={idPropietario}
              value={propietario}
              onChange={(evento) => setPropietario(evento.target.value)}
              placeholder="María Pérez"
              maxLength={120}
              required
            />
          </Campo>
          <Campo etiqueta="Correo" htmlFor={idEmail}>
            <input
              id={idEmail}
              type="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              placeholder="maria@negocio.cu"
            />
          </Campo>
          <Campo etiqueta="Teléfono" htmlFor={idTelefono}>
            <input
              id={idTelefono}
              value={telefono}
              onChange={(evento) => setTelefono(evento.target.value)}
              placeholder="+53 5 123 4567"
              maxLength={30}
            />
          </Campo>
          <Campo etiqueta="Plan" htmlFor={idPlan} requerido>
            <select
              id={idPlan}
              value={planCodigo}
              onChange={(evento) => setPlanCodigo(evento.target.value)}
              required
            >
              {planesActivos.map((plan) => (
                <option key={plan.id} value={plan.codigo}>
                  {plan.nombre}
                  {plan.maxDispositivos ? ` · ${plan.maxDispositivos} terminales` : ' · sin límite'}
                </option>
              ))}
            </select>
          </Campo>
          <SelectDuracion
            duracion={duracion}
            onCambiar={setDuracion}
            fechaPersonalizada={venceFecha}
          />
          <Campo etiqueta="Días de gracia" htmlFor={idGracia} ayuda="Margen tras el vencimiento.">
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
            <Campo
              etiqueta="Vence el"
              htmlFor={idVence}
              requerido
              ancho
              ayuda="La licencia no se activa hasta que se canjea el código o se activa desde el panel."
            >
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
        abierto={resultado !== null}
        titulo="Empresa creada"
        descripcion="La licencia quedó pendiente. Entrega este código o actívala desde la ficha."
        onCerrar={() => setResultado(null)}
        ancho="ancho"
        pie={
          <>
            <Boton variante="fantasma" onClick={() => setResultado(null)}>
              Cerrar
            </Boton>
            {resultado ? (
              <Link
                to={`/licencias/${resultado.licencia.id}`}
                className="boton boton--primario"
                onClick={() => setResultado(null)}
              >
                Ver licencia <span aria-hidden="true">→</span>
              </Link>
            ) : null}
          </>
        }
      >
        {resultado ? (
          <div className="pila pila--compacta">
            <p className="texto-suave">
              <strong>{resultado.empresa.nombre}</strong> ya tiene licencia. El código es
              reutilizable para todas las terminales del negocio mientras esté vigente.
            </p>
            <TicketCodigo
              codigo={resultado.codigoActivacion}
              expira={resultado.codigoExpiraEn}
              venceEn={resultado.licencia.venceEn}
              nota="Guárdalo ahora: no se vuelve a mostrar. Puedes generar otro código desde la licencia."
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
