import {
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { Icono, type NombreIcono } from './Iconos';

type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'peligro';

interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  icono?: NombreIcono;
  cargando?: boolean;
  compacto?: boolean;
}

export function Boton({
  variante = 'primario',
  icono,
  cargando = false,
  compacto = false,
  children,
  className,
  disabled,
  ...props
}: BotonProps) {
  return (
    <button
      type="button"
      className={[
        'boton',
        `boton--${variante}`,
        compacto ? 'boton--compacto' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || cargando}
      {...props}
    >
      {cargando ? (
        <span className="girador girador--pequeno" aria-hidden="true" />
      ) : icono ? (
        <Icono nombre={icono} tamano={compacto ? 15 : 17} />
      ) : null}
      {children}
    </button>
  );
}

type TonoBadge = 'ok' | 'warn' | 'danger' | 'neutral' | 'info';

export function Insignia({
  tono,
  children,
  punto = true,
}: {
  tono: TonoBadge;
  children: ReactNode;
  punto?: boolean;
}) {
  return (
    <span className={`insignia insignia--${tono}`}>
      {punto ? <span className="insignia__punto" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function Aviso({
  tono = 'error',
  children,
}: {
  tono?: 'error' | 'info' | 'exito';
  children: ReactNode;
}) {
  return (
    <div className={`aviso aviso--${tono}`} role={tono === 'error' ? 'alert' : 'status'}>
      <Icono nombre={tono === 'exito' ? 'check' : 'alerta'} tamano={17} />
      <div>{children}</div>
    </div>
  );
}

export function Campo({
  etiqueta,
  ayuda,
  error,
  htmlFor,
  children,
  requerido,
  ancho = false,
}: {
  etiqueta: string;
  ayuda?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  requerido?: boolean;
  ancho?: boolean;
}) {
  return (
    <div className={`campo ${ancho ? 'campo--ancho' : ''}`}>
      <label className="campo__etiqueta" htmlFor={htmlFor}>
        {etiqueta}
        {requerido ? <span className="campo__requerido"> *</span> : null}
      </label>
      {children}
      {error ? <p className="campo__error">{error}</p> : null}
      {ayuda && !error ? <p className="campo__ayuda">{ayuda}</p> : null}
    </div>
  );
}

export function Modal({
  abierto,
  titulo,
  descripcion,
  onCerrar,
  children,
  pie,
  ancho = 'normal',
}: {
  abierto: boolean;
  titulo: string;
  descripcion?: string;
  onCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: 'normal' | 'ancho';
}) {
  const tituloId = useId();

  useEffect(() => {
    if (!abierto) return;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function alPresionar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') onCerrar();
    }

    window.addEventListener('keydown', alPresionar);
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener('keydown', alPresionar);
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div className="modal-fondo" onMouseDown={onCerrar}>
      <div
        className={`modal modal--${ancho}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        onMouseDown={(evento) => evento.stopPropagation()}
      >
        <header className="modal__cabecera">
          <div>
            <h2 id={tituloId}>{titulo}</h2>
            {descripcion ? <p>{descripcion}</p> : null}
          </div>
          <button
            type="button"
            className="modal__cerrar"
            onClick={onCerrar}
            aria-label="Cerrar"
          >
            <Icono nombre="cerrar" tamano={17} />
          </button>
        </header>
        <div className="modal__cuerpo">{children}</div>
        {pie ? <footer className="modal__pie">{pie}</footer> : null}
      </div>
    </div>
  );
}

export function Confirmacion({
  abierto,
  titulo,
  descripcion,
  textoConfirmar = 'Confirmar',
  peligro = false,
  cargando = false,
  onConfirmar,
  onCerrar,
}: {
  abierto: boolean;
  titulo: string;
  descripcion: string;
  textoConfirmar?: string;
  peligro?: boolean;
  cargando?: boolean;
  onConfirmar: () => void;
  onCerrar: () => void;
}) {
  return (
    <Modal
      abierto={abierto}
      titulo={titulo}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton variante="fantasma" onClick={onCerrar} disabled={cargando}>
            Cancelar
          </Boton>
          <Boton
            variante={peligro ? 'peligro' : 'primario'}
            onClick={onConfirmar}
            cargando={cargando}
          >
            {textoConfirmar}
          </Boton>
        </>
      }
    >
      <p className="texto-confirmacion">{descripcion}</p>
    </Modal>
  );
}

export function BotonCopiar({
  texto,
  etiqueta = 'Copiar',
}: {
  texto: string;
  etiqueta?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const area = document.createElement('textarea');
      area.value = texto;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <Boton variante="secundario" compacto icono={copiado ? 'check' : 'copiar'} onClick={copiar}>
      {copiado ? 'Copiado' : etiqueta}
    </Boton>
  );
}

export function TicketCodigo({
  codigo,
  expira,
  venceEn,
  nota,
}: {
  codigo: string;
  expira: string;
  venceEn?: string;
  nota?: string;
}) {
  return (
    <div className="ticket">
      <div className="ticket__franja" aria-hidden="true" />
      <div className="ticket__cuerpo">
        <span className="ticket__etiqueta">Código de activación</span>
        <p className="ticket__codigo">{codigo}</p>
        <div className="ticket__meta">
          <span>
            <Icono nombre="reloj" tamano={14} /> Válido hasta {fechaHora(expira)}
          </span>
          {venceEn ? (
            <span>
              <Icono nombre="calendario" tamano={14} /> Licencia hasta {fecha(venceEn)}
            </span>
          ) : null}
        </div>
        <div className="ticket__acciones">
          <BotonCopiar texto={codigo} etiqueta="Copiar código" />
          <span className="ticket__nota">
            {nota ??
              'Guárdalo ahora: no se vuelve a mostrar. Puedes generar otro código cuando quieras.'}
          </span>
        </div>
      </div>
    </div>
  );
}

function fechaHora(valor: string): string {
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(valor));
}

function fecha(valor: string): string {
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(valor));
}

export function Cargando({ etiqueta = 'Cargando…' }: { etiqueta?: string }) {
  return (
    <div className="cargando">
      <span className="girador" aria-hidden="true" />
      <span>{etiqueta}</span>
    </div>
  );
}

export function Vacio({
  titulo,
  descripcion,
  accion,
  icono = 'ticket',
}: {
  titulo: string;
  descripcion: string;
  accion?: ReactNode;
  icono?: NombreIcono;
}) {
  return (
    <div className="vacio">
      <span className="vacio__icono">
        <Icono nombre={icono} tamano={26} />
      </span>
      <h3>{titulo}</h3>
      <p>{descripcion}</p>
      {accion ? <div className="vacio__accion">{accion}</div> : null}
    </div>
  );
}

export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
  volver,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
  volver?: { etiqueta: string; a: string };
}) {
  return (
    <div className="encabezado">
      <div>
        {volver ? (
          <Link to={volver.a} className="enlace-volver">
            <Icono nombre="flechaIzq" tamano={15} /> {volver.etiqueta}
          </Link>
        ) : null}
        <h1>{titulo}</h1>
        {descripcion ? <p>{descripcion}</p> : null}
      </div>
      {acciones ? <div className="encabezado__acciones">{acciones}</div> : null}
    </div>
  );
}
