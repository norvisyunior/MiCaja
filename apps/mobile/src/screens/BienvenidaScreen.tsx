import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Gradiente } from '../components/UI';
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
  return (
    <View style={styles.raiz}>
      <Gradiente colores={gradientes.banda} estilo={StyleSheet.absoluteFill} />
      <ScrollView
        contentContainerStyle={styles.contenido}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.icono}>
            <MaterialIcons name="shopping-cart" size={62} color="#FFFFFF" />
          </View>
          <Text style={styles.nombre}>MiCaja</Text>
          <Text style={styles.lema}>Tu punto de venta{'\n'}siempre contigo</Text>
        </View>

        <View style={styles.acciones}>
          <Pressable
            onPress={onCrearCuenta}
            style={({ pressed }) => [styles.comenzar, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.comenzarTexto}>Comenzar</Text>
          </Pressable>
          <Pressable
            onPress={onIniciarSesion}
            style={({ pressed }) => [styles.accede, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.accedeTexto}>Accede de</Text>
          </Pressable>
        </View>

        <View style={styles.secundarias}>
          <Pressable onPress={onActivar} style={styles.secundaria}>
            <Text style={styles.secundariaTexto}>Activar este dispositivo</Text>
          </Pressable>
          <Pressable onPress={onConfigurarLocal} style={styles.secundaria}>
            <Text style={styles.secundariaTexto}>Configurar sin conexión</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1 },
  contenido: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: '18%',
    paddingBottom: spacing.xl,
  },
  hero: { alignItems: 'center' },
  icono: {
    width: 112,
    height: 112,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  nombre: {
    fontSize: typography.hero,
    fontFamily: fuentes.display,
    color: '#FFFFFF',
    marginTop: spacing.xl,
    letterSpacing: -1,
  },
  lema: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.regular,
    color: 'rgba(255, 255, 255, 0.88)',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  acciones: { alignItems: 'center', gap: spacing.md },
  comenzar: {
    minWidth: 220,
    height: 50,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  comenzarTexto: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.semibold,
    color: '#3F3FB0',
  },
  accede: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  accedeTexto: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.medium,
    color: 'rgba(255, 255, 255, 0.9)',
    textDecorationLine: 'underline',
  },
  secundarias: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  secundaria: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  secundariaTexto: {
    fontSize: typography.micro,
    fontFamily: fuentes.medium,
    color: 'rgba(255, 255, 255, 0.7)',
    textDecorationLine: 'underline',
  },
});
