import { Animated, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef } from 'react';
import { useTema } from '../store/tema';
import { fuentes, radius, spacing, typography } from '../theme';

export interface DatoBarra {
  etiqueta: string;
  valor: number;
  max?: boolean;
}

export function Barras({ datos, alto = 120 }: { datos: DatoBarra[]; alto?: number }) {
  const { colores } = useTema();
  const entrada = useRef(new Animated.Value(0)).current;
  const maxValor = Math.max(...datos.map((d) => d.valor), 1);

  useEffect(() => {
    entrada.setValue(0);
    Animated.timing(entrada, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  }, [datos, entrada]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: alto + 26 }}>
      {datos.map((d, i) => {
        const altura = Math.max(6, (d.valor / maxValor) * alto);
        return (
          <View key={`${d.etiqueta}-${i}`} style={{ flex: 1, alignItems: 'center' }}>
            <Text
              style={{
                fontSize: typography.micro,
                fontFamily: fuentes.bold,
                color: d.max ? colores.acento : colores.textoSuave,
                marginBottom: 4,
              }}
            >
              {d.valor > 0 ? d.valor : ''}
            </Text>
            <Animated.View
              style={{
                width: '100%',
                maxWidth: 34,
                height: altura,
                backgroundColor: d.max ? colores.acento : colores.primarioSuave,
                borderTopLeftRadius: radius.sm,
                borderTopRightRadius: radius.sm,
                opacity: entrada,
                transform: [
                  {
                    scaleY: entrada.interpolate({ inputRange: [0, 1], outputRange: [0.1, 1] }),
                  },
                ],
              }}
            />
            <Text
              style={{
                fontSize: typography.micro,
                fontFamily: fuentes.semibold,
                color: colores.textoSuave,
                marginTop: 6,
              }}
            >
              {d.etiqueta}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function BarraApilada({
  segmentos,
}: {
  segmentos: { etiqueta: string; valor: number; color: string }[];
}) {
  const { colores } = useTema();
  const total = segmentos.reduce((a, s) => a + s.valor, 0);
  if (total <= 0) {
    return (
      <View style={[styles.barraApilada, { backgroundColor: colores.superficieSuave }]}>
        <View style={[styles.barraApiladaVacia, { backgroundColor: colores.superficieSuave }]} />
      </View>
    );
  }
  return (
    <View style={[styles.barraApilada, { backgroundColor: colores.superficieSuave }]}>
      {segmentos.map((s) => (
        <View
          key={s.etiqueta}
          style={{ flex: s.valor / total, backgroundColor: s.color, minHeight: 14, borderRightWidth: 2, borderRightColor: colores.superficie }}
        />
      ))}
    </View>
  );
}

export function FilasProgreso({
  items,
  simbolo = '',
}: {
  items: { emoji: string; nombre: string; valor: number; detalle: string }[];
  simbolo?: string;
}) {
  const { colores } = useTema();
  const maxValor = Math.max(...items.map((i) => i.valor), 1);
  return (
    <View style={{ gap: spacing.md }}>
      {items.map((it, i) => (
        <View key={`${it.nombre}-${i}`} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={{ fontSize: 18 }}>{it.emoji}</Text>
            <Text
              style={{ flex: 1, fontSize: typography.cuerpo, fontFamily: fuentes.semibold, color: colores.texto }}
              numberOfLines={1}
            >
              {it.nombre}
            </Text>
            <Text style={{ fontSize: typography.cuerpoChico, fontFamily: fuentes.bold, color: colores.textoSuave }}>
              {it.detalle}
            </Text>
          </View>
          <View
            style={{
              height: 10,
              borderRadius: radius.full,
              backgroundColor: colores.superficieSuave,
              overflow: 'hidden',
            }}
          >
            <Animated.View
              style={{
                width: `${Math.max(4, (it.valor / maxValor) * 100)}%`,
                height: '100%',
                borderRadius: radius.full,
                backgroundColor: colores.acento,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export function AnilloProgreso({ valor }: { valor: number }) {
  const { colores } = useTema();
  const avance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(avance, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, [avance]);
  const ancho = 14;
  const radio = 54;
  return (
    <View>
      <View
        style={{
          width: (radio + ancho / 2) * 2,
          height: (radio + ancho / 2) * 2,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: ancho,
          borderColor: colores.superficieSuave,
        }}
      >
        <Animated.View
          style={{
            position: 'absolute',
            width: (radio + ancho / 2) * 2,
            height: (radio + ancho / 2) * 2,
            borderWidth: ancho,
            borderColor: colores.acento,
            borderTopColor: 'transparent',
            borderRightColor: 'transparent',
            transform: [
              {
                rotate: avance.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['-90deg', `${-90 + 360 * valor}deg`],
                }),
              },
            ],
          }}
        />
        <Text
          style={{
            fontSize: typography.titulo,
            fontFamily: fuentes.bold,
            color: colores.texto,
            fontVariant: ['tabular-nums'],
          }}
        >
          {Math.round(valor * 100)}%
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barraApilada: {
    height: 14,
    flexDirection: 'row',
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  barraApiladaVacia: { flex: 1 },
});
