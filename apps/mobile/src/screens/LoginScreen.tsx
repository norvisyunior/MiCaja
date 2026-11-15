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
import type { Settings } from '../types';
import { verificarAccesoPorUsuario } from '../db/repos/acceso';
import { obtenerSettings } from '../db/repos/settings';
import { useSesion } from '../store/sesion';
import { useCarrito } from '../store/carrito';
import { useTema } from '../store/tema';
import { Boton, Campo, EstadoCarga, Gradiente, Pantalla } from '../components/UI';
import { fuentes, gradientes, radius, sombraTarjeta, spacing, typography } from '../theme';
import { normalizarUsuario } from '../utils/usuario';

export default function LoginScreen() {
  const db = useSQLiteContext();
  const iniciar = useSesion((s) => s.iniciar);
  const vaciarCarrito = useCarrito((s) => s.vaciar);
  const { colores } = useTema();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [cargando, setCargando] = useState(true);

  const [nombreUsuario, setNombreUsuario] = useState('');
  const [pin, setPin] = useState('');
  const [mostrarPin, setMostrarPin] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);

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
  }

  async function entrar() {
    if (verificando) return;

    const usuarioLimpio = normalizarUsuario(nombreUsuario);
    if (!usuarioLimpio) {
      setMensajeError('Escribe tu nombre de usuario.');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setMensajeError('La contraseña debe tener 4 dígitos.');
      return;
    }

    setMensajeError(null);
    setVerificando(true);
    let exito = false;

    try {
      const resultado = await verificarAccesoPorUsuario(db, usuarioLimpio, pin);

      if (resultado.ok) {
        exito = true;
        vaciarCarrito();
        iniciar(resultado.usuario);
        return;
      }

      if (resultado.motivo === 'bloqueado') {
        const minutos = Math.max(
          1,
          Math.ceil((Date.parse(resultado.bloqueadoHasta) - Date.now()) / 60000)
        );
        setMensajeError(`Demasiados intentos. Espera ${minutos} minuto(s) e intenta de nuevo.`);
      } else if (resultado.motivo === 'inactivo') {
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
      setPin('');
    } catch {
      setMensajeError('No se pudo iniciar sesión. Intenta de nuevo.');
    } finally {
      if (!exito) setVerificando(false);
    }
  }

  if (cargando || !settings) {
    return (
      <Pantalla>
        <EstadoCarga mensaje="Preparando la caja…" />
      </Pantalla>
    );
  }

  const esBloqueo = !!mensajeError && mensajeError.startsWith('Demasiados');
  const colorError = esBloqueo ? colores.advertencia : colores.peligro;
  const fondoError = esBloqueo ? colores.advertenciaSuave : colores.peligroSuave;

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
            <View style={styles.logoWrap}>
              <Gradiente colores={gradientes.primario} estilo={styles.logo}>
                <Text style={styles.logoTexto}>$</Text>
              </Gradiente>
              <View
                style={[
                  styles.logoInsignia,
                  {
                    backgroundColor: colores.superficie,
                    borderColor: colores.borde,
                    ...sombraTarjeta(colores),
                  },
                ]}
              >
                <MaterialIcons name="lock" size={14} color={colores.acento} />
              </View>
            </View>
            <Text style={[styles.nombreNegocio, { color: colores.texto }]} numberOfLines={2}>
              {settings.nombreNegocio}
            </Text>
            <Text style={[styles.eslogan, { color: colores.textoSuave }]}>
              Inicia sesión para abrir la caja
            </Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.tarjeta,
              {
                backgroundColor: colores.superficie,
                borderColor: colores.borde,
                ...sombraTarjeta(colores),
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
            <Text style={[styles.bienvenida, { color: colores.texto }]}>Bienvenido de vuelta</Text>
            <Text style={[styles.instruccion, { color: colores.textoSuave }]}>
              Ingresa con tu usuario y contraseña.
            </Text>

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
              onSubmitEditing={entrar}
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

            <Boton
              titulo="Entrar"
              icono="login"
              tamanio="lg"
              cargando={verificando}
              onPress={entrar}
              estilo={{ marginTop: spacing.sm }}
            />
          </Animated.View>

          <View style={styles.pie}>
            <MaterialIcons name="verified-user" size={15} color={colores.textoSuave} />
            <Text style={[styles.pieTexto, { color: colores.textoSuave }]}>
              Acceso privado · {settings.nombreNegocio}
            </Text>
          </View>
          <Text style={[styles.version, { color: colores.textoSuave }]}>MiCaja · v1.0.0</Text>
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
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 88,
    height: 88,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoTexto: {
    fontSize: 44,
    fontFamily: fuentes.bold,
    color: '#FFFFFF',
  },
  logoInsignia: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nombreNegocio: {
    fontSize: typography.tituloGrande,
    fontFamily: fuentes.bold,
    marginTop: spacing.lg,
    textAlign: 'center',
    letterSpacing: -0.6,
    paddingHorizontal: spacing.md,
  },
  eslogan: {
    fontSize: typography.cuerpo,
    marginTop: spacing.xs,
    textAlign: 'center',
    fontFamily: fuentes.regular,
  },
  tarjeta: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
  },
  bienvenida: {
    fontSize: typography.titulo,
    fontFamily: fuentes.bold,
    letterSpacing: -0.4,
  },
  instruccion: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.regular,
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
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
