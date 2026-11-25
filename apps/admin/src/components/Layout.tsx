import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Icono, type NombreIcono } from './Iconos';

const NAVEGACION: Array<{ a: string; etiqueta: string; icono: NombreIcono; fin?: boolean }> = [
  { a: '/', etiqueta: 'Resumen', icono: 'panel', fin: true },
  { a: '/empresas', etiqueta: 'Empresas', icono: 'edificio' },
  { a: '/licencias', etiqueta: 'Licencias', icono: 'ticket' },
];

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('');
}

export function Layout() {
  const { admin, salir } = useAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const ubicacion = useLocation();

  useEffect(() => {
    setMenuAbierto(false);
  }, [ubicacion.pathname]);

  const hoy = new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <div className="app">
      <aside className={`lateral ${menuAbierto ? 'lateral--abierto' : ''}`}>
        <div className="marca">
          <span className="marca__simbolo" aria-hidden="true">
            M
          </span>
          <div>
            <strong>MiCaja</strong>
            <span>Admin</span>
          </div>
        </div>

        <p className="lateral__seccion">Operaciones</p>
        <nav className="lateral__nav" aria-label="Navegación principal">
          {NAVEGACION.map((item) => (
            <NavLink
              key={item.a}
              to={item.a}
              end={item.fin}
              className={({ isActive }) => `nav-enlace ${isActive ? 'nav-enlace--activo' : ''}`}
            >
              <Icono nombre={item.icono} tamano={18} />
              <span>{item.etiqueta}</span>
            </NavLink>
          ))}
        </nav>

        <div className="lateral__pie">
          <div className="lateral__nota">
            <Icono nombre="candado" tamano={15} />
            <span>Acciones registradas en auditoría</span>
          </div>
          <div className="lateral__admin">
            <span className="avatar">{admin ? iniciales(admin.nombre) : '?'}</span>
            <div className="lateral__admin-datos">
              <strong>{admin?.nombre ?? 'Administrador'}</strong>
              <span>{admin?.email}</span>
            </div>
            <button
              type="button"
              className="icono-boton"
              onClick={salir}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <Icono nombre="salir" tamano={18} />
            </button>
          </div>
        </div>
      </aside>

      {menuAbierto ? (
        <button
          type="button"
          className="lateral-fondo"
          aria-label="Cerrar menú"
          onClick={() => setMenuAbierto(false)}
        />
      ) : null}

      <div className="app__contenido">
        <header className="barra">
          <button
            type="button"
            className="icono-boton barra__menu"
            onClick={() => setMenuAbierto((abierto) => !abierto)}
            aria-label="Abrir menú"
          >
            <Icono nombre={menuAbierto ? 'cerrar' : 'menu'} tamano={20} />
          </button>
          <div className="barra__contexto">
            <span>MiCaja Admin</span>
            <span className="barra__separador">/</span>
            <span className="barra__fecha">{hoy}</span>
          </div>
          <div className="barra__derecha">
            <span className="barra__estado">
              <span className="barra__punto" aria-hidden="true" />
              Centro de operaciones
            </span>
          </div>
        </header>

        <main className="pagina">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
