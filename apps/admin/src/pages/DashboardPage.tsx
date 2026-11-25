import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Icono, type NombreIcono } from '../components/Iconos';
import { InsigniaLicencia, MarcaVencimiento } from '../components/Estados';
import { Aviso, Boton, Cargando, EncabezadoPagina, Vacio } from '../components/UI';
import { useCargar } from '../hooks/useCargar';
import { mensajeError } from '../lib/errores';
import { ETIQUETAS_EVENTO, fechaHoraCorta } from '../lib/format';

function saludo(): string {
  const hora = new Date().getHours();
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function iconoEvento(tipo: string): NombreIcono {
  if (tipo === 'activada' || tipo === 'reactivada') return 'rayo';
  if (tipo === 'renovada') return 'refrescar';
  if (tipo === 'suspendida' || tipo === 'vencida') return 'alerta';
  return 'ticket';
}

export function DashboardPage() {
  const { datos, error, cargando, recargar } = useCargar(() => api.resumen(), []);

  if (cargando && !datos) return <Cargando etiqueta="Leyendo el estado de la plataforma…" />;
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
  const c = datos.conteos;
  const porAtender =
    c.licenciasVencidas + c.licenciasEnGracia + c.licenciasPorVencer + c.licenciasPendientes;

  return (
    <div className="pila">
      <EncabezadoPagina
        titulo={`${saludo()}.`}
        descripcion={
          porAtender > 0
            ? `Hay ${porAtender} licencia${porAtender === 1 ? '' : 's'} que necesitan una mirada.`
            : 'Todo en orden: no hay licencias vencidas ni por vencer en los próximos 30 días.'
        }
        acciones={
          <>
            <Boton variante="secundario" icono="refrescar" onClick={() => void recargar()}>
              Actualizar
            </Boton>
            <Link to="/empresas?nueva=1" className="boton boton--primario">
              <Icono nombre="mas" tamano={17} /> Nueva empresa
            </Link>
          </>
        }
      />

      <section className="metricas" aria-label="Indicadores principales">
        <article className="metrica">
          <span className="metrica__icono">
            <Icono nombre="edificio" tamano={18} />
          </span>
          <span className="metrica__etiqueta">Empresas</span>
          <strong className="metrica__valor">{c.empresasTotal}</strong>
          <span className="metrica__nota">
            {c.empresasActivas} activas · {c.empresasPendientes} pendientes
          </span>
        </article>
        <article className="metrica">
          <span className="metrica__icono metrica__icono--ok">
            <Icono nombre="ticket" tamano={18} />
          </span>
          <span className="metrica__etiqueta">Licencias activas</span>
          <strong className="metrica__valor">{c.licenciasActivas}</strong>
          <span className="metrica__nota">
            {c.licenciasEnGracia > 0
              ? `${c.licenciasEnGracia} en período de gracia`
              : 'Ninguna en gracia'}
          </span>
        </article>
        <article className="metrica">
          <span className="metrica__icono metrica__icono--aviso">
            <Icono nombre="reloj" tamano={18} />
          </span>
          <span className="metrica__etiqueta">Por vencer</span>
          <strong className="metrica__valor">{c.licenciasPorVencer}</strong>
          <span className="metrica__nota">Próximos 30 días</span>
        </article>
        <article className="metrica">
          <span className="metrica__icono">
            <Icono nombre="dispositivo" tamano={18} />
          </span>
          <span className="metrica__etiqueta">Terminales activas</span>
          <strong className="metrica__valor">{c.dispositivosActivos}</strong>
          <span className="metrica__nota">{c.dispositivos24h} sincronizaron hoy</span>
        </article>
      </section>

      <div className="rejilla-dos">
        <section className="panel">
          <div className="panel__cabecera">
            <div>
              <h2>Requieren atención</h2>
              <p>Vencidas, pendientes o con vencimiento cercano.</p>
            </div>
            <Link to="/licencias" className="enlace">
              Ver licencias <span aria-hidden="true">→</span>
            </Link>
          </div>

          {datos.atencion.length === 0 ? (
            <Vacio
              icono="check"
              titulo="Nada pendiente"
              descripcion="Todas las licencias están activas y con margen suficiente."
            />
          ) : (
            <div className="lista-atencion">
              {datos.atencion.map((licencia) => (
                <Link
                  key={licencia.id}
                  to={`/licencias/${licencia.id}`}
                  className="atencion"
                >
                  <div className="atencion__principal">
                    <strong>{licencia.empresaNombre}</strong>
                    <span className="atencion__detalle">
                      Plan {licencia.planCodigo} · <MarcaVencimiento licencia={licencia} />
                    </span>
                  </div>
                  <InsigniaLicencia licencia={licencia} />
                  <span className="atencion__flecha" aria-hidden="true">
                    →
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel__cabecera">
            <div>
              <h2>Actividad reciente</h2>
              <p>Últimos movimientos de licencias.</p>
            </div>
          </div>

          {datos.eventos.length === 0 ? (
            <Vacio
              titulo="Sin actividad"
              descripcion="Las activaciones y renovaciones aparecerán aquí."
            />
          ) : (
            <ol className="bitacora">
              {datos.eventos.map((evento) => (
                <li key={evento.id} className="bitacora__item">
                  <span className="bitacora__icono">
                    <Icono nombre={iconoEvento(evento.tipo)} tamano={15} />
                  </span>
                  <div>
                    <strong>{ETIQUETAS_EVENTO[evento.tipo] ?? evento.tipo}</strong>
                    <span>{evento.empresaNombre}</span>
                  </div>
                  <time dateTime={evento.createdAt}>{fechaHoraCorta(evento.createdAt)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
