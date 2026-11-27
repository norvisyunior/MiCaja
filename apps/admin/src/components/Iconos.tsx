import type { ReactElement } from 'react';

export type NombreIcono =
  | 'panel'
  | 'edificio'
  | 'ticket'
  | 'salir'
  | 'mas'
  | 'buscar'
  | 'copiar'
  | 'check'
  | 'flechaIzq'
  | 'refrescar'
  | 'alerta'
  | 'reloj'
  | 'usuarios'
  | 'dispositivo'
  | 'cerrar'
  | 'menu'
  | 'rayo'
  | 'candado'
  | 'calendario'
  | 'editar'
  | 'papelera'
  | 'clave'
  | 'stock'
  | 'prohibido'
  | 'ojo';

function contenido(nombre: NombreIcono): ReactElement {
  switch (nombre) {
    case 'panel':
      return (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </>
      );
    case 'edificio':
      return (
        <>
          <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
          <path d="M16 8h2a2 2 0 0 1 2 2v11" />
          <path d="M8 7h4M8 11h4M8 15h4M9 21h6" />
        </>
      );
    case 'ticket':
      return (
        <>
          <path d="M3 9V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4Z" />
          <path d="M13 5v2M13 11v2M13 17v2" />
        </>
      );
    case 'salir':
      return (
        <>
          <path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5" />
          <path d="M15 8l4 4-4 4M19 12H9" />
        </>
      );
    case 'mas':
      return <path d="M12 5v14M5 12h14" />;
    case 'buscar':
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </>
      );
    case 'copiar':
      return (
        <>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
        </>
      );
    case 'check':
      return <path d="m5 12 4 4L19 6" />;
    case 'flechaIzq':
      return <path d="M19 12H5m6-6-6 6 6 6" />;
    case 'refrescar':
      return (
        <>
          <path d="M20 11a8 8 0 0 0-14.9-3.9M4 4v5h5" />
          <path d="M4 13a8 8 0 0 0 14.9 3.9M20 20v-5h-5" />
        </>
      );
    case 'alerta':
      return (
        <>
          <path d="M12 3 2.8 19a1.5 1.5 0 0 0 1.3 2.2h15.8a1.5 1.5 0 0 0 1.3-2.2L12 3Z" />
          <path d="M12 9v4M12 17h.01" />
        </>
      );
    case 'reloj':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      );
    case 'usuarios':
      return (
        <>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
          <path d="M16 5.5a3 3 0 0 1 0 5.8M17.5 14.3a5.2 5.2 0 0 1 3 4.7" />
        </>
      );
    case 'dispositivo':
      return (
        <>
          <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
          <path d="M11 18h2" />
        </>
      );
    case 'cerrar':
      return <path d="M6 6l12 12M18 6 6 18" />;
    case 'menu':
      return <path d="M4 7h16M4 12h16M4 17h16" />;
    case 'rayo':
      return <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />;
    case 'candado':
      return (
        <>
          <rect x="4" y="10" width="16" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
        </>
      );
    case 'calendario':
      return (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
        </>
      );
    case 'editar':
      return (
        <>
          <path d="M4 20h4l10-10a2.1 2.1 0 0 0-3-3L5 17v3Z" />
          <path d="M14 7l3 3" />
        </>
      );
    case 'papelera':
      return (
        <>
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
          <path d="M10 11v5M14 11v5" />
        </>
      );
    case 'clave':
      return (
        <>
          <circle cx="8" cy="15" r="4" />
          <path d="M11 12l8-8 2 2-2 2 2 2-3 3-2-2-2 2" />
        </>
      );
    case 'stock':
      return (
        <>
          <path d="M4 8h16v12H4z" />
          <path d="M4 12h16M9 8v12M15 8v12" />
        </>
      );
    case 'prohibido':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m6 6 12 12" />
        </>
      );
    case 'ojo':
      return (
        <>
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.8" />
        </>
      );
  }
}

export function Icono({
  nombre,
  tamano = 18,
  className,
}: {
  nombre: NombreIcono;
  tamano?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tamano}
      height={tamano}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {contenido(nombre)}
    </svg>
  );
}
