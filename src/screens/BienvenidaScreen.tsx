import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Boton, Gradiente, Pantalla, Tarjeta } from '../components/UI';
import { useTema } from '../store/tema';
import { fuentes, gradientes, radius, spacing, typography } from '../theme';

export default function BienvenidaScreen({
  onIniciarSesion,
  onCrearCuenta,
  onActivar,
  onConfigurarLocal,
}: {
  onIniciarSesion: () => void;
  onCrearCuenta: () => void;
  onActivar: () => void;
  onConfigurarLocal: () => void;
}) {
  const { colores } = useTema();

  return (
    <Pantalla>
      <ScrollView
        contentContainerStyle={styles.contenido}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Gradiente colores={gradientes.primario} estilo={styles.logo}>
            <Text style={styles.logoTexto}>$</Text>
          </Gradiente>
          <Text style={[styles.titulo, { color: colores.texto }]}>
            Tu caja, lista en minutos
          </Text>
          <Text style={[styles.subtitulo, { color: colores.textoSuave }]}>
            Vende incluso sin Internet. Cuando vuelvas a conectarte, todo se sincroniza solo.
          </Text>
        </View>

        <Tarjeta estilo={styles.tarjeta}>
          <Boton
            titulo="Crear cuenta"
            icono="person-add"
            tamanio="lg"
            onPress={onCrearCuenta}
          />
          <Boton
            titulo="Ya tengo cuenta"
            icono="login"
            variante="secundario"
            tamanio="lg"
            onPress={onIniciarSesion}
            estilo={{ marginTop: spacing.md }}
          />
          <Boton
            titulo="Activar este dispositivo"
            icono="phonelink-lock"
            variante="fantasma"
            tamanio="lg"
            onPress={onActivar}
            estilo={{ marginTop: spacing.sm }}
          />
        </Tarjeta>

        <View style={styles.ventajas}>
          <Ventaja icono="wifi-off" texto="Funciona sin conexión" />
          <Ventaja icono="sync" texto="Sincroniza ventas y stock" />
          <Ventaja icono="devices" texto="Varios dispositivos por negocio" />
        </View>

        <Pressable
          onPress={onConfigurarLocal}
          style={({ pressed }) => [styles.local, pressed && { opacity: 0.6 }]}
        >
          <MaterialIcons name="settings" size={16} color={colores.textoSuave} />
          <Text style={[styles.localTexto, { color: colores.textoSuave }]}>
            Configurar sin conexión
          </Text>
        </Pressable>
      </ScrollView>
    </Pantalla>
  );
}

function Ventaja({ icono, texto }: { icono: 'wifi-off' | 'sync' | 'devices'; texto: string }) {
  const { colores } = useTema();
  return (
    <View style={styles.ventaja}>
      <View
        style={[
          styles.ventajaIcono,
          { backgroundColor: colores.acentoSuave, borderColor: colores.borde },
        ]}
      >
        <MaterialIcons name={icono} size={18} color={colores.acento} />
      </View>
      <Text style={[styles.ventajaTexto, { color: colores.textoSuave }]}>{texto}</Text>
    </View>
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
    width: 82,
    height: 82,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoTexto: {
    fontSize: 42,
    fontFamily: fuentes.bold,
    color: '#FFFFFF',
  },
  titulo: {
    fontSize: typography.tituloGrande,
    fontFamily: fuentes.bold,
    marginTop: spacing.lg,
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  subtitulo: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.regular,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 330,
  },
  tarjeta: {
    width: '100%',
  },
  ventajas: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  ventaja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  ventajaIcono: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ventajaTexto: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.medium,
  },
  local: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
    padding: spacing.sm,
  },
  localTexto: {
    fontSize: typography.micro,
    fontFamily: fuentes.medium,
  },
});
