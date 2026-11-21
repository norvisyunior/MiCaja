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
import { CLAVE_CODIGO_PENDIENTE } from '../api/config';
import { activarConCodigo } from '../sync/activacion';
import { crearUsuario, existeNombreUsuario } from '../db/repos/catalogo';
import { guardarSetting } from '../db/repos/settings';
import { useSesion } from '../store/sesion';
import { useTema } from '../store/tema';
import type { Usuario } from '../types';
import {
  Boton,
  Campo,
  Encabezado,
  Exito,
  Pantalla,
  Superficie,
  TarjetaAviso,
} from '../components/UI';
import { PantallaCodigoRecuperacion } from '../components/CodigoRecuperacion';
import { fuentes, radius, spacing, typography } from '../theme';
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
  const [usuario, setUsuario] = useState('');
  const [usuarioTocado, setUsuarioTocado] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [codigoPendiente, setCodigoPendiente] = useState<string | null>(null);
  const [activacionLista, setActivacionLista] = useState<RespuestaActivacion | null>(null);
  const [usuarioCreado, setUsuarioCreado] = useState<Usuario | null>(null);
  const [codigoRecuperacion, setCodigoRecuperacion] = useState<string | null>(null);
  const [mostrarPin, setMostrarPin] = useState(false);
  const [cuentaCreadaAceptada, setCuentaCreadaAceptada] = useState(false);

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
    const { id, codigoRecuperacion: codigo } = await crearUsuario(db, {
      nombre: adminLimpio,
      usuario: usuarioLimpio,
      rol: 'admin',
      activo: true,
      pin,
    });
    setUsuarioCreado({
      id,
      nombre: adminLimpio,
      usuario: usuarioLimpio,
      rol: 'admin',
      activo: true,
    });
    setCodigoRecuperacion(codigo);
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
      await guardarSetting(db, CLAVE_CODIGO_PENDIENTE, '');
      await crearAdministrador(activacion);
    } catch (fallo) {
      // El código queda guardado para reintentar la activación más tarde.
      await guardarSetting(db, CLAVE_CODIGO_PENDIENTE, registro.codigoActivacion);
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
      await guardarSetting(db, CLAVE_CODIGO_PENDIENTE, '');
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

  if (codigoRecuperacion && usuarioCreado && !cuentaCreadaAceptada) {
    return (
      <Pantalla>
        <Encabezado titulo="Cuenta creada" />
        <Superficie>
          <ScrollView contentContainerStyle={styles.contenidoExito}>
            <Exito
              titulo="¡Cuenta creada!"
              mensaje="Tu negocio ha sido registrado correctamente."
            >
              <TarjetaAviso
                icono="warning"
                titulo="Licencia pendiente"
                mensaje="Tu cuenta está activa, pero requiere una licencia para realizar ventas."
                tono="advertencia"
              />
              <Boton
                titulo="Entrar"
                tamanio="lg"
                onPress={() => setCuentaCreadaAceptada(true)}
                estilo={{ marginTop: spacing.lg }}
              />
            </Exito>
          </ScrollView>
        </Superficie>
      </Pantalla>
    );
  }

  if (codigoRecuperacion && usuarioCreado) {
    return (
      <PantallaCodigoRecuperacion
        nombre={usuarioCreado.nombre}
        codigo={codigoRecuperacion}
        textoBoton="Entrar a la caja"
        onContinuar={() => iniciar(usuarioCreado)}
      />
    );
  }

  return (
    <Pantalla>
      <Encabezado titulo="Crear cuenta" onAtras={onAtras} />
      <Superficie>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.contenido}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.logo, { backgroundColor: colores.primarioSuave }]}>
              <MaterialIcons name="person-add" size={30} color={colores.primario} />
            </View>
            <Text style={[styles.titulo, { color: colores.texto }]}>Crear cuenta</Text>
            <Text style={[styles.subtitulo, { color: colores.textoSuave }]}>
              Registra tu negocio para comenzar
            </Text>

            <View style={styles.form}>
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
                etiqueta="Usuario de acceso"
                valor={usuario}
                onChange={(texto) => {
                  setUsuarioTocado(true);
                  setUsuario(texto.replace(/\s/g, '').toLowerCase());
                }}
                placeholder="Ej.: usuario123"
                icono="alternate-email"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                maxLength={20}
              />
              <Campo
                etiqueta="Contraseña"
                valor={pin}
                onChange={(texto) => {
                  const limpio = texto.replace(/\D/g, '').slice(0, 4);
                  setPin(limpio);
                  setConfirmacion(limpio);
                }}
                placeholder="••••"
                teclado="numeric"
                seguro={!mostrarPin}
                maxLength={4}
                icono="lock"
                autoComplete="new-password"
                derecha={
                  <Pressable
                    onPress={() => setMostrarPin((v) => !v)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={mostrarPin ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    style={({ pressed }) => [styles.ojo, pressed && { opacity: 0.55 }]}
                  >
                    <MaterialIcons
                      name={mostrarPin ? 'visibility-off' : 'visibility'}
                      size={20}
                      color={colores.textoSuave}
                    />
                  </Pressable>
                }
              />

              {error ? (
                <View style={[styles.error, { backgroundColor: colores.peligroSuave }]}>
                  <MaterialIcons name="error-outline" size={18} color={colores.peligro} />
                  <Text style={[styles.errorTexto, { color: colores.peligro }]}>{error}</Text>
                </View>
              ) : null}

              {codigoPendiente ? (
                <View style={[styles.codigo, { backgroundColor: colores.infoSuave }]}>
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
                  titulo="Crear cuenta"
                  tamanio="lg"
                  cargando={guardando}
                  onPress={crearCuenta}
                  estilo={{ marginTop: spacing.sm }}
                />
              )}

              <Text style={[styles.terminos, { color: colores.textoSuave }]}>
                Al continuar aceptas nuestros Términos y Condiciones
              </Text>

              <Boton
                titulo="Configurar sin conexión"
                icono="wifi-off"
                variante="fantasma"
                tamanio="sm"
                onPress={onConfigurarLocal}
                estilo={{ marginTop: spacing.sm }}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Superficie>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  contenido: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  titulo: {
    fontSize: typography.titulo,
    fontFamily: fuentes.display,
    marginTop: spacing.md,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitulo: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.regular,
    marginTop: spacing.xs,
    textAlign: 'center',
    lineHeight: 20,
  },
  contenidoExito: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  ojo: { padding: spacing.xs },
  terminos: {
    fontSize: typography.micro,
    fontFamily: fuentes.regular,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  form: {
    marginTop: spacing.lg,
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
