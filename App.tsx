import { Component, useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import { Poppins_700Bold } from '@expo-google-fonts/poppins';
import { migrarBase } from './src/db/migraciones';
import { sembrarDatosIniciales } from './src/db/seed';
import { obtenerSettings } from './src/db/repos/settings';
import { useSesion } from './src/store/sesion';
import { useTema } from './src/store/tema';
import LoginScreen from './src/screens/LoginScreen';
import { NavegadorRaiz } from './src/navigation';
import { AvisoGlobal } from './src/components/AvisoGlobal';
import { Gradiente } from './src/components/UI';

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
  const { colores } = useTema();
  const entrada = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entrada, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [entrada]);
  return (
    <View style={[styles.splash, { backgroundColor: colores.fondo }]}>
      <Gradiente
        colores={['rgba(124, 58, 237, 0.18)', 'rgba(8, 10, 36, 0)']}
        inicio={{ x: 0.5, y: 0 }}
        fin={{ x: 0.5, y: 1 }}
        estilo={StyleSheet.absoluteFill}
      />
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
        <Gradiente
          colores={['#7C3AED', '#A855F7', '#EC4899']}
          estilo={styles.splashLogo}
        >
          <Text style={styles.splashEmoji}>$</Text>
        </Gradiente>
        <Text style={[styles.splashNombre, { color: colores.texto }]}>Caja Rápida</Text>
        <Text style={[styles.splashSub, { color: colores.textoSuave }]}>Punto de venta simple y veloz</Text>
      </Animated.View>
    </View>
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
  const usuario = useSesion((s) => s.usuario);
  return usuario ? <NavegadorRaiz /> : <LoginScreen />;
}

export default function App() {
  const [fuentesCargadas] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Poppins_700Bold,
  });

  if (!fuentesCargadas) {
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
        </SQLiteProvider>
      </LimiteErrores>
      <AplicarTema />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#080A24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: 84,
    height: 84,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashEmoji: {
    fontSize: 42,
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
  },
  splashNombre: {
    fontSize: 26,
    fontFamily: 'Poppins_700Bold',
    marginTop: 22,
    letterSpacing: -0.5,
  },
  splashSub: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginTop: 8,
  },
  errorContenedor: {
    flex: 1,
    backgroundColor: '#080A24',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  errorEmoji: { fontSize: 44 },
  errorTitulo: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
  },
  errorDetalle: {
    fontSize: 14,
    color: '#A5A7C5',
    textAlign: 'center',
    marginBottom: 16,
    fontFamily: 'Inter_400Regular',
  },
  errorBoton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(168, 85, 247, 0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168, 85, 247, 0.45)',
  },
  errorBotonTexto: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 15 },
});
