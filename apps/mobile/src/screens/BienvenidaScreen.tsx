import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Gradiente } from '../components/UI';
import { fuentes, gradientes, radius, spacing, typography } from '../theme';

export default function BienvenidaScreen({
  onIniciarSesion,
  onCrearCuenta,
}: {
  onIniciarSesion: () => void;
  onCrearCuenta: () => void;
}) {
  const heroTemprano = useRef(new Animated.Value(0)).current;
  const accionesTemprano = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let activo = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!activo) return;
      if (reduce) {
        heroTemprano.setValue(1);
        accionesTemprano.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.timing(heroTemprano, {
          toValue: 1,
          duration: 650,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(accionesTemprano, {
          toValue: 1,
          duration: 550,
          delay: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });
    return () => {
      activo = false;
    };
  }, [heroTemprano, accionesTemprano]);

  return (
    <View style={styles.raiz}>
      <StatusBar style="light" />
      <Gradiente colores={gradientes.bienvenida} estilo={StyleSheet.absoluteFill} />
      <View style={styles.figuras} pointerEvents="none">
        <View style={styles.figuraSuperior} />
        <View style={styles.figuraInferior} />
        <View style={styles.figuraPequena} />
      </View>

      <View style={styles.contenido}>
        <Animated.View
          style={[
            styles.hero,
            {
              opacity: heroTemprano,
              transform: [
                {
                  translateY: heroTemprano.interpolate({
                    inputRange: [0, 1],
                    outputRange: [18, 0],
                  }),
                },
                {
                  scale: heroTemprano.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.94, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <MaterialIcons name="shopping-cart" size={76} color="#FFFFFF" style={styles.icono} />
          <Text style={styles.nombre}>MiCaja</Text>
          <Text style={styles.lema}>Tu punto de venta{'\n'}siempre contigo</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.acciones,
            {
              opacity: accionesTemprano,
              transform: [
                {
                  translateY: accionesTemprano.interpolate({
                    inputRange: [0, 1],
                    outputRange: [14, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            onPress={onCrearCuenta}
            accessibilityRole="button"
            style={({ pressed }) => [styles.comenzar, pressed && { opacity: 0.86 }]}
          >
            <Text style={styles.comenzarTexto}>Comenzar</Text>
          </Pressable>
          <Pressable
            onPress={onIniciarSesion}
            accessibilityRole="button"
            style={({ pressed }) => [styles.accede, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.accedeTexto}>Accede de</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1, overflow: 'hidden' },
  figuras: StyleSheet.absoluteFill,
  figuraSuperior: {
    position: 'absolute',
    top: -140,
    right: -120,
    width: 300,
    height: 300,
    borderRadius: 82,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    transform: [{ rotate: '26deg' }],
  },
  figuraInferior: {
    position: 'absolute',
    bottom: -230,
    left: -160,
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: 'rgba(255, 255, 255, 0.055)',
  },
  figuraPequena: {
    position: 'absolute',
    top: 132,
    left: -76,
    width: 132,
    height: 132,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.045)',
    transform: [{ rotate: '-22deg' }],
  },
  contenido: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: '17%',
    paddingBottom: '12%',
  },
  hero: { alignItems: 'center' },
  icono: {
    textShadowColor: 'rgba(255, 255, 255, 0.28)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  nombre: {
    fontSize: typography.hero + 6,
    fontFamily: fuentes.extrabold,
    color: '#FFFFFF',
    marginTop: spacing.xl,
    letterSpacing: -1.5,
    lineHeight: typography.hero + 8,
  },
  lema: {
    fontSize: typography.cuerpo + 1,
    fontFamily: fuentes.medium,
    color: 'rgba(255, 255, 255, 0.92)',
    textAlign: 'center',
    lineHeight: 25,
    marginTop: spacing.sm,
  },
  acciones: { alignItems: 'center', gap: spacing.md },
  comenzar: {
    minWidth: 220,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    shadowColor: '#1E1259',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  comenzarTexto: {
    fontSize: typography.cuerpo + 1,
    fontFamily: fuentes.semibold,
    color: '#4A32B8',
  },
  accede: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  accedeTexto: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.medium,
    color: 'rgba(255, 255, 255, 0.94)',
    textDecorationLine: 'underline',
  },
});
