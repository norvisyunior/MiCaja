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
import { crearUsuario } from '../db/repos/catalogo';
import { guardarSetting } from '../db/repos/settings';
import { useSesion } from '../store/sesion';
import { useTema } from '../store/tema';
import { Boton, Campo, Gradiente, Pantalla, SombraDura } from '../components/UI';
import { fuentes, gradientes, radius, spacing, typography } from '../theme';
import { esPinValido } from '../utils/pin';

export default function SetupScreen() {
  const db = useSQLiteContext();
  const iniciar = useSesion((s) => s.iniciar);
  const { colores } = useTema();

  const [nombreNegocio, setNombreNegocio] = useState('');
  const [nombreAdmin, setNombreAdmin] = useState('');
  const [pin, setPin] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function comenzar() {
    if (guardando) return;

    const negocio = nombreNegocio.trim();
    const admin = nombreAdmin.trim();

    if (!negocio) {
      setError('Escribe el nombre de tu negocio.');
      return;
    }
    if (!admin) {
      setError('Escribe el nombre del administrador.');
      return;
    }
    if (!esPinValido(pin)) {
      setError('El PIN debe tener exactamente 4 dígitos.');
      return;
    }
    if (pin !== confirmacion) {
      setError('Los dos PIN no coinciden.');
      return;
    }

    setError(null);
    setGuardando(true);
    try {
      await guardarSetting(db, 'nombre_negocio', negocio);
      const id = await crearUsuario(db, {
        nombre: admin,
        rol: 'admin',
        activo: true,
        pin,
      });
      iniciar({ id, nombre: admin, rol: 'admin', activo: true });
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

          <SombraDura redondeo={radius.lg} offset={3} estilo={styles.tarjeta}>
            <View
              style={[
                styles.tarjetaInterior,
                { backgroundColor: colores.superficie, borderColor: colores.borde },
              ]}
            >
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
                onChange={setNombreAdmin}
                placeholder="Ej.: María"
                icono="person"
              />
              <Campo
                etiqueta="PIN de acceso (4 dígitos)"
                valor={pin}
                onChange={(t) => setPin(t.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                teclado="numeric"
                seguro
                maxLength={4}
                icono="lock"
              />
              <Campo
                etiqueta="Confirmar PIN"
                valor={confirmacion}
                onChange={(t) => setConfirmacion(t.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                teclado="numeric"
                seguro
                maxLength={4}
                icono="lock-outline"
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
          </SombraDura>
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
  tarjetaInterior: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
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
