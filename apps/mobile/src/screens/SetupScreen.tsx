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
import type { Usuario } from '../types';
import {
  Boton,
  Campo,
  Encabezado,
  Pantalla,
  Superficie,
} from '../components/UI';
import { PantallaCodigoRecuperacion } from '../components/CodigoRecuperacion';
import { reiniciarLicenciaDelNegocio } from '../sync/activacion';
import { fuentes, radius, spacing, typography } from '../theme';
import { esPinValido } from '../utils/pin';
import {
  esUsuarioValido,
  generarUsuarioDesdeNombre,
  normalizarUsuario,
} from '../utils/usuario';

export default function SetupScreen({ onCancelar }: { onCancelar?: () => void }) {
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
  const [usuarioCreado, setUsuarioCreado] = useState<Usuario | null>(null);
  const [codigoRecuperacion, setCodigoRecuperacion] = useState<string | null>(null);

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
      await reiniciarLicenciaDelNegocio(db);
      await guardarSetting(db, 'nombre_negocio', negocio);
      const { id, codigoRecuperacion: codigo } = await crearUsuario(db, {
        nombre: admin,
        usuario: usuarioLimpio,
        rol: 'admin',
        activo: true,
        pin,
      });
      setUsuarioCreado({
        id,
        nombre: admin,
        usuario: usuarioLimpio,
        rol: 'admin',
        activo: true,
      });
      setCodigoRecuperacion(codigo);
    } catch {
      setError('No se pudo guardar la configuración. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
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
      <Encabezado titulo="Configurar negocio" onAtras={onCancelar} />
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
              <MaterialIcons name="storefront" size={30} color={colores.primario} />
            </View>
            <Text style={[styles.titulo, { color: colores.texto }]}>Bienvenido a MiCaja</Text>
            <Text style={[styles.subtitulo, { color: colores.textoSuave }]}>
              Configura tu negocio y crea la cuenta de administrador. Solo se hace una vez.
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
  form: {
    marginTop: spacing.lg,
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
