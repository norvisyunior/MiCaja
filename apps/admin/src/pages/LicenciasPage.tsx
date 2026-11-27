import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { InsigniaLicencia, MarcaVencimiento } from '../components/Estados';
import { Icono } from '../components/Iconos';
import {
  Aviso,
  Boton,
  BotonIcono,
  Cargando,
  EncabezadoPagina,
  Paginacion,
  Vacio,
} from '../components/UI';
import { useCargar } from '../hooks/useCargar';
import { mensajeError } from '../lib/errores';
import { fecha, plural } from '../lib/format';

type Filtro = 'todas' | 'activa' | 'gracia' | 'pendiente' | 'vencida' | 'suspendida';

const LIMITE = 25;

const FILTROS: Array<{ valor: Filtro; etiqueta: string }> = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'activa', etiqueta: 'Activas' },
  { valor: 'gracia', etiqueta: 'En gracia' },
  { valor: 'pendiente', etiqueta: 'Pendientes' },
  { valor: 'vencida', etiqueta: 'Vencidas' },
  { valor: 'suspendida', etiqueta: 'Suspendidas' },
];

export function LicenciasPage() {
  const navegar = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [pagina, setPagina] = useState(1);
  const { datos, error, cargando, recargar } = useCargar(
    () =>
      api.licencias({
        q: busqueda || undefined,
        estado: filtro,
        page: pagina,
        limit: LIMITE,
      }),
    [busqueda, filtro, pagina]
  );

  useEffect(() => {
    setPagina(1);
  }, [busqueda, filtro]);

  const conteos = datos?.conteos ?? { activas: 0, gracia: 0, vencidas: 0, pendientes: 0 };
  const filas = datos?.items ?? [];
  const totalPaginas = Math.max(1, Math.ceil((datos?.total ?? 0) / LIMITE));

  return (
    <div className="pila">
      <EncabezadoPagina
        titulo="Licencias"
        descripcion="Vigencias, códigos y estado de cada negocio."
        acciones={
          <Link to="/empresas?nueva=1" className="boton boton--primario">
            <Icono nombre="mas" tamano={17} /> Nueva empresa
          </Link>
        }
      />

      <div className="tira-estados">
        <button
          type="button"
          className={`tira-estados__item ${filtro === 'activa' ? 'tira-estados__item--activo' : ''}`}
          onClick={() => setFiltro(filtro === 'activa' ? 'todas' : 'activa')}
        >
          <span className="punto punto--ok" />
          <strong>{conteos.activas}</strong> activas
        </button>
        <button
          type="button"
          className={`tira-estados__item ${filtro === 'gracia' ? 'tira-estados__item--activo' : ''}`}
          onClick={() => setFiltro(filtro === 'gracia' ? 'todas' : 'gracia')}
        >
          <span className="punto punto--aviso" />
          <strong>{conteos.gracia}</strong> en gracia
        </button>
        <button
          type="button"
          className={`tira-estados__item ${filtro === 'vencida' ? 'tira-estados__item--activo' : ''}`}
          onClick={() => setFiltro(filtro === 'vencida' ? 'todas' : 'vencida')}
        >
          <span className="punto punto--peligro" />
          <strong>{conteos.vencidas}</strong> vencidas
        </button>
        <button
          type="button"
          className={`tira-estados__item ${filtro === 'pendiente' ? 'tira-estados__item--activo' : ''}`}
          onClick={() => setFiltro(filtro === 'pendiente' ? 'todas' : 'pendiente')}
        >
          <span className="punto punto--neutro" />
          <strong>{conteos.pendientes}</strong> pendientes
        </button>
      </div>

      <section className="panel panel--plano">
        <div className="barra-herramientas">
          <label className="buscador">
            <Icono nombre="buscar" tamano={17} />
            <span className="visualmente-oculto">Buscar licencia</span>
            <input
              type="search"
              placeholder="Buscar por negocio o plan…"
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
            />
          </label>
          <div className="filtros">
            <label className="filtro">
              <span>Estado</span>
              <select
                value={filtro}
                onChange={(evento) => setFiltro(evento.target.value as Filtro)}
              >
                {FILTROS.map((opcion) => (
                  <option key={opcion.valor} value={opcion.valor}>
                    {opcion.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <span className="contador">
              {plural(datos?.total ?? 0, 'licencia', 'licencias')}
            </span>
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
          <Cargando etiqueta="Cargando licencias…" />
        ) : filas.length === 0 ? (
          <Vacio
            icono="ticket"
            titulo={datos?.total ? 'Sin resultados' : 'Todavía no hay licencias'}
            descripcion={
              datos?.total
                ? 'Prueba con otro texto o cambia el filtro.'
                : 'Crea una empresa para generar su primera licencia.'
            }
            accion={
              !datos?.total ? (
                <Link to="/empresas?nueva=1" className="boton boton--primario">
                  <Icono nombre="mas" tamano={17} /> Nueva empresa
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="tabla-contenedor">
              <table className="tabla">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Plan</th>
                  <th>Estado</th>
                  <th>Vencimiento</th>
                  <th className="num">Terminales</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {filas.map((licencia) => (
                  <tr key={licencia.id}>
                    <td>
                      <Link
                        to={`/licencias/${licencia.id}`}
                        className="celda-principal"
                      >
                        {licencia.empresaNombre}
                      </Link>
                      <span className="celda-secundaria">
                        {licencia.planNombre ?? licencia.planCodigo}
                      </span>
                    </td>
                    <td>
                      <span className="chip-plan">{licencia.planCodigo}</span>
                    </td>
                    <td>
                      <div className="celda-estado">
                        <InsigniaLicencia licencia={licencia} />
                        <MarcaVencimiento licencia={licencia} />
                      </div>
                    </td>
                    <td>{fecha(licencia.venceEn)}</td>
                    <td className="num">{licencia.dispositivos}</td>
                    <td className="acciones-fila">
                      <div className="acciones-grupo">
                        <BotonIcono
                          icono="ojo"
                          etiqueta={`Gestionar licencia de ${licencia.empresaNombre}`}
                          onClick={() => navegar(`/licencias/${licencia.id}`)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
            <Paginacion
              pagina={pagina}
              totalPaginas={totalPaginas}
              total={datos?.total}
              onCambiar={setPagina}
            />
          </>
        )}
      </section>
    </div>
  );
}
