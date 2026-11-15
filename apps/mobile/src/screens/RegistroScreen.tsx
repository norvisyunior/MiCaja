import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { registrarCuenta, type RespuestaActivacion } from '../api/cliente';
import { activarConCodigo } from '../sync/activacion';
import { crearUsuario, existeNombreUsuario } from '../db/repos/catalogo';
import { guardarSetting } from '../db/repos/settings';
import { useSesion } from '../store/sesion';
import { useTema } from '../store/tema';
import { Boton, Campo, Gradiente, Pantalla, Tarjeta } from '../components/UI';
import { fuentes, gradientes, radius, spacing, typography } from '../theme';
import { esPinValido } from '../utils/pin';
import {
  esUsuarioValido,
  generarUsuarioDesdeNombre,
  normalizarUsuario,
} from '../utils/usuario';

function mensajeDeError(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar el registro.';
}

export default function RegistroScreen({
  onAtras,
  onConfigurarLocal,
}: {
  onAtras: () => void;
  onConfigurarLocal: () => void;
}) {
  const db = useSQLiteContext();
  const iniciar = useSesion((s) => s.iniciar);
  const { colores } = useTema();

  const [nombreNegocio, setNombreNegocio] = useState('');
  const [propietario, setPropietario] = useState('');
  const [email, setEmail] = useState('');
  const [usuario, setUsuario] = useState('');
  const [usuarioTocado, setUsuarioTocado] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [codigoPendiente, setCodigoPendiente] = useState<string | null>(null);
  const [activacionLista, setActivacionLista] = useState<RespuestaActivacion | null>(null);

  const usuarioLimpio = normalizarUsuario(usuario);
  const negocioLimpio = nombreNegocio.trim();
  const adminLimpio = propietario.trim();

  function validar(): boolean {
    if (!negocioLimpio) {
      setError('Escribe el nombre de tu negocio.');
      return false;
    }
    if (!adminLimpio) {
      setError('Escribe el nombre del administrador.');
      return false;
    }
    if (!esUsuarioValido(usuarioLimpio)) {
      setError('El usuario debe tener de 3 a 20 caracteres: letras, números, punto, guion o guion bajo.');
      return false;
    }
    if (!esPinValido(pin)) {
      setError('La contraseña debe tener exactamente 4 dígitos.');
      return false;
    }
    if (pin !== confirmacion) {
      setError('Las dos contraseñas no coinciden.');
      return false;
    }
    return true;
  }

  async function crearAdministrador(activacion: RespuestaActivacion) {
    if (await existeNombreUsuario(db, usuarioLimpio)) {
      throw new Error('Ese nombre de usuario ya está en uso en este dispositivo.');
    }

    await guardarSetting(db, 'nombre_negocio', activacion.empresa.nombre || negocioLimpio);
    const id = await crearUsuario(db, {
      nombre: adminLimpio,
      usuario: usuarioLimpio,
      rol: 'admin',
      activo: true,
      pin,
    });
    iniciar({ id, nombre: adminLimpio, usuario: usuarioLimpio, rol: 'admin', activo: true });
  }

  async function crearCuenta() {
    if (guardando) return;
    if (!validar()) return;

    setError(null);
    setGuardando(true);
    setCodigoPendiente(null);
    setActivacionLista(null);

    let registro;
    try {
      if (await existeNombreUsuario(db, usuarioLimpio)) {
        setError('Ese nombre de usuario ya está en uso en este dispositivo.');
        return;
      }

      registro = await registrarCuenta(db, {
        nombre: negocioLimpio,
        propietario: adminLimpio,
        email: email.trim() || undefined,
      });
      setCodigoPendiente(registro.codigoActivacion);
    } catch (fallo) {
      setError(mensajeDeError(fallo));
      return;
    } finally {
      setGuardando(false);
    }

    setGuardando(true);
    try {
      const activacion = await activarConCodigo(db, registro.codigoActivacion, negocioLimpio);
      setActivacionLista(activacion);
      await crearAdministrador(activacion);
    } catch (fallo) {
      setError(
        `La cuenta se creó, pero no se pudo activar este dispositivo. ${mensajeDeError(fallo)}`
      );
    } finally {
      setGuardando(false);
    }
  }

  async function reintentarActivacion() {
    if (!codigoPendiente || guardando) return;
    setError(null);
    setGuardando(true);
    try {
      const activacion = await activarConCodigo(db, codigoPendiente, negocioLimpio);
      setActivacionLista(activacion);
      await crearAdministrador(activacion);
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setGuardando(false);
    }
  }

  async function crearAdminPendiente() {
    if (!activacionLista || guardando) return;
    setError(null);
    setGuardando(true);
    try {
      await crearAdministrador(activacionLista);
    } catch (fallo) {
      setError(mensajeDeError(fallo));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Pantalla>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.contenido}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={onAtras}
            hitSlop={8}
            style={({ pressed }) => [styles.volver, pressed && { opacity: 0.6 }]}
          >
            <MaterialIcons name="arrow-back" size={20} color={colores.textoSuave} />
            <Text style={[styles.volverTexto, { color: colores.textoSuave }]}>Volver</Text>
          </Pressable>

          <View style={styles.hero}>
            <Gradiente colores={gradientes.primario} estilo={styles.logo}>
              <MaterialIcons name="person-add" size={34} color="#FFFFFF" />
            </Gradiente>
            <Text style={[styles.titulo, { color: colores.texto }]}>Crea tu cuenta</Text>
            <Text style={[styles.subtitulo, { color: colores.textoSuave }]}>
              Registra tu negocio y activa este dispositivo en un solo paso.
            </Text>
          </View>

          <Tarjeta estilo={styles.tarjeta}>
            <Campo
              etiqueta="Nombre del negocio"
              valor={nombreNegocio}
              onChange={setNombreNegocio}
              placeholder="Ej.: Bodega La Esquina"
              icono="storefront"
              autoFocus
            />
            <Campo
              etiqueta="Nombre del administrador"
              valor={propietario}
              onChange={(texto) => {
                setPropietario(texto);
                if (!usuarioTocado) setUsuario(generarUsuarioDesdeNombre(texto));
              }}
              placeholder="Ej.: María"
              icono="person"
            />
            <Campo
              etiqueta="Correo (opcional)"
              valor={email}
              onChange={setEmail}
              placeholder="tu@correo.com"
              icono="alternate-email"
              teclado="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
            />
            <Campo
              etiqueta="Usuario de acceso"
              valor={usuario}
              onChange={(texto) => {
                setUsuarioTocado(true);
                setUsuario(texto.replace(/\s/g, '').toLowerCase());
              }}
              placeholder="Ej.: maria"
              icono="alternate-email"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              maxLength={20}
            />
            <Campo
              etiqueta="Contraseña (4 dígitos)"
              valor={pin}
              onChange={(texto) => setPin(texto.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              teclado="numeric"
              seguro
              maxLength={4}
              icono="lock"
              autoComplete="new-password"
            />
            <Campo
              etiqueta="Confirmar contraseña"
              valor={confirmacion}
              onChange={(texto) => setConfirmacion(texto.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              teclado="numeric"
              seguro
              maxLength={4}
              icono="lock-outline"
              autoComplete="new-password"
            />

            {error ? (
              <View style={[styles.error, { backgroundColor: colores.peligroSuave }]}>
                <MaterialIcons name="error-outline" size={18} color={colores.peligro} />
                <Text style={[styles.errorTexto, { color: colores.peligro }]}>{error}</Text>
              </View>
            ) : null}

            {codigoPendiente ? (
              <View
                style={[
                  styles.codigo,
                  { backgroundColor: colores.infoSuave, borderColor: colores.info + '33' },
                ]}
              >
                <Text style={[styles.codigoEtiqueta, { color: colores.info }]}>
                  Código de activación
                </Text>
                <Text selectable style={[styles.codigoValor, { color: colores.texto }]}>
                  {codigoPendiente}
                </Text>
                <Text style={[styles.codigoAyuda, { color: colores.textoSuave }]}>
                  Guárdalo. Puedes reintentar la activación ahora o usarlo más tarde.
                </Text>
              </View>
            ) : null}

            {activacionLista ? (
              <Boton
                titulo="Crear administrador"
                icono="admin-panel-settings"
                tamanio="lg"
                cargando={guardando}
                onPress={crearAdminPendiente}
                estilo={{ marginTop: spacing.sm }}
              />
            ) : codigoPendiente ? (
              <Boton
                titulo="Reintentar activación"
                icono="phonelink-lock"
                tamanio="lg"
                cargando={guardando}
                onPress={reintentarActivacion}
                estilo={{ marginTop: spacing.sm }}
              />
            ) : (
              <Boton
                titulo="Crear cuenta y activar"
                icono="rocket-launch"
                tamanio="lg"
                cargando={guardando}
                onPress={crearCuenta}
                estilo={{ marginTop: spacing.sm }}
              />
            )}

            <Boton
              titulo="Configurar sin conexión"
              icono="wifi-off"
              variante="fantasma"
              tamanio="sm"
              onPress={onConfigurarLocal}
              estilo={{ marginTop: spacing.sm }}
            />
          </Tarjeta>
        </ScrollView>
      </KeyboardAvoidingView>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  contenido: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  volver: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginBottom: spacing.md,
  },
  volverTexto: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.medium,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    fontSize: typography.tituloGrande,
    fontFamily: fuentes.bold,
    marginTop: spacing.lg,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitulo: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.regular,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  tarjeta: {
    width: '100%',
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorTexto: {
    flex: 1,
    fontFamily: fuentes.semibold,
    fontSize: typography.cuerpoChico,
    lineHeight: 18,
  },
  codigo: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 4,
  },
  codigoEtiqueta: {
    fontSize: typography.micro,
    fontFamily: fuentes.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  codigoValor: {
    fontSize: typography.subtitulo,
    fontFamily: fuentes.extrabold,
    letterSpacing: 1.2,
  },
  codigoAyuda: {
    fontSize: typography.micro,
    fontFamily: fuentes.regular,
    lineHeight: 16,
  },
});
