import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Settings, Usuario } from '../types';
import {
  ErrorApi,
  loginUsuarioGlobal,
  type InfoDispositivo,
  type RespuestaLoginUsuario,
} from '../api/cliente';
import {
  recuperarAccesoPorUsuario,
  verificarAccesoPorUsuario,
  type ResultadoRecuperacion,
} from '../db/repos/acceso';
import { obtenerSettings } from '../db/repos/settings';
import { encolarUsuarioUpsert } from '../db/sync/encolar';
import {
  APP_VERSION,
  nombreDispositivoPorDefecto,
  plataformaActual,
} from '../sync/activacion';
import { obtenerFingerprintDispositivo } from '../sync/fingerprint';
import { guardarLoginGlobal } from '../sync/login';
import { sincronizarSilencioso } from '../sync/motor';
import { useAvisos } from '../store/avisos';
import { useSesion } from '../store/sesion';
import { useCarrito } from '../store/carrito';
import { useTema } from '../store/tema';
import {
  Boton,
  Campo,
  EstadoCarga,
  Pantalla,
  Superficie,
} from '../components/UI';
import { PantallaCodigoRecuperacion } from '../components/CodigoRecuperacion';
import { fuentes, radius, spacing, typography } from '../theme';
import { normalizarUsuario } from '../utils/usuario';
import {
  esCodigoRecuperacionValido,
  formatearCodigoRecuperacion,
} from '../utils/recuperacion';

type Modo = 'login' | 'recuperacion';

interface DetalleLimite {
  dispositivos?: InfoDispositivo[];
  maxDispositivos?: number;
}

interface DetalleEmpresa {
  empresa?: { id: string; nombre: string };
  empresaActual?: { id: string; nombre: string };
}

function mensajeErrorRecuperacion(
  resultado: Exclude<ResultadoRecuperacion, { ok: true }>
): string {
  switch (resultado.motivo) {
    case 'bloqueado': {
      const minutos = Math.max(
        1,
        Math.ceil((Date.parse(resultado.bloqueadoHasta) - Date.now()) / 60000)
      );
      return `Demasiados intentos. Espera ${minutos} minuto(s) e intenta de nuevo.`;
    }
    case 'inactivo':
      return 'Este usuario está desactivado. Habla con el administrador.';
    case 'sin_recuperacion':
      return 'Esta cuenta no tiene código de recuperación en este dispositivo. Pide a un administrador que genere uno desde Ajustes → Usuarios.';
    case 'nuevo_pin_invalido':
      return 'La nueva contraseña debe tener exactamente 4 dígitos.';
    case 'codigo':
      return resultado.intentosRestantes > 0
        ? `Código incorrecto. Te quedan ${resultado.intentosRestantes} intento(s).`
        : 'Código incorrecto.';
    default:
      return 'Usuario o código incorrecto.';
  }
}

function mensajeErrorLoginGlobal(error: ErrorApi): {
  mensaje: string;
  requiereActivacion: boolean;
} {
  switch (error.codigo) {
    case 'CREDENCIALES_INVALIDAS':
      return {
        mensaje:
          'Usuario o PIN incorrectos. Si la cuenta se creó en otro dispositivo, ábrela allí una vez para sincronizar el PIN.',
        requiereActivacion: false,
      };
    case 'USUARIO_INACTIVO':
      return {
        mensaje: 'Este usuario está desactivado. Habla con el administrador.',
        requiereActivacion: false,
      };
    case 'EMPRESA_SUSPENDIDA':
      return {
        mensaje: 'El negocio está suspendido. Contacta con soporte.',
        requiereActivacion: false,
      };
    case 'LICENCIA_SUSPENDIDA':
      return {
        mensaje: 'La licencia del negocio está suspendida. Contacta con soporte.',
        requiereActivacion: false,
      };
    case 'LICENCIA_VENCIDA':
      return {
        mensaje: 'La licencia del negocio venció. Renueva para continuar.',
        requiereActivacion: false,
      };
    case 'DISPOSITIVO_BLOQUEADO':
      return {
        mensaje: 'Este dispositivo está bloqueado. Habla con el administrador.',
        requiereActivacion: false,
      };
    case 'LIMITE_DISPOSITIVOS':
      return {
        mensaje:
          'El plan del negocio no tiene dispositivos libres. Elige cuál reemplazar para entrar desde este.',
        requiereActivacion: false,
      };
    case 'ROL_INSUFICIENTE':
      return {
        mensaje:
          'Solo el propietario del negocio puede reemplazar un dispositivo cuando el plan está completo.',
        requiereActivacion: false,
      };
    case 'ACTIVACION_REQUERIDA':
      return { mensaje: error.message, requiereActivacion: true };
    default:
      return { mensaje: error.message, requiereActivacion: false };
  }
}

export default function LoginScreen({ onActivar }: { onActivar?: () => void }) {
  const db = useSQLiteContext();
  const iniciar = useSesion((s) => s.iniciar);
  const vaciarCarrito = useCarrito((s) => s.vaciar);
  const mostrarAviso = useAvisos((s) => s.mostrar);
  const { colores } = useTema();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [cargando, setCargando] = useState(true);

  const [modo, setModo] = useState<Modo>('login');
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [pin, setPin] = useState('');
  const [mostrarPin, setMostrarPin] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [pinNuevo, setPinNuevo] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [activacionRequerida, setActivacionRequerida] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [reemplazo, setReemplazo] = useState<{
    dispositivos: InfoDispositivo[];
    maxDispositivos: number;
  } | null>(null);
  const [recuperacionExitosa, setRecuperacionExitosa] = useState<{
    usuario: Usuario;
    codigo: string;
  } | null>(null);

  const pinRef = useRef<TextInput | null>(null);
  const entrada = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    obtenerSettings(db)
      .then((conf) => {
        setSettings(conf);
        setCargando(false);
      })
      .catch(() => setCargando(false));
  }, [db]);

  useEffect(() => {
    if (cargando) return;
    entrada.setValue(0);
    Animated.timing(entrada, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, [cargando, entrada]);

  function limpiarError() {
    if (mensajeError) setMensajeError(null);
    if (activacionRequerida) setActivacionRequerida(false);
    if (reemplazo) setReemplazo(null);
  }

  function volverAlLogin() {
    setModo('login');
    setMensajeError(null);
    setActivacionRequerida(false);
    setReemplazo(null);
    setCodigo('');
    setPinNuevo('');
    setConfirmacion('');
  }

  function entrarTrasRecuperacion() {
    if (!recuperacionExitosa) return;
    vaciarCarrito();
    iniciar(recuperacionExitosa.usuario);
  }

  async function completarLogin(
    respuesta: RespuestaLoginUsuario,
    pinFinal: string,
    fingerprint: string,
    reiniciar = false
  ): Promise<void> {
    setVerificando(true);
    try {
      const usuarioLocal = await guardarLoginGlobal(db, respuesta, pinFinal, fingerprint, {
        reiniciar,
      });
      if (!usuarioLocal) {
        throw new ErrorApi(
          'CUENTA_LOCAL',
          'No se pudo preparar la cuenta local. Intenta de nuevo.',
          500
        );
      }
      // Antes de mostrar la caja se descarga la foto real del negocio
      // (catálogo, usuarios, turnos e historial). Así un dispositivo nuevo o
      // uno que cambió de negocio no entra con la base local vacía.
      await sincronizarSilencioso(db);
      vaciarCarrito();
      iniciar(usuarioLocal);
    } catch (error) {
      if (
        error instanceof ErrorApi &&
        (error.codigo === 'DISPOSITIVO_CON_DATOS' ||
          error.codigo === 'DISPOSITIVO_OTRA_EMPRESA')
      ) {
        mostrarAviso(
          'Borrar este negocio del teléfono',
          `Para entrar en «${respuesta.empresa.nombre}» se borrarán las cuentas, ventas, productos y ajustes guardados localmente en este dispositivo. Esta acción no se puede deshacer.`,
          [
            { texto: 'Cancelar', estilo: 'cancel' },
            {
              texto: 'Borrar y entrar',
              estilo: 'peligro',
              onPress: () => {
                void completarLogin(respuesta, pinFinal, fingerprint, true);
              },
            },
          ]
        );
        return;
      }

      if (error instanceof ErrorApi) {
        const aviso = mensajeErrorLoginGlobal(error);
        setMensajeError(aviso.mensaje);
        setActivacionRequerida(aviso.requiereActivacion);
      } else {
        setMensajeError('No se pudo iniciar sesión. Intenta de nuevo.');
      }
    } finally {
      setVerificando(false);
    }
  }

  function manejarErrorServidor(error: ErrorApi, pinFinal: string): void {
    if (error.codigo === 'LIMITE_DISPOSITIVOS' && error.detalles) {
      const detalles = error.detalles as DetalleLimite;
      if (Array.isArray(detalles.dispositivos) && detalles.dispositivos.length > 0) {
        setReemplazo({
          dispositivos: detalles.dispositivos,
          maxDispositivos: detalles.maxDispositivos ?? detalles.dispositivos.length,
        });
        setMensajeError(null);
        return;
      }
    }

    if (error.codigo === 'DISPOSITIVO_OTRA_EMPRESA') {
      const detalles = (error.detalles ?? {}) as DetalleEmpresa;
      const actual = detalles.empresaActual?.nombre ?? 'otro negocio';
      const destino = detalles.empresa?.nombre ?? 'el negocio de esta cuenta';
      mostrarAviso(
        'Cambiar de negocio',
        `Este teléfono está vinculado a «${actual}». Para entrar en «${destino}» se borrarán las cuentas, ventas y productos guardados localmente. Esta acción no se puede deshacer.`,
        [
          { texto: 'Cancelar', estilo: 'cancel' },
          {
            texto: 'Borrar y entrar',
            estilo: 'peligro',
            onPress: () => {
              void entrar({ cambiarEmpresa: true, pinFinal });
            },
          },
        ]
      );
      return;
    }

    const aviso = mensajeErrorLoginGlobal(error);
    setMensajeError(aviso.mensaje);
    setActivacionRequerida(aviso.requiereActivacion);
    setPin('');
  }

  async function entrar(
    opciones: { reemplazarA?: string; cambiarEmpresa?: boolean; pinFinal?: string } = {}
  ) {
    if (verificando) return;

    const usuarioLimpio = normalizarUsuario(nombreUsuario);
    const pinFinal = opciones.pinFinal ?? pin;
    if (!usuarioLimpio) {
      setMensajeError('Escribe tu nombre de usuario.');
      return;
    }
    if (!/^\d{4}$/.test(pinFinal)) {
      setMensajeError('La contraseña debe tener 4 dígitos.');
      return;
    }

    setMensajeError(null);
    setActivacionRequerida(false);
    setReemplazo(null);
    setVerificando(true);

    const esReintento = Boolean(
      opciones.reemplazarA || opciones.cambiarEmpresa || opciones.pinFinal
    );

    if (!esReintento) {
      try {
        const resultado = await verificarAccesoPorUsuario(db, usuarioLimpio, pinFinal);

        if (resultado.ok) {
          setVerificando(false);
          vaciarCarrito();
          iniciar(resultado.usuario);
          return;
        }

        // Un bloqueo local no se salta con la nube: evita convertir el login
        // global en un oráculo para probar PINs.
        if (resultado.motivo === 'bloqueado') {
          const minutos = Math.max(
            1,
            Math.ceil((Date.parse(resultado.bloqueadoHasta) - Date.now()) / 60000)
          );
          setMensajeError(
            `Demasiados intentos. Espera ${minutos} minuto(s) e intenta de nuevo.`
          );
          setPin('');
          setVerificando(false);
          return;
        }

        if (resultado.motivo === 'inactivo') {
          setMensajeError('Este usuario está desactivado. Habla con el administrador.');
        } else if (resultado.motivo === 'pin') {
          setMensajeError(
            resultado.intentosRestantes > 0
              ? `Usuario o contraseña incorrectos. Te quedan ${resultado.intentosRestantes} intento(s).`
              : 'Usuario o contraseña incorrectos.'
          );
        } else {
          setMensajeError('Usuario o contraseña incorrectos.');
        }
      } catch {
        setMensajeError('No se pudo revisar la cuenta local. Intentando con el servidor…');
      }
    }

    // La cuenta puede existir en la nube pero no en esta instalación (otro
    // navegador, datos borrados o dispositivo recién invitado). Se intenta
    // validar contra el servidor antes de rechazar el acceso.
    try {
      const fingerprint = await obtenerFingerprintDispositivo(db);
      const respuesta = await loginUsuarioGlobal(db, {
        usuario: usuarioLimpio,
        pin: pinFinal,
        fingerprint,
        nombre: await nombreDispositivoPorDefecto(db),
        plataforma: plataformaActual(),
        appVersion: APP_VERSION,
        ...(opciones.reemplazarA ? { reemplazarA: opciones.reemplazarA } : {}),
        ...(opciones.cambiarEmpresa ? { cambiarEmpresa: true } : {}),
      });
      await completarLogin(respuesta, pinFinal, fingerprint);
    } catch (error) {
      if (error instanceof ErrorApi) {
        manejarErrorServidor(error, pinFinal);
      } else {
        setMensajeError('No se pudo iniciar sesión. Intenta de nuevo.');
        setPin('');
      }
    } finally {
      setVerificando(false);
    }
  }

  async function recuperar() {
    if (verificando) return;

    const usuarioLimpio = normalizarUsuario(nombreUsuario);
    if (!usuarioLimpio) {
      setMensajeError('Escribe tu nombre de usuario.');
      return;
    }
    if (!esCodigoRecuperacionValido(codigo)) {
      setMensajeError('El código de recuperación debe tener 12 caracteres.');
      return;
    }
    if (!/^\d{4}$/.test(pinNuevo)) {
      setMensajeError('La nueva contraseña debe tener 4 dígitos.');
      return;
    }
    if (pinNuevo !== confirmacion) {
      setMensajeError('Las dos contraseñas nuevas no coinciden.');
      return;
    }

    setMensajeError(null);
    setVerificando(true);

    try {
      const resultado = await recuperarAccesoPorUsuario(
        db,
        usuarioLimpio,
        codigo,
        pinNuevo
      );

      if (resultado.ok) {
        setRecuperacionExitosa({
          usuario: resultado.usuario,
          codigo: resultado.codigoRecuperacion,
        });
        try {
          await encolarUsuarioUpsert(db, resultado.usuario.id);
        } catch {
          // Se reencolará en el próximo cambio de la cuenta.
        }
        return;
      }

      setMensajeError(mensajeErrorRecuperacion(resultado));
      setCodigo('');
      setPinNuevo('');
      setConfirmacion('');
    } catch {
      setMensajeError('No se pudo recuperar la cuenta. Intenta de nuevo.');
    } finally {
      setVerificando(false);
    }
  }

  if (cargando || !settings) {
    return (
      <Pantalla>
        <Superficie>
          <EstadoCarga mensaje="Preparando la caja…" />
        </Superficie>
      </Pantalla>
    );
  }

  if (recuperacionExitosa) {
    return (
      <PantallaCodigoRecuperacion
        nombre={recuperacionExitosa.usuario.nombre}
        codigo={recuperacionExitosa.codigo}
        titulo="Tu PIN fue restablecido"
        textoBoton="Entrar a la caja"
        onContinuar={entrarTrasRecuperacion}
      />
    );
  }

  const esRecuperacion = modo === 'recuperacion';
  const esBloqueo = !!mensajeError && mensajeError.startsWith('Demasiados');
  const colorError = esBloqueo ? colores.advertencia : colores.peligro;
  const fondoError = esBloqueo ? colores.advertenciaSuave : colores.peligroSuave;

  return (
    <Pantalla>
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
          <Animated.View
            style={[
              styles.hero,
              {
                opacity: entrada,
                transform: [
                  {
                    translateY: entrada.interpolate({
                      inputRange: [0, 1],
                      outputRange: [16, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={[styles.logoWrap, { backgroundColor: colores.primarioSuave }]}>
              <MaterialIcons name="shopping-cart" size={36} color={colores.primario} />
              <View
                style={[
                  styles.logoInsignia,
                  {
                    backgroundColor: colores.superficie,
                    borderColor: colores.borde,
                  },
                ]}
              >
                <MaterialIcons name="lock" size={14} color={colores.primario} />
              </View>
            </View>
            <Text style={[styles.nombreNegocio, { color: colores.texto }]} numberOfLines={2}>
              MiCaja
            </Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.tarjeta,
              {
                opacity: entrada,
                transform: [
                  {
                    translateY: entrada.interpolate({
                      inputRange: [0, 1],
                      outputRange: [24, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text
              style={[
                styles.bienvenida,
                { color: colores.texto, marginBottom: esRecuperacion ? 0 : spacing.lg },
              ]}
            >
              {esRecuperacion ? 'Recupera tu cuenta' : 'Iniciar sesión'}
            </Text>
            {esRecuperacion ? (
              <Text style={[styles.instruccion, { color: colores.textoSuave }]}>
                Escribe tu usuario, el código de recuperación y una nueva contraseña.
              </Text>
            ) : null}

            {mensajeError ? (
              <View
                style={[styles.error, { backgroundColor: fondoError, borderColor: colorError + '33' }]}
              >
                <MaterialIcons
                  name={esBloqueo ? 'hourglass-top' : 'error-outline'}
                  size={18}
                  color={colorError}
                />
                <Text style={[styles.errorTexto, { color: colorError }]}>{mensajeError}</Text>
              </View>
            ) : null}

            <Campo
              etiqueta="Usuario"
              valor={nombreUsuario}
              onChange={(texto) => {
                setNombreUsuario(texto);
                limpiarError();
              }}
              icono="person-outline"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => pinRef.current?.focus()}
            />

            {esRecuperacion ? (
              <>
                <Campo
                  etiqueta="Código de recuperación"
                  valor={codigo}
                  onChange={(texto) => {
                    setCodigo(formatearCodigoRecuperacion(texto));
                    limpiarError();
                  }}
                  icono="key"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoComplete="off"
                  maxLength={14}
                  placeholder="XXXX-XXXX-XXXX"
                />
                <Campo
                  etiqueta="Nueva contraseña (4 dígitos)"
                  valor={pinNuevo}
                  onChange={(texto) => {
                    setPinNuevo(texto.replace(/\D/g, '').slice(0, 4));
                    limpiarError();
                  }}
                  icono="lock-outline"
                  teclado="numeric"
                  seguro
                  maxLength={4}
                  autoComplete="new-password"
                />
                <Campo
                  etiqueta="Confirmar nueva contraseña"
                  valor={confirmacion}
                  onChange={(texto) => {
                    setConfirmacion(texto.replace(/\D/g, '').slice(0, 4));
                    limpiarError();
                  }}
                  icono="lock"
                  teclado="numeric"
                  seguro
                  maxLength={4}
                  autoComplete="new-password"
                  returnKeyType="go"
                  onSubmitEditing={recuperar}
                />

                <Text style={[styles.nota, { color: colores.textoSuave }]}>
                  El código tiene 12 caracteres. Al usarlo se genera uno nuevo que
                  deberás guardar.
                </Text>

                <Boton
                  titulo="Restablecer PIN"
                  icono="lock-open"
                  tamanio="lg"
                  cargando={verificando}
                  onPress={recuperar}
                  estilo={{ marginTop: spacing.sm }}
                />

                <Pressable
                  onPress={volverAlLogin}
                  hitSlop={8}
                  style={({ pressed }) => [styles.enlace, pressed && { opacity: 0.6 }]}
                >
                  <MaterialIcons name="arrow-back" size={16} color={colores.textoSuave} />
                  <Text style={[styles.enlaceTexto, { color: colores.textoSuave }]}>
                    Volver al inicio de sesión
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Campo
                  etiqueta="Contraseña"
                  valor={pin}
                  onChange={(texto) => {
                    setPin(texto.replace(/\D/g, '').slice(0, 4));
                    limpiarError();
                  }}
                  icono="lock-outline"
                  teclado="numeric"
                  seguro={!mostrarPin}
                  maxLength={4}
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={() => void entrar()}
                  inputRef={pinRef}
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

                <Text style={[styles.nota, { color: colores.textoSuave }]}>
                  Tu contraseña es el PIN de 4 dígitos.
                </Text>

                {reemplazo ? (
                  <View style={styles.reemplazo}>
                    <View
                      style={[styles.reemplazoNota, { backgroundColor: colores.advertenciaSuave }]}
                    >
                      <MaterialIcons
                        name="swap-horiz"
                        size={18}
                        color={colores.advertencia}
                      />
                      <Text style={[styles.errorTexto, { color: colores.advertencia }]}>
                        El plan permite {reemplazo.maxDispositivos} dispositivo(s) y ya están
                        todos en uso. Elige cuál se retira para entrar desde este.
                      </Text>
                    </View>
                    {reemplazo.dispositivos.map((dispositivo) => (
                      <Pressable
                        key={dispositivo.id}
                        onPress={() => {
                          setReemplazo(null);
                          void entrar({ reemplazarA: dispositivo.id, pinFinal: pin });
                        }}
                        style={({ pressed }) => [
                          styles.reemplazoFila,
                          { borderColor: colores.borde },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <MaterialIcons
                          name="devices-other"
                          size={18}
                          color={colores.textoSuave}
                        />
                        <View style={styles.reemplazoInfo}>
                          <Text style={[styles.reemplazoNombre, { color: colores.texto }]}>
                            {dispositivo.nombre}
                          </Text>
                          <Text style={[styles.reemplazoMeta, { color: colores.textoSuave }]}>
                            {dispositivo.plataforma}
                            {dispositivo.lastSeenAt
                              ? ` · visto ${new Date(dispositivo.lastSeenAt).toLocaleDateString()}`
                              : ''}
                          </Text>
                        </View>
                        <MaterialIcons
                          name="chevron-right"
                          size={18}
                          color={colores.textoSuave}
                        />
                      </Pressable>
                    ))}
                    <Boton
                      titulo="Cancelar"
                      tamanio="md"
                      variante="secundario"
                      onPress={() => setReemplazo(null)}
                    />
                  </View>
                ) : null}

                <Boton
                  titulo="Entrar"
                  icono="login"
                  tamanio="lg"
                  cargando={verificando}
                  onPress={() => void entrar()}
                  estilo={{ marginTop: spacing.sm }}
                />

                {activacionRequerida && onActivar ? (
                  <Pressable
                    onPress={() => {
                      setActivacionRequerida(false);
                      onActivar();
                    }}
                    hitSlop={8}
                    style={({ pressed }) => [styles.enlace, pressed && { opacity: 0.6 }]}
                  >
                    <MaterialIcons name="vpn-key" size={16} color={colores.acento} />
                    <Text style={[styles.enlaceTexto, { color: colores.acento }]}>
                      Activar este dispositivo
                    </Text>
                  </Pressable>
                ) : null}

                <Pressable
                  onPress={() => {
                    setModo('recuperacion');
                    setMensajeError(null);
                    setPin('');
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [styles.enlace, pressed && { opacity: 0.6 }]}
                >
                  <MaterialIcons name="key" size={16} color={colores.textoSuave} />
                  <Text style={[styles.enlaceTexto, { color: colores.textoSuave }]}>
                    ¿Olvidaste tu contraseña?
                  </Text>
                </Pressable>
              </>
            )}
          </Animated.View>

          <View style={styles.pie}>
            <MaterialIcons name="verified-user" size={15} color={colores.textoSuave} />
            <Text style={[styles.pieTexto, { color: colores.textoSuave }]}>
              Acceso privado · MiCaja
            </Text>
          </View>
          <Text style={[styles.version, { color: colores.textoSuave }]}>
            MiCaja · v{APP_VERSION}
          </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </Superficie>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  contenido: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoWrap: {
    width: 84,
    height: 84,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInsignia: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nombreNegocio: {
    fontSize: typography.tituloGrande,
    fontFamily: fuentes.display,
    marginTop: spacing.lg,
    textAlign: 'center',
    letterSpacing: -0.6,
    paddingHorizontal: spacing.md,
  },
  tarjeta: {
    paddingHorizontal: spacing.xs,
  },
  bienvenida: {
    fontSize: typography.titulo,
    fontFamily: fuentes.display,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  instruccion: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.regular,
    marginTop: 4,
    marginBottom: spacing.lg,
    textAlign: 'center',
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
  ojo: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nota: {
    fontSize: typography.micro,
    fontFamily: fuentes.regular,
    marginTop: -spacing.xs,
  },
  reemplazo: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  reemplazoNota: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  reemplazoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  reemplazoInfo: {
    flex: 1,
  },
  reemplazoNombre: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
  },
  reemplazoMeta: {
    fontSize: typography.micro,
    fontFamily: fuentes.regular,
    marginTop: 1,
  },
  enlace: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
  },
  enlaceTexto: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.medium,
  },
  pie: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
  },
  pieTexto: {
    fontSize: typography.micro,
    fontFamily: fuentes.medium,
  },
  version: {
    textAlign: 'center',
    fontSize: typography.micro,
    fontFamily: fuentes.regular,
    marginTop: spacing.sm,
  },
});
