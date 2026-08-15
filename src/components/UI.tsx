import React, {
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTema } from '../store/tema';
import {
  fuentes,
  gradientes,
  paletaProductos,
  radius,
  spacing,
  typography,
  type PaletaColores,
} from '../theme';

export type NombreIcono = ComponentProps<typeof MaterialIcons>['name'];

export function useEstilos<T extends StyleSheet.NamedStyles<T>>(
  fabrica: (c: PaletaColores) => T
): T {
  const { colores } = useTema();
  return useMemo(() => fabrica(colores), [fabrica, colores]);
}

export function Gradiente({
  colores,
  inicio = { x: 0, y: 0 },
  fin = { x: 1, y: 1 },
  estilo,
  children,
}: {
  colores: readonly string[];
  inicio?: { x: number; y: number };
  fin?: { x: number; y: number };
  estilo?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  return (
    <LinearGradient
      colors={[...colores] as [string, string, ...string[]]}
      start={inicio}
      end={fin}
      style={estilo}
    >
      {children}
    </LinearGradient>
  );
}

export function Pantalla({
  children,
  estilo,
}: {
  children: ReactNode;
  estilo?: StyleProp<ViewStyle>;
}) {
  const { colores } = useTema();
  return (
    <SafeAreaView
      style={[{ flex: 1, backgroundColor: colores.fondo }, estilo]}
      edges={['top', 'left', 'right']}
    >
      <View
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        <Gradiente
          colores={[colores.fondoProfundo, colores.fondo]}
          inicio={{ x: 0.5, y: 0 }}
          fin={{ x: 0.5, y: 1 }}
          estilo={StyleSheet.absoluteFill}
        />
        <Gradiente
          colores={['rgba(124, 58, 237, 0.08)', 'rgba(8, 10, 36, 0)']}
          inicio={{ x: 0.5, y: 0 }}
          fin={{ x: 0.5, y: 1 }}
          estilo={{ position: 'absolute', top: 0, left: 0, right: 0, height: 280 }}
        />
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </SafeAreaView>
  );
}

export function SombraDura({
  children,
  offset = 4,
  redondeo = radius.md,
  estilo,
}: {
  children: ReactNode;
  offset?: number;
  redondeo?: number;
  estilo?: StyleProp<ViewStyle>;
}) {
  const { colores } = useTema();
  return (
    <View
      style={[
        {
          borderRadius: redondeo,
          backgroundColor: colores.vidrio,
          shadowColor: colores.sombra,
          shadowOpacity: 0.32,
          shadowRadius: offset * 6,
          shadowOffset: { width: 0, height: offset },
          elevation: offset * 2,
        },
        estilo,
      ]}
    >
      {children}
    </View>
  );
}

export function ReglaPunteada({
  color,
  grosor = StyleSheet.hairlineWidth,
  estilo,
}: {
  color?: string;
  grosor?: number;
  estilo?: StyleProp<ViewStyle>;
}) {
  const { colores } = useTema();
  return (
    <View
      style={[
        { borderTopWidth: grosor, borderColor: color ?? colores.borde },
        estilo,
      ]}
    />
  );
}

const TIPOS_BOTON: Record<
  string,
  {
    grad?: readonly string[];
    bg?: (c: PaletaColores) => string;
    texto: (c: PaletaColores) => string;
    borde?: (c: PaletaColores) => string;
  }
> = {
  primario: { grad: gradientes.cta, texto: () => '#FFFFFF' },
  acento: { grad: gradientes.cobrar, texto: () => '#FFFFFF' },
  peligro: { grad: gradientes.peligro, texto: () => '#FFFFFF' },
  secundario: {
    bg: (c) => c.vidrioSuave,
    texto: (c) => c.texto,
    borde: (c) => c.borde,
  },
  fantasma: { bg: () => 'transparent', texto: (c) => c.primario, borde: (c) => c.borde },
  suave: { bg: (c) => c.primarioSuave, texto: (c) => c.texto },
};

const TAMANOS_BOTON = {
  sm: { alto: 44, fontSize: 13, icono: 17, gap: 6, redondeo: radius.md },
  md: { alto: 52, fontSize: 15, icono: 19, gap: 8, redondeo: radius.md },
  lg: { alto: 56, fontSize: 16, icono: 21, gap: 8, redondeo: radius.lg },
  xl: { alto: 64, fontSize: 18, icono: 24, gap: 10, redondeo: radius.lg },
} as const;

export function Boton({
  titulo,
  variante = 'primario',
  tamanio = 'md',
  icono,
  onPress,
  cargando,
  bloqueado,
  estilo,
}: {
  titulo: string;
  variante?: keyof typeof TIPOS_BOTON;
  tamanio?: keyof typeof TAMANOS_BOTON;
  icono?: NombreIcono;
  onPress?: () => void;
  cargando?: boolean;
  bloqueado?: boolean;
  estilo?: StyleProp<ViewStyle>;
}) {
  const { colores } = useTema();
  const escala = useMemo(() => new Animated.Value(1), []);
  const tipo = TIPOS_BOTON[variante];
  const tam = TAMANOS_BOTON[tamanio];
  const inactivo = bloqueado || cargando;
  const colorTexto = tipo.texto(colores);

  return (
    <Animated.View style={[{ transform: [{ scale: escala }] }, estilo]}>
      <Pressable
        onPress={inactivo ? undefined : onPress}
        disabled={inactivo}
        onPressIn={() => {
          Animated.timing(escala, {
            toValue: 0.97,
            duration: 90,
            useNativeDriver: true,
          }).start();
        }}
        onPressOut={() => {
          Animated.timing(escala, {
            toValue: 1,
            duration: 140,
            useNativeDriver: true,
          }).start();
        }}
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: tam.redondeo,
            paddingHorizontal: spacing.xl,
            backgroundColor: tipo.grad
              ? 'transparent'
              : tipo.bg
                ? tipo.bg(colores)
                : 'transparent',
            borderWidth: tipo.borde && !tipo.grad ? StyleSheet.hairlineWidth : 0,
            borderColor: tipo.borde && !tipo.grad ? tipo.borde(colores) : 'transparent',
            height: tam.alto,
            opacity: inactivo ? 0.4 : pressed ? 0.9 : 1,
            gap: tam.gap,
            overflow: 'hidden',
          },
        ]}
      >
        {tipo.grad ? (
          <Gradiente
            colores={tipo.grad}
            estilo={StyleSheet.absoluteFill}
          />
        ) : null}
        {cargando ? (
          <ActivityIndicator color={colorTexto} size="small" />
        ) : (
          <>
            {icono ? (
              <MaterialIcons name={icono} size={tam.icono} color={colorTexto} />
            ) : null}
            <Text
              style={{
                fontFamily: fuentes.semibold,
                color: colorTexto,
                fontSize: tam.fontSize,
                letterSpacing: 0.2,
              }}
            >
              {titulo}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

export function Tarjeta({
  children,
  estilo,
  onPress,
  redondeo = radius.lg,
  contorno = true,
}: {
  children: ReactNode;
  estilo?: StyleProp<ViewStyle>;
  onPress?: () => void;
  redondeo?: number;
  contorno?: boolean;
}) {
  const { colores } = useTema();
  const contenido = (
    <View
      style={[
        styles.tarjeta,
        {
          backgroundColor: colores.vidrio,
          borderRadius: redondeo,
          borderWidth: contorno ? StyleSheet.hairlineWidth : 0,
          borderColor: contorno ? colores.borde : 'transparent',
          shadowColor: colores.sombra,
          shadowOpacity: 0.25,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 8 },
          elevation: 4,
        },
        estilo,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return contenido;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ width: '100%' }, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
    >
      {contenido}
    </Pressable>
  );
}

export function Encabezado({
  titulo,
  subtitulo,
  derecha,
  onAtras,
}: {
  titulo: string;
  subtitulo?: string;
  derecha?: ReactNode;
  onAtras?: () => void;
}) {
  const { colores } = useTema();
  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        {onAtras ? (
          <Pressable
            onPress={onAtras}
            hitSlop={8}
            style={({ pressed }) => [
              {
                width: 42,
                height: 42,
                borderRadius: radius.full,
                backgroundColor: colores.vidrioSuave,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colores.borde,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale: pressed ? 0.92 : 1 }],
              },
            ]}
          >
            <MaterialIcons name="arrow-back" size={22} color={colores.texto} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: typography.subtitulo,
              fontFamily: fuentes.bold,
              color: colores.texto,
              letterSpacing: -0.3,
            }}
          >
            {titulo}
          </Text>
          {subtitulo ? (
            <Text
              style={{
                fontSize: typography.cuerpoChico,
                color: colores.textoSuave,
                marginTop: 2,
                fontFamily: fuentes.regular,
              }}
            >
              {subtitulo}
            </Text>
          ) : null}
        </View>
        {derecha ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>{derecha}</View> : null}
      </View>
    </View>
  );
}

export function Chip({
  etiqueta,
  activo,
  onPress,
  color,
  icono,
  estilo,
}: {
  etiqueta: string;
  activo?: boolean;
  onPress?: () => void;
  color?: string;
  icono?: NombreIcono;
  estilo?: StyleProp<ViewStyle>;
}) {
  const { colores } = useTema();
  const base = color ?? colores.acento;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: activo ? base : colores.vidrioSuave,
          borderColor: activo ? base : colores.borde,
          borderWidth: StyleSheet.hairlineWidth,
          transform: [{ scale: pressed ? 0.95 : 1 }],
        },
        estilo,
      ]}
    >
      {icono ? (
        <MaterialIcons name={icono} size={15} color={activo ? colores.textoInverso : colores.textoSuave} />
      ) : null}
      <Text
        style={[
          styles.chipTexto,
          { color: activo ? colores.textoInverso : colores.texto },
        ]}
      >
        {etiqueta}
      </Text>
    </Pressable>
  );
}

export function Sello({
  texto,
  color,
  colorTexto,
}: {
  texto: string;
  color?: string;
  colorTexto?: string;
  rotacion?: number;
}) {
  const { colores } = useTema();
  const fondo = color ? color + '1A' : colores.superficieSuave;
  return (
    <View
      style={{
        backgroundColor: fondo,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: color ? color + '3D' : colores.borde,
        borderRadius: radius.full,
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          fontFamily: fuentes.semibold,
          fontSize: 11,
          letterSpacing: 0.4,
          color: colorTexto ?? color ?? colores.texto,
        }}
      >
        {texto}
      </Text>
    </View>
  );
}

export function Badge({
  texto,
  color,
  colorTexto,
  icono,
}: {
  texto: string;
  color?: string;
  colorTexto?: string;
  icono?: NombreIcono;
}) {
  const { colores } = useTema();
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: color ?? colores.superficieSuave,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colorTexto ? colorTexto + '2E' : colores.borde,
        },
      ]}
    >
      {icono ? <MaterialIcons name={icono} size={13} color={colorTexto ?? colores.textoSuave} /> : null}
      <Text style={[styles.badgeTexto, { color: colorTexto ?? colores.textoSuave }]}>{texto}</Text>
    </View>
  );
}

export function EstadoStock({ stock, stockMinimo }: { stock: number; stockMinimo: number }) {
  const { colores } = useTema();
  if (stock <= 0) {
    return <Badge texto="Agotado" color={colores.peligroSuave} colorTexto={colores.peligro} icono="block" />;
  }
  if (stock <= stockMinimo) {
    return (
      <Badge
        texto={`${stock} en stock`}
        color={colores.advertenciaSuave}
        colorTexto={colores.advertencia}
        icono="warning"
      />
    );
  }
  return (
    <Badge
      texto={`${stock} en stock`}
      color={colores.exitoSuave}
      colorTexto={colores.exito}
      icono="check-circle"
    />
  );
}

export function Campo({
  etiqueta,
  valor,
  onChange,
  placeholder,
  icono,
  teclado,
  multiline,
  autoFocus,
  sufijo,
}: {
  etiqueta?: string;
  valor: string;
  onChange: (texto: string) => void;
  placeholder?: string;
  icono?: NombreIcono;
  teclado?: KeyboardTypeOptions;
  multiline?: boolean;
  autoFocus?: boolean;
  sufijo?: string;
}) {
  const { colores } = useTema();
  const [enfocado, setEnfocado] = useState(false);
  return (
    <View style={{ marginBottom: spacing.md }}>
      {etiqueta ? (
        <Text
          style={{
            fontSize: typography.micro,
            fontFamily: fuentes.semibold,
            color: colores.textoSuave,
            letterSpacing: 0.5,
            marginBottom: 6,
          }}
        >
          {etiqueta}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          backgroundColor: colores.superficie,
          borderWidth: 1.5,
          borderColor: enfocado ? colores.bordeLuminoso : colores.borde,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          minHeight: 52,
          shadowColor: colores.acento,
          shadowOpacity: enfocado ? 0.25 : 0,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 0 },
          elevation: enfocado ? 3 : 0,
        }}
      >
        {icono ? <MaterialIcons name={icono} size={20} color={colores.textoSuave} /> : null}
        <TextInput
          style={{
            flex: 1,
            fontSize: typography.cuerpo,
            color: colores.texto,
            paddingVertical: 10,
            fontFamily: fuentes.medium,
          }}
          value={valor}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colores.textoSuave}
          keyboardType={teclado}
          multiline={multiline}
          autoFocus={autoFocus}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setEnfocado(false)}
        />
        {sufijo ? (
          <Text style={{ fontSize: typography.cuerpo, fontFamily: fuentes.semibold, color: colores.textoSuave }}>{sufijo}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function Contador({
  cantidad,
  onMas,
  onMenos,
}: {
  cantidad: number;
  onMas: () => void;
  onMenos: () => void;
}) {
  const { colores } = useTema();
  return (
    <View
      style={[
        styles.contador,
        { backgroundColor: colores.vidrioSuave, borderWidth: StyleSheet.hairlineWidth, borderColor: colores.borde },
      ]}
    >
      <Pressable
        onPress={onMenos}
        disabled={cantidad <= 1}
        style={({ pressed }) => [
          styles.contadorBoton,
          { backgroundColor: colores.superficieSuave },
          (pressed || cantidad <= 1) && { opacity: 0.4 },
        ]}
      >
        <MaterialIcons name="remove" size={18} color={colores.texto} />
      </Pressable>
      <Text style={[styles.contadorCantidad, { color: colores.texto }]}>{cantidad}</Text>
      <Pressable
        onPress={onMas}
        style={({ pressed }) => [
          styles.contadorBoton,
          { backgroundColor: colores.superficieSuave },
          pressed && { opacity: 0.4 },
        ]}
      >
        <MaterialIcons name="add" size={18} color={colores.texto} />
      </Pressable>
    </View>
  );
}

export function ListaVacia({
  emoji,
  titulo,
  subtitulo,
}: {
  emoji: string;
  titulo: string;
  subtitulo?: string;
}) {
  const { colores } = useTema();
  return (
    <View style={styles.vacio}>
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: radius.full,
          backgroundColor: colores.vidrioSuave,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colores.borde,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.sm,
        }}
      >
        <Text style={{ fontSize: 36 }}>{emoji}</Text>
      </View>
      <Text
        style={{
          fontSize: typography.destacado,
          fontFamily: fuentes.bold,
          color: colores.texto,
          textAlign: 'center',
        }}
      >
        {titulo}
      </Text>
      {subtitulo ? (
        <Text
          style={{
            fontSize: typography.cuerpoChico,
            color: colores.textoSuave,
            textAlign: 'center',
            fontFamily: fuentes.regular,
          }}
        >
          {subtitulo}
        </Text>
      ) : null}
    </View>
  );
}

export function EstadoCarga({ mensaje = 'Cargando…' }: { mensaje?: string }) {
  const { colores } = useTema();
  return (
    <View style={styles.vacio}>
      <ActivityIndicator size="large" color={colores.acento} />
      <Text
        style={{
          fontSize: typography.cuerpoChico,
          color: colores.textoSuave,
          fontFamily: fuentes.medium,
        }}
      >
        {mensaje}
      </Text>
    </View>
  );
}

export function Hoja({
  visible,
  onCerrar,
  titulo,
  subtitulo,
  children,
  alturaMaxima = 0.85,
  pie,
}: {
  visible: boolean;
  onCerrar: () => void;
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
  alturaMaxima?: number;
  pie?: ReactNode;
}) {
  const { colores } = useTema();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCerrar}
      statusBarTranslucent
    >
      <View style={[styles.hojaFondo, { backgroundColor: colores.overlay }]}>
        <Pressable style={{ flex: 1 }} onPress={onCerrar} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.hoja,
            {
              backgroundColor: colores.superficie,
              borderTopColor: colores.bordeLuminoso,
              borderTopWidth: StyleSheet.hairlineWidth,
              maxHeight: alturaMaxima * 1000,
            },
          ]}
        >
          <View style={{ alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
            <View style={[styles.hojaMango, { backgroundColor: colores.textoSuave }]} />
          </View>
          <View style={styles.hojaCabecera}>
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: typography.subtitulo,
                  fontFamily: fuentes.bold,
                  color: colores.texto,
                  letterSpacing: -0.3,
                }}
              >
                {titulo}
              </Text>
              {subtitulo ? (
                <Text
                  style={{
                    fontSize: typography.cuerpoChico,
                    color: colores.textoSuave,
                    marginTop: 2,
                    fontFamily: fuentes.regular,
                  }}
                >
                  {subtitulo}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={onCerrar}
              hitSlop={8}
              style={({ pressed }) => [
                styles.hojaCerrar,
                {
                  backgroundColor: colores.vidrioSuave,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colores.borde,
                  transform: [{ scale: pressed ? 0.9 : 1 }],
                },
              ]}
            >
              <MaterialIcons name="close" size={18} color={colores.texto} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.hojaContenido}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {pie ? (
            <View>
              <ReglaPunteada estilo={{ marginHorizontal: spacing.lg }} />
              <View style={[styles.hojaPie, { backgroundColor: colores.superficie }]}>
                {pie}
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export function ConfirmarModal({
  visible,
  onCerrar,
  onConfirmar,
  titulo,
  mensaje,
  textoConfirmar = 'Confirmar',
  peligro,
}: {
  visible: boolean;
  onCerrar: () => void;
  onConfirmar: () => void;
  titulo: string;
  mensaje: string;
  textoConfirmar?: string;
  peligro?: boolean;
}) {
  const { colores } = useTema();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <View style={[styles.confirmarFondo, { backgroundColor: colores.overlay }]}>
        <SombraDura offset={6} redondeo={radius.xl} estilo={{ width: '100%', maxWidth: 400 }}>
          <View
            style={[
              styles.confirmarTarjeta,
              {
                backgroundColor: 'transparent',
              },
            ]}
          >
            <Text
              style={{
                fontSize: typography.subtitulo,
                fontFamily: fuentes.bold,
                color: colores.texto,
                letterSpacing: -0.3,
              }}
            >
              {titulo}
            </Text>
            <Text
              style={{
                fontSize: typography.cuerpo,
                color: colores.textoSuave,
                marginTop: spacing.sm,
                marginBottom: spacing.xl,
                fontFamily: fuentes.regular,
                lineHeight: 22,
              }}
            >
              {mensaje}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Boton titulo="Cancelar" variante="secundario" tamanio="sm" onPress={onCerrar} estilo={{ flex: 1 }} />
              <Boton
                titulo={textoConfirmar}
                variante={peligro ? 'peligro' : 'primario'}
                tamanio="sm"
                onPress={() => {
                  onCerrar();
                  onConfirmar();
                }}
                estilo={{ flex: 1 }}
              />
            </View>
          </View>
        </SombraDura>
      </View>
    </Modal>
  );
}

export function PinPad({
  onDigito,
  onBorrar,
}: {
  onDigito: (d: string) => void;
  onBorrar: () => void;
}) {
  const { colores } = useTema();
  const filas = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', '⌫'],
  ];
  return (
    <View style={{ gap: spacing.sm }}>
      {filas.map((fila, fi) => (
        <View key={fi} style={{ flexDirection: 'row', gap: spacing.sm }}>
          {fila.map((d, di) => {
            if (d === '') return <View key={di} style={styles.pinpadTeclaVacia} />;
            const esBorrar = d === '⌫';
            return (
              <Pressable
                key={di}
                onPress={() => (esBorrar ? onBorrar() : onDigito(d))}
                style={({ pressed }) => [
                  styles.pinpadTecla,
                  {
                    backgroundColor: esBorrar ? colores.peligroSuave : colores.vidrioSuave,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: esBorrar ? colores.peligroSuave : colores.borde,
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                {esBorrar ? (
                  <MaterialIcons name="backspace" size={22} color={colores.peligro} />
                ) : (
                  <Text
                    style={{
                      fontSize: 24,
                      fontFamily: fuentes.display,
                      color: colores.texto,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {d}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function PaletaColores({
  seleccion,
  onSeleccion,
}: {
  seleccion: string;
  onSeleccion: (color: string) => void;
}) {
  const { colores } = useTema();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {paletaProductos.map((c) => {
        const activo = c.toLowerCase() === seleccion.toLowerCase();
        return (
          <Pressable
            key={c}
            onPress={() => onSeleccion(c)}
            style={({ pressed }) => [
              styles.paletaColor,
              { backgroundColor: c, transform: [{ scale: pressed ? 0.85 : 1 }] },
              activo && { borderWidth: 2, borderColor: colores.texto },
            ]}
          >
            {activo ? <MaterialIcons name="check" size={16} color="#fff" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function parsearMonto(texto: string): number {
  const limpio = texto.replace(/\s/g, '').replace(/,/g, '.');
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  chipTexto: {
    fontSize: 13,
    fontFamily: fuentes.medium,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeTexto: {
    fontSize: 11,
    fontFamily: fuentes.semibold,
  },
  contador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    padding: 4,
  },
  contadorBoton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contadorCantidad: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: typography.cuerpo,
    fontFamily: fuentes.extrabold,
    fontVariant: ['tabular-nums'],
  },
  vacio: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.xs },
  tarjeta: {
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  hojaFondo: { flex: 1, justifyContent: 'flex-end' },
  hoja: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.xs,
  },
  hojaMango: {
    width: 44,
    height: 4,
    borderRadius: radius.full,
  },
  hojaCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  hojaCerrar: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hojaContenido: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  hojaPie: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  confirmarFondo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  confirmarTarjeta: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
  },
  pinpadTecla: {
    flex: 1,
    height: 60,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinpadTeclaVacia: { flex: 1, height: 60 },
  paletaColor: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
