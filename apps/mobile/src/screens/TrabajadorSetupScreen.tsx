import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { crearUsuario, existeNombreUsuario } from '../db/repos/catalogo';
import { guardarSetting } from '../db/repos/settings';
import { CLAVE_CODIGO_PENDIENTE, CLAVE_ROL_ACTIVACION, leerSetting } from '../api/config';
import { useSesion } from '../store/sesion';
import { useTema } from '../store/tema';
import type { Rol, Usuario } from '../types';
import { Boton, Campo, Gradiente, Pantalla, Tarjeta } from '../components/UI';
import { PantallaCodigoRecuperacion } from '../components/CodigoRecuperacion';
import { fuentes, gradientes, radius, spacing, typography } from '../theme';
import { esPinValido } from '../utils/pin';
import {
  esUsuarioValido,
  generarUsuarioDesdeNombre,
  normalizarUsuario,
} from '../utils/usuario';

/**
 * Configuración inicial del dispositivo de un trabajador invitado: solo
 * crea su cuenta local con rol dependiente; los datos del negocio llegan
 * con la sincronización.
 */
export default function TrabajadorSetupScreen({ onListo }: { onListo?: () => void }) {
  const db = useSQLiteContext();
  const iniciar = useSesion((s) => s.iniciar);
  const { colores } = useTema();

  const [nombre, setNombre] = useState('');
  const [usuario, setUsuario] = useState('');
  const [usuarioTocado, setUsuarioTocado] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [rol, setRol] = useState<Rol>('dependiente');
  const [usuarioCreado, setUsuarioCreado] = useState<Usuario | null>(null);
  const [codigoRecuperacion, setCodigoRecuperacion] = useState<string | null>(null);

  const usuarioLimpio = normalizarUsuario(usuario);

  // La invitación puede ser de administrador o de dependiente: la cuenta
  // local debe crearse con el mismo rol que asignó el negocio.
  useEffect(() => {
    leerSetting(db, CLAVE_ROL_ACTIVACION)
      .then((guardado) => setRol(guardado === 'admin' ? 'admin' : 'dependiente'))
      .catch(() => undefined);
  }, [db]);

  async function comenzar() {
    if (guardando) return;

    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) {
      setError('Escribe tu nombre.');
      return;
    }
    if (!esUsuarioValido(usuarioLimpio)) {
      setError('El usuario debe tener de 3 a 20 caracteres: letras, números, punto, guion o guion bajo.');
      return;
    }
    if (!esPinValido(pin)) {
      setError('La contraseña debe tener exactamente 4 dígitos.');
      return;
    }
    if (pin !== confirmacion) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }

    setError(null);
    setGuardando(true);
    try {
      if (await existeNombreUsuario(db, usuarioLimpio)) {
        setError('Ese nombre de usuario ya está en uso en este dispositivo.');
        return;
      }
      const { id, codigoRecuperacion: codigo } = await crearUsuario(db, {
        nombre: nombreLimpio,
        usuario: usuarioLimpio,
        rol,
        activo: true,
        pin,
      });
      setUsuarioCreado({
        id,
        nombre: nombreLimpio,
        usuario: usuarioLimpio,
        rol,
        activo: true,
      });
      setCodigoRecuperacion(codigo);
    } catch {
      setError('No se pudo crear tu cuenta. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  async function continuar() {
    if (!usuarioCreado) return;
    // La activación terminó: el código pendiente ya no hace falta.
    await guardarSetting(db, CLAVE_CODIGO_PENDIENTE, '');
    iniciar(usuarioCreado);
    onListo?.();
  }

  if (codigoRecuperacion && usuarioCreado) {
    return (
      <PantallaCodigoRecuperacion
        nombre={usuarioCreado.nombre}
        codigo={codigoRecuperacion}
        textoBoton="Entrar a la caja"
        onContinuar={() => {
          void continuar();
        }}
      />
    );
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
          <View style={styles.hero}>
            <Gradiente colores={gradientes.primario} estilo={styles.logo}>
              <MaterialIcons name="badge" size={34} color="#FFFFFF" />
            </Gradiente>
            <Text style={[styles.titulo, { color: colores.texto }]}>Crea tu cuenta</Text>
            <Text style={[styles.subtitulo, { color: colores.textoSuave }]}>
              Este dispositivo quedó unido al negocio. Crea tu usuario con el rol
              {rol === 'admin' ? ' de administrador ' : ' de dependiente '}
              que te asignaron para usar la caja.
            </Text>
          </View>

          <Tarjeta estilo={styles.tarjeta}>
            <Campo
              etiqueta="Tu nombre"
              valor={nombre}
              onChange={(texto) => {
                setNombre(texto);
                if (!usuarioTocado) setUsuario(generarUsuarioDesdeNombre(texto));
              }}
              placeholder="Ej.: Carlos"
              icono="person"
              autoFocus
            />
            <Campo
              etiqueta="Usuario de acceso"
              valor={usuario}
              onChange={(texto) => {
                setUsuarioTocado(true);
                setUsuario(texto.replace(/\s/g, '').toLowerCase());
              }}
              placeholder="Ej.: carlos"
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

            <Boton
              titulo="Empezar"
              icono="arrow-forward"
              tamanio="lg"
              cargando={guardando}
              onPress={comenzar}
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
  logoTexto: {
    fontSize: 30,
    fontFamily: fuentes.bold,
    color: '#FFFFFF',
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
});
