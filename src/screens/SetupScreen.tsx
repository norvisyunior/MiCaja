import { useState } from 'react';
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

export default function SetupScreen() {
  const db = useSQLiteContext();
  const iniciar = useSesion((s) => s.iniciar);
  const { colores } = useTema();

  const [nombreNegocio, setNombreNegocio] = useState('');
  const [nombreAdmin, setNombreAdmin] = useState('');
  const [usuario, setUsuario] = useState('');
  const [usuarioTocado, setUsuarioTocado] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function comenzar() {
    if (guardando) return;

    const negocio = nombreNegocio.trim();
    const admin = nombreAdmin.trim();
    const usuarioLimpio = normalizarUsuario(usuario);

    if (!negocio) {
      setError('Escribe el nombre de tu negocio.');
      return;
    }
    if (!admin) {
      setError('Escribe el nombre del administrador.');
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
        setError('Ese nombre de usuario ya está en uso.');
        return;
      }
      await guardarSetting(db, 'nombre_negocio', negocio);
      const id = await crearUsuario(db, {
        nombre: admin,
        usuario: usuarioLimpio,
        rol: 'admin',
        activo: true,
        pin,
      });
      iniciar({ id, nombre: admin, usuario: usuarioLimpio, rol: 'admin', activo: true });
    } catch {
      setError('No se pudo guardar la configuración. Intenta de nuevo.');
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
        >
          <View style={styles.hero}>
            <Gradiente colores={gradientes.primario} estilo={styles.logo}>
              <Text style={styles.logoTexto}>$</Text>
            </Gradiente>
            <Text style={[styles.titulo, { color: colores.texto }]}>Bienvenido a MiCaja</Text>
            <Text style={[styles.subtitulo, { color: colores.textoSuave }]}>
              Configura tu negocio y crea la cuenta de administrador. Solo se hace una vez.
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
              valor={nombreAdmin}
              onChange={(texto) => {
                setNombreAdmin(texto);
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
              placeholder="Ej.: maria"
              icono="alternate-email"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              maxLength={20}
            />
            <Text style={[styles.ayuda, { color: colores.textoSuave }]}>
              Con este usuario y tu PIN entrarás cada vez que abras la caja.
            </Text>
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

            <Text style={[styles.nota, { color: colores.textoSuave }]}>
              Guarda bien tu PIN: lo necesitarás cada vez que abras la caja.
            </Text>

            {error ? (
              <View style={[styles.error, { backgroundColor: colores.peligroSuave }]}>
                <MaterialIcons name="error-outline" size={18} color={colores.peligro} />
                <Text style={[styles.errorTexto, { color: colores.peligro }]}>{error}</Text>
              </View>
            ) : null}

            <Boton
              titulo="Crear administrador y empezar"
              icono="rocket-launch"
              tamanio="lg"
              cargando={guardando}
              onPress={comenzar}
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
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    width: 76,
    height: 76,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoTexto: {
    fontSize: 38,
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
  ayuda: {
    fontSize: typography.micro,
    fontFamily: fuentes.regular,
    lineHeight: 17,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  nota: {
    fontSize: typography.micro,
    fontFamily: fuentes.regular,
    lineHeight: 17,
    marginBottom: spacing.md,
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
  },
});
