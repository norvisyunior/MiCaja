import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { MaterialIcons } from '@expo/vector-icons';
import type { Settings, Usuario } from '../types';
import { listarUsuariosActivos } from '../db/repos/catalogo';
import { obtenerSettings } from '../db/repos/settings';
import { useSesion } from '../store/sesion';
import { useCarrito } from '../store/carrito';
import { useTema } from '../store/tema';
import { Badge, Boton, EstadoCarga, Gradiente, Hoja, PinPad, SombraDura } from '../components/UI';
import { fuentes, gradientes, paletaProductos, radius, spacing, typography, type PaletaColores } from '../theme';

function Avatar({ usuario, indice, colores }: { usuario: Usuario; indice: number; colores: PaletaColores }) {
  const color = paletaProductos[indice % paletaProductos.length];
  return (
    <View style={[styles.avatar, { backgroundColor: color }]}>
      <Text style={styles.avatarTexto}>{usuario.nombre.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export default function LoginScreen() {
  const db = useSQLiteContext();
  const iniciar = useSesion((s) => s.iniciar);
  const vaciarCarrito = useCarrito((s) => s.vaciar);
  const { colores } = useTema();

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [cargando, setCargando] = useState(true);

  const [seleccion, setSeleccion] = useState<Usuario | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const { width } = useWindowDimensions();
  const columnas = width >= 700 ? 3 : 2;

  const anims = useMemo(() => usuarios.map(() => new Animated.Value(0)), [usuarios]);
  const entradaMarca = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entradaMarca, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  }, [entradaMarca]);

  useEffect(() => {
    anims.forEach((a, i) => {
      Animated.timing(a, {
        toValue: 1,
        duration: 300,
        delay: 100 + i * 80,
        useNativeDriver: true,
      }).start();
    });
  }, [anims]);

  useEffect(() => {
    (async () => {
      const [usrs, conf] = await Promise.all([listarUsuariosActivos(db), obtenerSettings(db)]);
      setUsuarios(usrs);
      setSettings(conf);
      setCargando(false);
    })().catch(() => setCargando(false));
  }, [db]);

  function onDigito(d: string) {
    if (!seleccion) return;
    const nuevo = pin + d;
    setError(false);
    if (nuevo.length === 4) {
      setPin('');
      if (nuevo === seleccion.pin) {
        setSeleccion(null);
        vaciarCarrito();
        iniciar(seleccion);
      } else {
        setError(true);
      }
      return;
    }
    setPin(nuevo);
  }

  function onBorrar() {
    setPin((p) => p.slice(0, -1));
    setError(false);
  }

  if (cargando || !settings) {
    return (
      <View style={[styles.contenedor, { backgroundColor: colores.fondo }]}>
        <EstadoCarga mensaje="Preparando la caja…" />
      </View>
    );
  }

  return (
    <View style={[styles.contenedor, { backgroundColor: colores.fondo }]}>
      <Animated.View
        style={[
          styles.hero,
          {
            opacity: entradaMarca,
            transform: [
              {
                translateY: entradaMarca.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-14, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Gradiente colores={gradientes.primario} estilo={styles.logoCaja}>
          <Text style={[styles.logoSimbolo, { color: '#FFFFFF' }]}>$</Text>
        </Gradiente>
        <Text style={[styles.nombreNegocio, { color: colores.texto }]}>{settings.nombreNegocio}</Text>
        <Text style={[styles.eslogan, { color: colores.textoSuave }]}>
          Selecciona tu usuario para abrir la caja
        </Text>
      </Animated.View>

      <FlatList
        data={usuarios}
        key={columnas}
        numColumns={columnas}
        keyExtractor={(u) => String(u.id)}
        contentContainerStyle={styles.lista}
        columnWrapperStyle={columnas > 1 ? { gap: spacing.md } : undefined}
        renderItem={({ item, index }) => (
          <View style={{ flex: 1, marginBottom: spacing.md }}>
            <Animated.View
              style={{
                opacity: anims[index],
                transform: [
                  {
                    translateY: anims[index].interpolate({
                      inputRange: [0, 1],
                      outputRange: [18, 0],
                    }),
                  },
                ],
              }}
            >
              <SombraDura redondeo={radius.lg} offset={2} estilo={{ width: '100%' }}>
                <Pressable
                  onPress={() => setSeleccion(item)}
                  style={({ pressed }) => [
                    styles.tarjetaUsuario,
                    {
                      backgroundColor: colores.superficie,
                      borderColor: colores.borde,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <Avatar usuario={item} indice={index} colores={colores} />
                  <Text
                    style={[styles.nombreUsuario, { color: colores.texto }]}
                    numberOfLines={1}
                  >
                    {item.nombre}
                  </Text>
                  <Badge
                    texto={item.rol === 'admin' ? 'Administrador' : 'Dependiente'}
                    color={item.rol === 'admin' ? colores.superficieSuave : colores.infoSuave}
                    colorTexto={item.rol === 'admin' ? colores.texto : colores.info}
                    icono={item.rol === 'admin' ? 'admin-panel-settings' : 'storefront'}
                  />
                </Pressable>
              </SombraDura>
            </Animated.View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.lista}>
            <Text style={[styles.vacioTexto, { color: colores.textoSuave }]}>
              No hay usuarios activos. Configúralos desde ajustes.
            </Text>
          </View>
        }
      />

      <Hoja
        visible={!!seleccion}
        onCerrar={() => {
          setSeleccion(null);
          setPin('');
          setError(false);
        }}
        titulo={`PIN de ${seleccion?.nombre ?? ''}`}
        subtitulo="Ingresa tu código de 4 dígitos"
      >
        <View style={styles.puntos}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                styles.punto,
                {
                  borderColor: colores.borde,
                  backgroundColor: colores.superficie,
                },
                i < pin.length && { backgroundColor: colores.acento, borderColor: colores.acento },
              ]}
            />
          ))}
        </View>
        {error ? (
          <View
            style={[
              styles.errorPin,
              { backgroundColor: colores.peligroSuave },
            ]}
          >
            <MaterialIcons name="error-outline" size={18} color={colores.peligro} />
            <Text style={[styles.errorPinTexto, { color: colores.peligro }]}>
              PIN incorrecto, intenta de nuevo
            </Text>
          </View>
        ) : null}
        <PinPad onDigito={onDigito} onBorrar={onBorrar} />
        <Boton
          titulo="Cancelar"
          variante="secundario"
          onPress={() => {
            setSeleccion(null);
            setPin('');
            setError(false);
          }}
          estilo={{ marginTop: spacing.lg }}
        />
      </Hoja>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1 },
  hero: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  logoCaja: {
    width: 84,
    height: 84,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoSimbolo: { fontSize: 42, fontFamily: fuentes.bold },
  nombreNegocio: {
    fontSize: typography.tituloGrande,
    fontFamily: fuentes.bold,
    marginTop: spacing.lg,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    letterSpacing: -0.5,
  },
  eslogan: {
    fontSize: typography.cuerpoChico,
    marginTop: spacing.sm,
    textAlign: 'center',
    fontFamily: fuentes.regular,
  },
  lista: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  tarjetaUsuario: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: { fontSize: 24, fontFamily: fuentes.bold, color: '#FFFFFF' },
  nombreUsuario: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.semibold,
  },
  vacioTexto: { textAlign: 'center', fontSize: typography.cuerpo },
  puntos: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  punto: {
    width: 14,
    height: 14,
    borderRadius: radius.full,
    borderWidth: 2,
  },
  errorPin: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  errorPinTexto: { fontFamily: fuentes.semibold },
});
