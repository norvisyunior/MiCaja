import { useId, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Icono } from '../components/Iconos';
import { Aviso, Boton, Campo } from '../components/UI';
import { detallesError, mensajeError } from '../lib/errores';

export function LoginPage() {
  const { admin, login } = useAuth();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [enviando, setEnviando] = useState(false);
  const idEmail = useId();
  const idPassword = useId();

  const destino = (ubicacion.state as { desde?: string } | null)?.desde ?? '/';

  if (admin) {
    return <Navigate to={destino} replace />;
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await login(email.trim(), password);
      navegar(destino, { replace: true });
    } catch (fallo) {
      setError(fallo);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <section className="login__relato" aria-label="MiCaja Admin">
        <div className="login__marca">
          <span className="marca__simbolo marca__simbolo--claro" aria-hidden="true">
            M
          </span>
          <div>
            <strong>MiCaja</strong>
            <span>Admin</span>
          </div>
        </div>

        <div className="login__mensaje">
          <p className="eyebrow">Centro de operaciones</p>
          <h1>Cada caja, en orden.</h1>
          <p>
            Empresas, licencias y terminales en un solo lugar. Genera códigos, activa
            negocios y resuelve renovaciones sin perder el hilo.
          </p>
        </div>

        <div className="login__ticket" aria-hidden="true">
          <div className="login__ticket-franja" />
          <span>Código de activación</span>
          <strong>MICAJA-7K4P-9X2M-4TQ8</strong>
          <div>
            <span>Válido por 7 días</span>
            <span>1 negocio · 3 terminales</span>
          </div>
        </div>

        <p className="login__pie">
          <Icono nombre="candado" tamano={14} /> Acceso reservado al equipo de soporte
        </p>
      </section>

      <section className="login__formulario">
        <div className="login__caja">
          <p className="eyebrow">Acceso administrativo</p>
          <h2>Entra a tu panel</h2>
          <p className="login__ayuda">
            Usa la cuenta de administrador creada con <code>seed:admin</code>.
          </p>

          {error ? (
            <Aviso>
              <strong>{mensajeError(error)}</strong>
              {detallesError(error).length > 0 ? (
                <ul>
                  {detallesError(error).map((detalle) => (
                    <li key={detalle}>{detalle}</li>
                  ))}
                </ul>
              ) : null}
            </Aviso>
          ) : null}

          <form onSubmit={enviar} className="formulario">
            <Campo etiqueta="Correo" htmlFor={idEmail} requerido>
              <input
                id={idEmail}
                type="email"
                autoComplete="username"
                placeholder="admin@micaja.app"
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                required
                autoFocus
              />
            </Campo>
            <Campo etiqueta="Contraseña" htmlFor={idPassword} requerido>
              <input
                id={idPassword}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(evento) => setPassword(evento.target.value)}
                minLength={8}
                required
              />
            </Campo>
            <Boton type="submit" cargando={enviando} className="boton--bloque">
              Entrar al panel
            </Boton>
          </form>

          <p className="login__nota">
            ¿Problemas para entrar? Revisa que la API esté en línea y que la cuenta siga
            activa.
          </p>
        </div>
      </section>
    </div>
  );
}
