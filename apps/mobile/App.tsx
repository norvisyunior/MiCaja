import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';
import { migrarBase } from './src/db/migraciones';
import { sembrarDatosIniciales } from './src/db/seed';
import { obtenerSettings } from './src/db/repos/settings';
import { listarUsuarios } from './src/db/repos/catalogo';
import { useSesion } from './src/store/sesion';
import { useTema } from './src/store/tema';
import LoginScreen from './src/screens/LoginScreen';
import SetupScreen from './src/screens/SetupScreen';
import BienvenidaScreen from './src/screens/BienvenidaScreen';
import RegistroScreen from './src/screens/RegistroScreen';
import ActivacionScreen from './src/screens/ActivacionScreen';
import TrabajadorSetupScreen from './src/screens/TrabajadorSetupScreen';
import { NavegadorRaiz } from './src/navigation';
import { CLAVE_VIA_ACTIVACION, leerSetting } from './src/api/config';
import { useSyncAutomatico } from './src/sync/automatico';
import { destinoPostActivacion } from './src/sync/postActivacion';
import { useSync } from './src/store/sync';
import { AvisoGlobal } from './src/components/AvisoGlobal';
import { Boton, Gradiente } from './src/components/UI';
import { fuentes, gradientes, typography } from './src/theme';

async function inicializarBase(db: SQLiteDatabase) {
  await migrarBase(db);
  await sembrarDatosIniciales(db);
}

function CargarTema() {
  const db = useSQLiteContext();
  const fijar = useTema((s) => s.fijar);
  useEffect(() => {
    obtenerSettings(db)
      .then((s) => fijar(s.tema))
      .catch(() => undefined);
  }, [db, fijar]);
  return null;
}

function AplicarTema() {
  const { modo } = useTema();
  return <StatusBar style={modo === 'oscuro' ? 'light' : 'dark'} />;
}

function Splash() {
  const entrada = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entrada, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [entrada]);
  return (
    <View style={styles.splash}>
      <Gradiente colores={gradientes.banda} estilo={StyleSheet.absoluteFill} />
      <Animated.View
        style={{
          alignItems: 'center',
          opacity: entrada,
          transform: [
            { scale: entrada.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
            { translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
          ],
        }}
      >
        <MaterialIcons name="shopping-cart" size={68} color="#FFFFFF" />
        <Text style={styles.splashNombre}>MiCaja</Text>
        <Text style={styles.splashSub}>Tu punto de venta siempre contigo</Text>
      </Animated.View>
    </View>
  );
}

function AvisoSinConexion() {
  const errorCodigo = useSync((s) => s.errorCodigo);
  const { colores } = useTema();
  const [entendido, setEntendido] = useState(false);
  const sinConexion =
    errorCodigo === 'SIN_CONEXION' || errorCodigo === 'TIEMPO_AGOTADO';

  useEffect(() => {
    if (!sinConexion) setEntendido(false);
  }, [sinConexion]);

  if (!sinConexion || entendido) return null;

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      onRequestClose={() => setEntendido(true)}
    >
      <View style={[styles.offlineFondo, { backgroundColor: colores.overlay }]}>
        <View style={[styles.offlineTarjeta, { backgroundColor: colores.superficie }]}>
          <MaterialIcons name="wifi-off" size={52} color={colores.texto} />
          <Text style={[styles.offlineTitulo, { color: colores.texto }]}>Modo sin conexión</Text>
          <Text style={[styles.offlineTexto, { color: colores.textoSuave }]}>
            Puedes seguir trabajando. Los cambios se sincronizarán cuando tengas internet.
          </Text>
          <Boton
            titulo="Entendido"
            tamanio="lg"
            onPress={() => setEntendido(true)}
            estilo={styles.offlineBoton}
          />
        </View>
      </View>
    </Modal>
  );
}

class LimiteErrores extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.errorContenedor}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitulo}>Algo salió mal</Text>
          <Text style={styles.errorDetalle}>
            {this.state.error.message || 'Ocurrió un error inesperado.'}
          </Text>
          <Pressable
            onPress={() => this.setState({ error: null })}
            style={({ pressed }) => [styles.errorBoton, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.errorBotonTexto}>Reintentar</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

function Contenido() {
  const db = useSQLiteContext();
  const usuario = useSesion((s) => s.usuario);
  const [estado, setEstado] = useState<
    'cargando' | 'bienvenida' | 'setup' | 'trabajador' | 'login' | 'registro' | 'activacion'
  >('cargando');

  useSyncAutomatico(db, Boolean(usuario));

  useEffect(() => {
    if (usuario) {
      setEstado('login');
      return;
    }

    let vigente = true;
    listarUsuarios(db)
      .then((usuarios) => {
        if (vigente) setEstado(usuarios.length > 0 ? 'login' : 'bienvenida');
      })
      .catch(() => {
        if (vigente) setEstado('login');
      });
    return () => {
      vigente = false;
    };
  }, [db, usuario]);

  async function trasActivacion() {
    const [via, usuarios] = await Promise.all([
      leerSetting(db, CLAVE_VIA_ACTIVACION),
      listarUsuarios(db),
    ]);
    setEstado(destinoPostActivacion(via, usuarios.length > 0));
  }

  if (usuario) return <NavegadorRaiz />;
  if (estado === 'cargando') return <Splash />;
  if (estado === 'bienvenida') {
    return (
      <BienvenidaScreen
        onIniciarSesion={() => setEstado('login')}
        onCrearCuenta={() => setEstado('registro')}
      />
    );
  }
  if (estado === 'setup') {
    return <SetupScreen onCancelar={() => setEstado('bienvenida')} />;
  }
  if (estado === 'trabajador') {
    return <TrabajadorSetupScreen />;
  }
  if (estado === 'registro') {
    return (
      <RegistroScreen
        onAtras={() => setEstado('bienvenida')}
        onConfigurarLocal={() => setEstado('setup')}
      />
    );
  }
  if (estado === 'activacion') {
    return (
      <ActivacionScreen
        onAtras={() => setEstado('bienvenida')}
        onActivado={() => {
          void trasActivacion();
        }}
      />
    );
  }
  return <LoginScreen onActivar={() => setEstado('activacion')} />;
}

export default function App() {
  const [fuentesCargadas, errorFuentes] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Poppins_700Bold,
  });

  if (!fuentesCargadas && !errorFuentes) {
    return <Splash />;
  }

  return (
    <SafeAreaProvider>
      <LimiteErrores>
        <SQLiteProvider databaseName="caja-rapida.db" onInit={inicializarBase}>
          <CargarTema />
          <NavigationContainer>
            <Contenido />
          </NavigationContainer>
          <AvisoGlobal />
          <AvisoSinConexion />
        </SQLiteProvider>
      </LimiteErrores>
      <AplicarTema />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashNombre: {
    fontSize: typography.hero,
    fontFamily: fuentes.display,
    color: '#FFFFFF',
    marginTop: 22,
    letterSpacing: -1,
  },
  splashSub: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.regular,
    color: 'rgba(255, 255, 255, 0.88)',
    marginTop: 8,
  },
  errorContenedor: {
    flex: 1,
    backgroundColor: '#F7F8FC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  errorEmoji: { fontSize: 44 },
  errorTitulo: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    color: '#171A33',
  },
  errorDetalle: {
    fontSize: 14,
    color: '#6B6F8D',
    textAlign: 'center',
    marginBottom: 16,
    fontFamily: 'Inter_400Regular',
  },
  errorBoton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#3F3FB0',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#34349C',
  },
  errorBotonTexto: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 15 },
  offlineFondo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  offlineTarjeta: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  offlineTitulo: {
    fontSize: 20,
    fontFamily: 'Poppins_700Bold',
    textAlign: 'center',
    marginTop: 4,
  },
  offlineTexto: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  offlineBoton: { alignSelf: 'stretch' },
});
