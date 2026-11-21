import React, {
  Children,
  Fragment,
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
  useWindowDimensions,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTema } from '../store/tema';
import {
  fuentes,
  gradientes,
  paletaProductos,
  radius,
  sombraFlotante,
  sombraTarjeta,
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

/**
 * Fondo raíz de toda pantalla. El área de la barra de estado queda siempre en
 * indigo para que la "banda" superior de la referencia continúe sin cortes.
 */
export function Pantalla({
  children,
  estilo,
}: {
  children: ReactNode;
  estilo?: StyleProp<ViewStyle>;
}) {
  const { colores } = useTema();
  return (
    <View style={{ flex: 1, backgroundColor: colores.primarioOscuro }}>
      <Gradiente
        colores={gradientes.banda}
        inicio={{ x: 0, y: 0 }}
        fin={{ x: 1, y: 0.8 }}
        estilo={StyleSheet.absoluteFill}
      />
      <SafeAreaView
        style={[{ flex: 1 }, estilo]}
        edges={['top', 'left', 'right']}
      >
        {children}
      </SafeAreaView>
    </View>
  );
}

/**
 * Lienzo blanco con esquinas superiores redondeadas que se apoya sobre la
 * banda indigo, tal como en los mockups de referencia.
 */
export function Superficie({
  children,
  estilo,
}: {
  children: ReactNode;
  estilo?: StyleProp<ViewStyle>;
}) {
  const { colores } = useTema();
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: colores.fondo,
          borderTopLeftRadius: radius.hoja,
          borderTopRightRadius: radius.hoja,
          overflow: 'hidden',
        },
        estilo,
      ]}
    >
      {children}
    </View>
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
          backgroundColor: 'transparent',
          shadowColor: colores.sombra,
          shadowOpacity: 0.14,
          shadowRadius: offset * 4,
          shadowOffset: { width: 0, height: offset },
          elevation: offset * 1.5,
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
    bg?: (c: PaletaColores) => string;
    texto: (c: PaletaColores) => string;
    borde?: (c: PaletaColores) => string;
  }
> = {
  primario: { bg: (c) => c.primario, texto: () => '#FFFFFF' },
  acento: { bg: (c) => c.primario, texto: () => '#FFFFFF' },
  peligro: { bg: (c) => c.peligro, texto: () => '#FFFFFF' },
  secundario: {
    bg: (c) => c.superficie,
    texto: (c) => c.primario,
    borde: (c) => c.borde,
  },
  fantasma: { bg: () => 'transparent', texto: (c) => c.primario, borde: (c) => c.borde },
  suave: { bg: (c) => c.primarioSuave, texto: (c) => c.primario },
};

const TAMANOS_BOTON = {
  sm: { alto: 44, fontSize: 13, icono: 17, gap: 6, redondeo: radius.md },
  md: { alto: 52, fontSize: 15, icono: 19, gap: 8, redondeo: radius.boton },
  lg: { alto: 54, fontSize: 16, icono: 20, gap: 8, redondeo: radius.boton },
  xl: { alto: 60, fontSize: 17, icono: 22, gap: 10, redondeo: radius.boton },
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
            toValue: 0.985,
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
            backgroundColor: tipo.bg ? tipo.bg(colores) : 'transparent',
            borderWidth: tipo.borde ? 1 : 0,
            borderColor: tipo.borde ? tipo.borde(colores) : 'transparent',
            height: tam.alto,
            opacity: inactivo ? 0.38 : pressed ? 0.88 : 1,
            gap: tam.gap,
            overflow: 'hidden',
          },
        ]}
      >
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
                letterSpacing: 0.1,
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
  redondeo = radius.tarjeta,
  contorno = true,
  padding = spacing.md,
}: {
  children: ReactNode;
  estilo?: StyleProp<ViewStyle>;
  onPress?: () => void;
  redondeo?: number;
  contorno?: boolean;
  padding?: number;
}) {
  const { colores } = useTema();
  const contenido = (
    <View
      style={[
        {
          backgroundColor: colores.superficie,
          borderRadius: redondeo,
          borderWidth: contorno ? 1 : 0,
          borderColor: contorno ? colores.borde : 'transparent',
          padding,
          ...sombraTarjeta(colores),
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
      style={({ pressed }) => [
        pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] },
      ]}
    >
      {contenido}
    </Pressable>
  );
}

/**
 * Lista agrupada dentro de una sola tarjeta.
 */
export function Grupo({
  children,
  estilo,
  sangria = 76,
}: {
  children: ReactNode;
  estilo?: StyleProp<ViewStyle>;
  sangria?: number;
}) {
  const { colores } = useTema();
  const items = Children.toArray(children).filter(Boolean);

  return (
    <View
      style={[
        {
          backgroundColor: colores.superficie,
          borderRadius: radius.tarjeta,
          borderWidth: 1,
          borderColor: colores.borde,
          overflow: 'hidden',
        },
        estilo,
      ]}
    >
      {items.map((child, indice) => (
        <Fragment key={indice}>
          {indice > 0 ? (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: colores.borde,
                marginLeft: sangria,
                marginRight: spacing.md,
              }}
            />
          ) : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

/**
 * Banda indigo superior. En las pantallas internas lleva solo la flecha de
 * regreso y, opcionalmente, una acción a la derecha.
 */
export function Encabezado({
  titulo,
  subtitulo,
  derecha,
  onAtras,
  marca,
  estilo,
}: {
  titulo?: string;
  subtitulo?: string;
  derecha?: ReactNode;
  onAtras?: () => void;
  marca?: ReactNode;
  estilo?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, estilo]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36 }}>
        {onAtras ? (
          <Pressable
            onPress={onAtras}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Volver"
            style={({ pressed }) => [
              {
                width: 36,
                height: 36,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <MaterialIcons name="arrow-back" size={22} color="#FFFFFF" />
          </Pressable>
        ) : null}
        {marca ?? (
          <View style={{ flex: 1, minWidth: 0 }}>
            {titulo ? (
              <Text
                numberOfLines={1}
                style={{
                  fontSize: typography.destacado,
                  fontFamily: fuentes.display,
                  color: '#FFFFFF',
                  letterSpacing: -0.2,
                }}
              >
                {titulo}
              </Text>
            ) : null}
          </View>
        )}
        {derecha ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              flexShrink: 0,
            }}
          >
            {derecha}
          </View>
        ) : null}
      </View>
      {subtitulo ? (
        <Text
          numberOfLines={1}
          style={{
            fontSize: typography.micro,
            color: 'rgba(255, 255, 255, 0.74)',
            marginTop: 2,
            marginLeft: onAtras ? 44 : 0,
            fontFamily: fuentes.regular,
          }}
        >
          {subtitulo}
        </Text>
      ) : null}
    </View>
  );
}

/** Marca de la app para la banda indigo del inicio. */
export function MarcaMiCaja({ compacta = false }: { compacta?: boolean }) {
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <MaterialIcons name="shopping-cart" size={compacta ? 24 : 26} color="#FFFFFF" />
      <Text
        style={{
          fontSize: compacta ? 21 : 23,
          fontFamily: fuentes.display,
          color: '#FFFFFF',
          letterSpacing: -0.5,
        }}
      >
        MiCaja
      </Text>
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
  const base = color ?? colores.primario;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: activo ? (color ? base + '1F' : colores.primarioSuave) : colores.superficie,
          borderColor: activo ? 'transparent' : colores.borde,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        estilo,
      ]}
    >
      {icono ? (
        <MaterialIcons name={icono} size={16} color={activo ? base : colores.textoSuave} />
      ) : null}
      <Text
        style={[
          styles.chipTexto,
          {
            color: activo ? base : colores.textoSuave,
            fontFamily: activo ? fuentes.semibold : fuentes.medium,
          },
        ]}
      >
        {etiqueta}
      </Text>
    </Pressable>
  );
}

export function Segmentado<T extends string>({
  opciones,
  valor,
  onCambio,
  estilo,
}: {
  opciones: { id: T; etiqueta: string }[];
  valor: T;
  onCambio: (id: T) => void;
  estilo?: StyleProp<ViewStyle>;
}) {
  const { colores } = useTema();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          backgroundColor: colores.superficieSuave,
          borderRadius: radius.lg,
          padding: 4,
          gap: 4,
        },
        estilo,
      ]}
    >
      {opciones.map((o) => {
        const activo = o.id === valor;
        return (
          <Pressable
            key={o.id}
            onPress={() => onCambio(o.id)}
            style={({ pressed }) => [
              {
                flex: 1,
                height: 38,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: activo ? colores.primarioSuave : 'transparent',
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <Text
              style={{
                fontSize: typography.cuerpoChico,
                fontFamily: activo ? fuentes.semibold : fuentes.medium,
                color: activo ? colores.primario : colores.textoSuave,
              }}
            >
              {o.etiqueta}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
  const fondo = color ? color + '18' : colores.superficieSuave;
  return (
    <View
      style={{
        backgroundColor: fondo,
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
          letterSpacing: 0.2,
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

/**
 * Campo con la etiqueta dentro del recuadro, icono indigo a la izquierda y
 * borde fino, igual que los formularios de la referencia.
 */
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
  seguro,
  maxLength,
  derecha,
  onSubmitEditing,
  returnKeyType,
  autoCapitalize = 'sentences',
  autoCorrect,
  autoComplete,
  textContentType,
  editable = true,
  inputRef,
  estilo,
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
  seguro?: boolean;
  maxLength?: number;
  derecha?: ReactNode;
  onSubmitEditing?: () => void;
  returnKeyType?: TextInputProps['returnKeyType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: boolean;
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  editable?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
  estilo?: StyleProp<ViewStyle>;
}) {
  const { colores } = useTema();
  const [enfocado, setEnfocado] = useState(false);
  return (
    <View
      style={[
        styles.campo,
        {
          backgroundColor: colores.superficie,
          borderColor: enfocado ? colores.primario : colores.borde,
          borderWidth: enfocado ? 1.5 : 1,
        },
        estilo,
      ]}
    >
      {icono ? (
        <MaterialIcons
          name={icono}
          size={21}
          color={enfocado ? colores.primario : colores.primario}
          style={{ marginTop: etiqueta ? 13 : 0 }}
        />
      ) : null}
      <View style={{ flex: 1, justifyContent: 'center' }}>
        {etiqueta ? (
          <Text
            numberOfLines={1}
            style={{
              fontSize: typography.micro,
              fontFamily: fuentes.medium,
              color: colores.textoSuave,
              marginTop: 9,
            }}
          >
            {etiqueta}
          </Text>
        ) : null}
        <TextInput
          ref={inputRef}
          style={{
            fontSize: typography.cuerpo,
            color: colores.texto,
            paddingTop: etiqueta ? 1 : 13,
            paddingBottom: etiqueta ? 10 : 13,
            fontFamily: fuentes.medium,
            backgroundColor: 'transparent',
            minHeight: etiqueta ? 30 : 48,
          }}
          value={valor}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colores.textoSuave}
          keyboardType={teclado}
          multiline={multiline}
          autoFocus={autoFocus}
          secureTextEntry={seguro}
          maxLength={maxLength}
          underlineColorAndroid="transparent"
          cursorColor={colores.primario}
          selectionColor={colores.primario}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setEnfocado(false)}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          autoComplete={autoComplete}
          textContentType={textContentType}
          editable={editable}
        />
      </View>
      {sufijo ? (
        <Text style={{ fontSize: typography.cuerpo, fontFamily: fuentes.semibold, color: colores.textoSuave }}>
          {sufijo}
        </Text>
      ) : null}
      {derecha}
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
    <View style={[styles.contador, { backgroundColor: colores.superficieSuave }]}>
      <Pressable
        onPress={onMenos}
        disabled={cantidad <= 1}
        style={({ pressed }) => [
          styles.contadorBoton,
          { backgroundColor: colores.superficie },
          (pressed || cantidad <= 1) && { opacity: 0.4 },
        ]}
      >
        <MaterialIcons name="remove" size={17} color={colores.texto} />
      </Pressable>
      <Text style={[styles.contadorCantidad, { color: colores.texto }]}>{cantidad}</Text>
      <Pressable
        onPress={onMas}
        style={({ pressed }) => [
          styles.contadorBoton,
          { backgroundColor: colores.primarioSuave },
          pressed && { opacity: 0.5 },
        ]}
      >
        <MaterialIcons name="add" size={17} color={colores.primario} />
      </Pressable>
    </View>
  );
}

/** Acceso rápido cuadrado con icono en pastilla y etiqueta (mockup del panel principal). */
export function AccionRapida({
  icono,
  etiqueta,
  onPress,
  estilo,
}: {
  icono: NombreIcono;
  etiqueta: string;
  onPress: () => void;
  estilo?: StyleProp<ViewStyle>;
}) {
  const { colores } = useTema();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          minWidth: 0,
          minHeight: 96,
          borderRadius: radius.accion,
          backgroundColor: colores.primarioSuave,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.md,
          opacity: pressed ? 0.75 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        estilo,
      ]}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: radius.md,
          backgroundColor: colores.primario,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialIcons name={icono} size={24} color={colores.textoInverso} />
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        style={{
          fontSize: typography.cuerpoChico,
          fontFamily: fuentes.semibold,
          color: colores.texto,
          textAlign: 'center',
        }}
      >
        {etiqueta}
      </Text>
    </Pressable>
  );
}

/** Tarjeta de aviso con icono a la izquierda. */
export function TarjetaAviso({
  icono,
  titulo,
  destacado,
  mensaje,
  tono = 'advertencia',
  accion,
}: {
  icono: NombreIcono;
  titulo: string;
  destacado?: string;
  mensaje?: string;
  tono?: 'advertencia' | 'exito' | 'info' | 'peligro';
  accion?: ReactNode;
}) {
  const { colores } = useTema();
  const fondo =
    tono === 'exito'
      ? colores.exitoSuave
      : tono === 'info'
        ? colores.infoSuave
        : tono === 'peligro'
          ? colores.peligroSuave
          : colores.advertenciaSuave;
  const color =
    tono === 'exito'
      ? colores.exito
      : tono === 'info'
        ? colores.info
        : tono === 'peligro'
          ? colores.peligro
          : '#F39A16';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: fondo,
        borderRadius: radius.tarjeta,
        padding: spacing.md,
      }}
    >
      <MaterialIcons name={icono} size={30} color={color} />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: typography.cuerpo,
            fontFamily: fuentes.bold,
            color: colores.texto,
          }}
        >
          {titulo}
          {destacado ? (
            <Text style={{ color }}> {destacado}</Text>
          ) : null}
        </Text>
        {mensaje ? (
          <Text
            style={{
              fontSize: typography.cuerpoChico,
              fontFamily: fuentes.regular,
              color: colores.textoSuave,
              marginTop: 2,
              lineHeight: 18,
            }}
          >
            {mensaje}
          </Text>
        ) : null}
      </View>
      {accion}
    </View>
  );
}

/** Confirmación con el círculo verde de la referencia. */
export function Exito({
  titulo,
  mensaje,
  children,
  estilo,
}: {
  titulo: string;
  mensaje?: string;
  children?: ReactNode;
  estilo?: StyleProp<ViewStyle>;
}) {
  const { colores } = useTema();
  return (
    <View style={[{ alignItems: 'center', paddingHorizontal: spacing.lg }, estilo]}>
      <View
        style={{
          width: 92,
          height: 92,
          borderRadius: radius.full,
          backgroundColor: colores.exito,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: spacing.lg,
          marginBottom: spacing.lg,
        }}
      >
        <MaterialIcons name="check" size={52} color="#FFFFFF" />
      </View>
      <Text
        style={{
          fontSize: typography.tituloHoja,
          fontFamily: fuentes.display,
          color: colores.texto,
          textAlign: 'center',
          letterSpacing: -0.4,
        }}
      >
        {titulo}
      </Text>
      {mensaje ? (
        <Text
          style={{
            fontSize: typography.cuerpo,
            fontFamily: fuentes.regular,
            color: colores.textoSuave,
            textAlign: 'center',
            lineHeight: 22,
            marginTop: spacing.sm,
            maxWidth: 320,
          }}
        >
          {mensaje}
        </Text>
      ) : null}
      {children}
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
          width: 84,
          height: 84,
          borderRadius: radius.full,
          backgroundColor: colores.primarioSuave,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.sm,
        }}
      >
        <Text style={{ fontSize: 34 }}>{emoji}</Text>
      </View>
      <Text
        style={{
          fontSize: typography.destacado,
          fontFamily: fuentes.display,
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
      <ActivityIndicator size="large" color={colores.primario} />
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
  const { height: altoVentana } = useWindowDimensions();

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
          behavior="padding"
          keyboardVerticalOffset={0}
          style={[
            styles.hoja,
            {
              backgroundColor: colores.fondo,
              maxHeight: Math.max(200, altoVentana * alturaMaxima),
            },
          ]}
        >
          <View style={{ alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
            <View style={[styles.hojaMango, { backgroundColor: colores.borde }]} />
          </View>
          <View style={styles.hojaCabecera}>
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: typography.subtitulo,
                  fontFamily: fuentes.display,
                  color: colores.texto,
                  letterSpacing: -0.4,
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
                  backgroundColor: colores.superficieSuave,
                  transform: [{ scale: pressed ? 0.9 : 1 }],
                },
              ]}
            >
              <MaterialIcons name="close" size={18} color={colores.texto} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            contentContainerStyle={styles.hojaContenido}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {pie ? (
            <View>
              <ReglaPunteada estilo={{ marginHorizontal: spacing.md }} />
              <View style={[styles.hojaPie, { backgroundColor: colores.fondo }]}>{pie}</View>
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
        <View
          style={[
            styles.confirmarTarjeta,
            {
              backgroundColor: colores.superficie,
              borderWidth: 1,
              borderColor: colores.borde,
              ...sombraFlotante(colores),
            },
          ]}
        >
          <Text
            style={{
              fontSize: typography.subtitulo,
              fontFamily: fuentes.display,
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
                    backgroundColor: esBorrar ? colores.peligroSuave : colores.superficieSuave,
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

export const textoFila: TextStyle = {
  fontSize: typography.cuerpo,
  fontFamily: fuentes.regular,
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  chipTexto: {
    fontSize: 13,
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
  campo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.campo,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    minHeight: 58,
  },
  contador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: radius.full,
    padding: 3,
  },
  contadorBoton: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contadorCantidad: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.extrabold,
    fontVariant: ['tabular-nums'],
  },
  vacio: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.xs },
  hojaFondo: { flex: 1, justifyContent: 'flex-end' },
  hoja: {
    flexShrink: 1,
    borderTopLeftRadius: radius.hoja,
    borderTopRightRadius: radius.hoja,
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
    paddingHorizontal: spacing.md,
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
  hojaContenido: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  hojaPie: {
    paddingHorizontal: spacing.md,
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
    borderRadius: radius.lg,
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
