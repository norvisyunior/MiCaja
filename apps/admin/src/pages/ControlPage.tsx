import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { api, apiControl, type FilaControl, type ListaControl, type ParametrosControl } from '../api/client';
import type { Empresa } from '../api/types';
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
  Vacio,
} from '../components/UI';
import { useToast } from '../components/Toast';
import type { NombreIcono } from '../components/Iconos';
import { mensajeError } from '../lib/errores';
import { configuracionRecurso, type AccionControl, type ColumnaControl } from './control/config';

const LIMITE = 25;

const ETIQUETAS_ACCION: Record<AccionControl, string> = {
  crear: 'Nuevo',
  editar: 'Editar',
  eliminar: 'Eliminar',
  'reset-pin': 'Reset PIN',
  'ajustar-stock': 'Ajustar stock',
  anular: 'Anular',
  'editar-dispositivo': 'Editar',
};

const ICONOS_ACCION: Record<AccionControl, NombreIcono> = {
  crear: 'mas',
  editar: 'editar',
  eliminar: 'papelera',
  'reset-pin': 'clave',
  'ajustar-stock': 'stock',
  anular: 'prohibido',
  'editar-dispositivo': 'editar',
};

type Listador = (parametros: ParametrosControl) => Promise<ListaControl>;

function listador(slug: string): Listador {
  switch (slug) {
    case 'usuarios': return apiControl.usuarios;
    case 'categorias': return apiControl.categorias;
    case 'productos': return apiControl.productos;
    case 'ventas': return apiControl.ventas;
    case 'turnos': return apiControl.turnos;
    case 'gastos': return apiControl.gastos;
    case 'movimientos-caja': return apiControl.movimientosCaja;
    case 'conteos': return apiControl.conteos;
    case 'dispositivos': return apiControl.dispositivos;
    case 'invitaciones': return apiControl.invitaciones;
    case 'auditoria': return apiControl.auditoria;
    default: throw new Error(`RECURSO_DESCONOCIDO_${slug}`);
  }
}

function valor(fila: FilaControl, clave: string): unknown {
  return fila[clave];
}

function mostrar(fila: FilaControl, columna: ColumnaControl): string {
  const crudo = valor(fila, columna.clave);
  if (crudo === null || crudo === undefined || crudo === '') return '—';
  if (columna.tipo === 'booleano') return crudo ? 'Sí' : 'No';
  if (columna.tipo === 'fecha' || columna.tipo === 'fechaHora') {
    const fecha = new Date(String(crudo));
    if (Number.isNaN(fecha.getTime())) return String(crudo);
    return new Intl.DateTimeFormat('es', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      ...(columna.tipo === 'fechaHora' ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(fecha);
  }
  if (columna.tipo === 'moneda') {
    return new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      Number(crudo)
    );
  }
  return String(crudo);
}

export function ControlPage() {
  const { recurso } = useParams<{ recurso: string }>();
  const configuracion = configuracionRecurso(recurso);
  const { mostrarToast } = useToast();

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<ListaControl | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [cargando, setCargando] = useState(true);
  const [accion, setAccion] = useState<{ tipo: AccionControl; fila?: FilaControl } | null>(null);
  const [formulario, setFormulario] = useState<Record<string, string>>({});
  const [categorias, setCategorias] = useState<FilaControl[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [errorAccion, setErrorAccion] = useState<unknown>(null);

  const obtenerLista = useMemo(
    () => (configuracion ? listador(configuracion.slug) : null),
    [configuracion]
  );

  const cargar = useCallback(async () => {
    if (!obtenerLista) return;
    setCargando(true);
    setError(null);
    try {
      setDatos(
        await obtenerLista({
          empresaId: empresaId || undefined,
          q: busqueda || undefined,
          page: pagina,
          limit: LIMITE,
        })
      );
    } catch (fallo) {
      setError(fallo);
    } finally {
      setCargando(false);
    }
  }, [obtenerLista, empresaId, busqueda, pagina]);

  useEffect(() => {
    api.empresas({ limit: 200 }).then((respuesta) => setEmpresas(respuesta.items)).catch(() => undefined);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    setPagina(1);
  }, [empresaId, busqueda]);

  useEffect(() => {
    if (!accion || !configuracion || configuracion.slug !== 'productos') return;
    if (accion.tipo !== 'crear' && accion.tipo !== 'editar') return;
    const empresa = formulario.empresa_id || empresaId;
    if (!empresa) {
      setCategorias([]);
      return;
    }
    apiControl
      .categorias({ empresaId: empresa, limit: 200 })
      .then((respuesta) => setCategorias(respuesta.items))
      .catch(() => setCategorias([]));
  }, [accion, configuracion, formulario.empresa_id, empresaId]);

  if (!configuracion) return <Navigate to="/" replace />;
  const config = configuracion;
  const accionesFila = config.acciones.filter((tipo) => tipo !== 'crear');

  function abrir(tipo: AccionControl, fila?: FilaControl) {
    const inicial: Record<string, string> = {};
    if (fila) {
      for (const [clave, valorCelda] of Object.entries(fila)) {
        if (valorCelda !== null && valorCelda !== undefined && typeof valorCelda !== 'object') {
          inicial[clave] = String(valorCelda);
        }
      }
    } else {
      inicial.empresa_id = empresaId;
      inicial.rol = config.slug === 'usuarios' ? 'dependiente' : '';
      inicial.activo = 'true';
      inicial.color = config.slug === 'categorias' ? '#E2E8F0' : '#0EA5E9';
      inicial.estado = 'activo';
      inicial.cantidad = '';
      inicial.motivo = '';
      inicial.reembolso_efectivo = '0';
      inicial.reembolso_digital = '0';
    }
    setFormulario(inicial);
    setErrorAccion(null);
    setAccion({ tipo, fila });
  }

  function campo(clave: string, valorNuevo: string) {
    setFormulario((actual) => ({ ...actual, [clave]: valorNuevo }));
  }

  function seleccionEmpresa() {
    return (
      <Campo etiqueta="Negocio" htmlFor="control-empresa" requerido>
        <select
          id="control-empresa"
          value={formulario.empresa_id ?? ''}
          onChange={(evento) => campo('empresa_id', evento.target.value)}
          required
        >
          <option value="">Selecciona un negocio</option>
          {empresas.map((empresa) => (
            <option key={empresa.id} value={empresa.id}>
              {empresa.nombre}
            </option>
          ))}
        </select>
      </Campo>
    );
  }

  function formularioAccion() {
    if (!accion || !configuracion) return null;
    const slug = config.slug;
    const esNuevo = !accion.fila;

    if (accion.tipo === 'eliminar') {
      return (
        <p className="texto-confirmacion">
          Esta acción marca el registro como eliminado y conserva el historial. ¿Continuar?
        </p>
      );
    }
    if (accion.tipo === 'reset-pin') {
      return (
        <p className="texto-confirmacion">
          El usuario podrá entrar con el PIN <strong>1234</strong>. Debe cambiarlo desde Ajustes.
        </p>
      );
    }
    if (accion.tipo === 'anular') {
      return (
        <div className="formulario">
          <Campo etiqueta="Motivo" requerido ancho>
            <input value={formulario.motivo ?? ''} onChange={(e) => campo('motivo', e.target.value)} required />
          </Campo>
          <Campo etiqueta="Reembolso efectivo">
            <input type="number" min="0" step="0.01" value={formulario.reembolso_efectivo ?? '0'} onChange={(e) => campo('reembolso_efectivo', e.target.value)} />
          </Campo>
          <Campo etiqueta="Reembolso digital">
            <input type="number" min="0" step="0.01" value={formulario.reembolso_digital ?? '0'} onChange={(e) => campo('reembolso_digital', e.target.value)} />
          </Campo>
        </div>
      );
    }
    if (accion.tipo === 'ajustar-stock') {
      return (
        <div className="formulario">
          <Campo etiqueta="Cantidad" ayuda="Usa signo menos para reducir existencias." requerido>
            <input type="number" step="0.001" value={formulario.cantidad ?? ''} onChange={(e) => campo('cantidad', e.target.value)} required />
          </Campo>
          <Campo etiqueta="Motivo" requerido ancho>
            <input value={formulario.motivo ?? ''} onChange={(e) => campo('motivo', e.target.value)} required />
          </Campo>
        </div>
      );
    }
    if (accion.tipo === 'editar-dispositivo') {
      return (
        <div className="formulario">
          <Campo etiqueta="Nombre">
            <input value={formulario.nombre ?? ''} onChange={(e) => campo('nombre', e.target.value)} />
          </Campo>
          <Campo etiqueta="Estado">
            <select value={formulario.estado ?? 'activo'} onChange={(e) => campo('estado', e.target.value)}>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
              <option value="bloqueado">Bloqueado</option>
            </select>
          </Campo>
        </div>
      );
    }

    if (slug === 'usuarios') {
      return (
        <div className="formulario formulario--rejilla">
          {esNuevo ? seleccionEmpresa() : null}
          <Campo etiqueta="Nombre" requerido>
            <input value={formulario.nombre ?? ''} onChange={(e) => campo('nombre', e.target.value)} required />
          </Campo>
          <Campo etiqueta="Usuario de acceso" requerido>
            <input value={formulario.usuario ?? ''} onChange={(e) => campo('usuario', e.target.value)} required />
          </Campo>
          <Campo etiqueta="Rol">
            <select value={formulario.rol ?? 'dependiente'} onChange={(e) => campo('rol', e.target.value)}>
              <option value="dependiente">Dependiente</option>
              <option value="admin">Admin</option>
              <option value="propietario">Propietario</option>
            </select>
          </Campo>
          <Campo etiqueta="Estado">
            <select value={formulario.activo ?? 'true'} onChange={(e) => campo('activo', e.target.value)}>
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </Campo>
        </div>
      );
    }

    if (slug === 'categorias') {
      return (
        <div className="formulario formulario--rejilla">
          {esNuevo ? seleccionEmpresa() : null}
          <Campo etiqueta="Nombre" requerido>
            <input value={formulario.nombre ?? ''} onChange={(e) => campo('nombre', e.target.value)} required />
          </Campo>
          <Campo etiqueta="Color">
            <input type="color" value={formulario.color ?? '#E2E8F0'} onChange={(e) => campo('color', e.target.value)} />
          </Campo>
          <Campo etiqueta="Orden">
            <input type="number" value={formulario.orden ?? '0'} onChange={(e) => campo('orden', e.target.value)} />
          </Campo>
          <Campo etiqueta="Estado">
            <select value={formulario.activo ?? 'true'} onChange={(e) => campo('activo', e.target.value)}>
              <option value="true">Activa</option>
              <option value="false">Inactiva</option>
            </select>
          </Campo>
        </div>
      );
    }

    if (slug === 'productos') {
      return (
        <div className="formulario formulario--rejilla">
          {esNuevo ? seleccionEmpresa() : null}
          <Campo etiqueta="Nombre" requerido>
            <input value={formulario.nombre ?? ''} onChange={(e) => campo('nombre', e.target.value)} required />
          </Campo>
          <Campo etiqueta="Precio" requerido>
            <input type="number" min="0" step="0.01" value={formulario.precio ?? ''} onChange={(e) => campo('precio', e.target.value)} required />
          </Campo>
          <Campo etiqueta="Categoría">
            <select value={formulario.categoria_id ?? ''} onChange={(e) => campo('categoria_id', e.target.value)}>
              <option value="">Sin categoría</option>
              {categorias.map((categoria) => (
                <option key={String(categoria.id)} value={String(categoria.id)}>
                  {String(categoria.nombre)}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Costo">
            <input type="number" min="0" step="0.01" value={formulario.costo_unitario ?? ''} onChange={(e) => campo('costo_unitario', e.target.value)} />
          </Campo>
          <Campo etiqueta="Stock mínimo">
            <input type="number" min="0" step="0.001" value={formulario.stock_minimo ?? '0'} onChange={(e) => campo('stock_minimo', e.target.value)} />
          </Campo>
          <Campo etiqueta="Estado">
            <select value={formulario.activo ?? 'true'} onChange={(e) => campo('activo', e.target.value)}>
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </Campo>
        </div>
      );
    }

    return null;
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!accion || (!accion.fila && accion.tipo !== 'crear')) return;
    const id = accion.fila?.id as string | undefined;
    const slug = config.slug;
    setGuardando(true);
    setErrorAccion(null);
    const empresa = formulario.empresa_id || empresaId;
    const activo = formulario.activo === 'true';
    try {
      if (accion.tipo === 'crear') {
        if (slug === 'usuarios') {
          await apiControl.crearUsuario({ empresaId: empresa, nombre: formulario.nombre, usuario: formulario.usuario, rol: formulario.rol, activo });
        } else if (slug === 'categorias') {
          await apiControl.crearCategoria({ empresaId: empresa, nombre: formulario.nombre, color: formulario.color, orden: Number(formulario.orden ?? 0), activo });
        } else if (slug === 'productos') {
          await apiControl.crearProducto({
            empresaId: empresa,
            categoriaId: formulario.categoria_id || null,
            nombre: formulario.nombre,
            precio: Number(formulario.precio),
            costoUnitario: formulario.costo_unitario ? Number(formulario.costo_unitario) : null,
            stockMinimo: Number(formulario.stock_minimo ?? 0),
            activo,
          });
        }
      } else if (accion.tipo === 'editar') {
        if (slug === 'usuarios') {
          await apiControl.editarUsuario(id!, { nombre: formulario.nombre, usuario: formulario.usuario, rol: formulario.rol, activo });
        } else if (slug === 'categorias') {
          await apiControl.editarCategoria(id!, { nombre: formulario.nombre, color: formulario.color, orden: Number(formulario.orden ?? 0), activo });
        } else if (slug === 'productos') {
          await apiControl.editarProducto(id!, {
            categoriaId: formulario.categoria_id || null,
            nombre: formulario.nombre,
            precio: Number(formulario.precio),
            costoUnitario: formulario.costo_unitario ? Number(formulario.costo_unitario) : null,
            stockMinimo: Number(formulario.stock_minimo ?? 0),
            activo,
          });
        }
      } else if (accion.tipo === 'eliminar') {
        if (slug === 'usuarios') await apiControl.eliminarUsuario(id!);
        if (slug === 'categorias') await apiControl.eliminarCategoria(id!);
        if (slug === 'productos') await apiControl.eliminarProducto(id!);
      } else if (accion.tipo === 'reset-pin') {
        await apiControl.resetPinUsuario(id!);
      } else if (accion.tipo === 'ajustar-stock') {
        await apiControl.ajustarStock(id!, Number(formulario.cantidad), formulario.motivo);
      } else if (accion.tipo === 'anular') {
        await apiControl.anularVenta(id!, {
          motivo: formulario.motivo,
          reembolsoEfectivo: Number(formulario.reembolso_efectivo ?? 0),
          reembolsoDigital: Number(formulario.reembolso_digital ?? 0),
        });
      } else if (accion.tipo === 'editar-dispositivo') {
        await apiControl.editarDispositivo(id!, {
          nombre: formulario.nombre || undefined,
          estado: formulario.estado,
        });
      }
      mostrarToast('Cambio guardado correctamente.');
      setAccion(null);
      await cargar();
    } catch (fallo) {
      setErrorAccion(fallo);
    } finally {
      setGuardando(false);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil((datos?.total ?? 0) / LIMITE));
  const tituloAccion = accion ? `${ETIQUETAS_ACCION[accion.tipo]}: ${configuracion.titulo}` : '';

  return (
    <div className="pila">
      <EncabezadoPagina titulo={configuracion.titulo} descripcion={configuracion.descripcion} />

      <section className="panel panel--plano">
        <div className="barra-herramientas">
          <label className="buscador">
            <span className="visualmente-oculto">Buscar</span>
            <input
              type="search"
              placeholder="Buscar…"
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
            />
          </label>
          <div className="filtros">
            <label className="filtro">
              <span>Negocio</span>
              <select value={empresaId} onChange={(evento) => setEmpresaId(evento.target.value)}>
                <option value="">Todos</option>
                {empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.nombre}
                  </option>
                ))}
              </select>
            </label>
            {configuracion.acciones.includes('crear') ? (
              <Boton icono="mas" onClick={() => abrir('crear')}>Nuevo</Boton>
            ) : null}
            <span className="contador">{datos?.total ?? 0} registros</span>
          </div>
        </div>

        {error ? (
          <div className="pila pila--compacta">
            <Aviso>{mensajeError(error)}</Aviso>
            <Boton variante="secundario" icono="refrescar" onClick={() => void cargar()}>Reintentar</Boton>
          </div>
        ) : cargando && !datos ? (
          <Cargando etiqueta="Cargando registros…" />
        ) : !datos?.items.length ? (
          <Vacio titulo="Sin resultados" descripcion="Prueba con otro texto o cambia el negocio." />
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla tabla--compacta">
                <thead>
                  <tr>
                    {configuracion.columnas.map((columna) => (
                      <th key={columna.clave}>{columna.etiqueta}</th>
                    ))}
                    {accionesFila.length ? <th aria-label="Acciones" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {datos.items.map((fila, indice) => (
                    <tr key={String(fila.id ?? fila.clave ?? indice)}>
                      {configuracion.columnas.map((columna) => {
                        const texto = mostrar(fila, columna);
                        return (
                          <td key={columna.clave}>
                            {columna.tipo === 'booleano' || columna.tipo === 'insignia' ? (
                              <Insignia tono={columna.tipo === 'booleano' && fila[columna.clave] ? 'ok' : 'neutral'} punto={false}>
                                {texto}
                              </Insignia>
                            ) : (
                              <span className="celda-principal">{texto}</span>
                            )}
                            {columna.secundaria ? (
                              <span className="celda-secundaria">{mostrar(fila, { clave: columna.secundaria, etiqueta: '' })}</span>
                            ) : null}
                          </td>
                        );
                      })}
                      {accionesFila.length ? (
                        <td className="acciones-fila">
                          <div className="acciones-grupo">
                            {accionesFila.map((tipo) => (
                              <BotonIcono
                                key={tipo}
                                variante={tipo === 'eliminar' || tipo === 'anular' ? 'peligro' : 'fantasma'}
                                icono={ICONOS_ACCION[tipo]}
                                etiqueta={ETIQUETAS_ACCION[tipo]}
                                onClick={() => abrir(tipo, fila)}
                              />
                            ))}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion
              pagina={pagina}
              totalPaginas={totalPaginas}
              total={datos.total}
              onCambiar={setPagina}
            />
          </>
        )}
      </section>

      <Modal
        abierto={Boolean(accion)}
        titulo={tituloAccion}
        onCerrar={() => setAccion(null)}
        ancho="ancho"
        pie={
          <>
            <Boton variante="fantasma" onClick={() => setAccion(null)} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton
              variante={accion?.tipo === 'eliminar' || accion?.tipo === 'anular' ? 'peligro' : 'primario'}
              type="submit"
              form="formulario-control"
              cargando={guardando}
            >
              Guardar
            </Boton>
          </>
        }
      >
        {errorAccion ? <Aviso>{mensajeError(errorAccion)}</Aviso> : null}
        <form id="formulario-control" onSubmit={guardar}>
          {formularioAccion()}
        </form>
      </Modal>
    </div>
  );
}
