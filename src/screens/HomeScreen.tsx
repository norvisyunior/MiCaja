import { useCallback, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { MaterialIcons } from '@expo/vector-icons';
import type { Settings, TurnoCaja } from '../types';
import { resumenDia, type ResumenDia } from '../db/repos/estadisticas';
import { turnoAbierto } from '../db/repos/turnos';
import { obtenerSettings } from '../db/repos/settings';
import { useSesion } from '../store/sesion';
import { useTema } from '../store/tema';
import { Badge, Boton, Gradiente, Pantalla, Sello, SombraDura, Tarjeta } from '../components/UI';
import {
  fuentes,
  gradientes,
  paletaProductos,
  radius,
  spacing,
  typography,
} from '../theme';
import { formatearDinero, formatoFechaLarga, formatoHora, inicioDiaISO, finDiaISO } from '../utils/fechas';
import type { ParamListRaiz, ParamListTabs } from '../navigation';

export default function HomeScreen() {
  const db = useSQLiteContext();
  const usuario = useSesion((s) => s.usuario)!;
  const { colores } = useTema();
  const navigation = useNavigation<NavigationProp<ParamListRaiz & ParamListTabs>>();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [turno, setTurno] = useState<TurnoCaja | null>(null);
  const [resumen, setResumen] = useState<ResumenDia | null>(null);
  const [cargando, setCargando] = useState(true);

  const entrada = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [conf, t, r] = await Promise.all([
          obtenerSettings(db),
          turnoAbierto(db, usuario.id),
          resumenDia(db, inicioDiaISO(), finDiaISO()),
        ]);
        setSettings(conf);
        setTurno(t);
        setResumen(r);
        setCargando(false);
        entrada.setValue(0);
        Animated.timing(entrada, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      })().catch(() => setCargando(false));
    }, [db, usuario.id, entrada])
  );

  const simbolo = settings?.simboloMoneda ?? '$';
  const hora = new Date();
  const saludo = hora.getHours() < 12 ? 'Buenos días' : hora.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';
  const colorAvatar = paletaProductos[usuario.id % paletaProductos.length];

  return (
    <Pantalla>
      <ScrollView
        contentContainerStyle={[styles.contenido, { paddingBottom: 110 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: entrada, transform: [{ translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
          <View style={styles.cabecera}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.saludo, { color: colores.texto }]}>
                {saludo}, {usuario.nombre.split(' ')[0]}
              </Text>
              <Text style={[styles.fecha, { color: colores.textoSuave }]}>
                {formatoFechaLarga(hora.toISOString())}
              </Text>
            </View>
            <View
              style={[
                styles.avatar,
                {
                  backgroundColor: colorAvatar,
                  shadowColor: colores.sombra,
                },
              ]}
            >
              <Text style={styles.avatarTexto}>
                {usuario.nombre.charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>

          <SombraDura redondeo={radius.lg} offset={4}>
            <Pressable
              onPress={() => navigation.navigate('Vender')}
              style={({ pressed }) => [
                styles.botonNuevaVenta,
                pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Gradiente colores={gradientes.cta} estilo={StyleSheet.absoluteFill} />
              <View style={styles.botonNuevaVentaIcono}>
                <MaterialIcons name="add" size={30} color={colores.acento} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.botonNuevaVentaTitulo}>Nueva venta</Text>
                <Text style={styles.botonNuevaVentaSub}>Toca para empezar a cobrar</Text>
              </View>
              <MaterialIcons name="chevron-right" size={26} color="rgba(255,255,255,0.85)" />
            </Pressable>
          </SombraDura>

          <View style={styles.filaTarjetas}>
            <Tarjeta
              onPress={() => navigation.navigate('Resumen')}
              estilo={styles.tarjetaMitad}
              redondeo={radius.lg}
            >
              <View style={[styles.iconoMitad, { backgroundColor: colores.primarioSuave }]}>
                <MaterialIcons name="receipt-long" size={20} color={colores.primario} />
              </View>
              <Text
                style={[styles.mitadNumero, { color: colores.texto }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {cargando ? '—' : String(resumen?.ventas ?? 0)}
              </Text>
              <Text style={[styles.mitadLabel, { color: colores.textoSuave }]}>ventas hoy</Text>
            </Tarjeta>
            <Tarjeta
              onPress={() => navigation.navigate('Resumen')}
              estilo={styles.tarjetaMitad}
              redondeo={radius.lg}
            >
              <View style={[styles.iconoMitad, { backgroundColor: colores.acentoSuave }]}>
                <MaterialIcons name="payments" size={20} color={colores.acento} />
              </View>
              <Text
                style={[styles.mitadNumero, { color: colores.texto }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {cargando ? '—' : formatearDinero(resumen?.ingresos ?? 0, simbolo)}
              </Text>
              <Text style={[styles.mitadLabel, { color: colores.textoSuave }]}>ingresos hoy</Text>
            </Tarjeta>
          </View>

          <Tarjeta estilo={styles.tarjetaTurno} redondeo={radius.lg}>
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Sello
                texto={turno ? 'Caja abierta' : 'Sin turno'}
                color={turno ? colores.exito : colores.advertencia}
              />
              <Text style={[styles.turnoSub, { color: colores.textoSuave }]}>
                {turno
                  ? `Turno iniciado a las ${formatoHora(turno.apertura)}`
                  : 'Abre la caja para controlar los ingresos del día'}
              </Text>
            </View>
            <Boton
              titulo={turno ? 'Cerrar' : 'Abrir'}
              variante={turno ? 'suave' : 'primario'}
              tamanio="sm"
              onPress={() => navigation.navigate('Turno')}
            />
          </Tarjeta>

          {resumen?.topProducto ? (
            <Tarjeta estilo={styles.tarjetaTop} redondeo={radius.lg}>
              <View
                style={[
                  styles.iconoMitad,
                  { backgroundColor: colores.advertenciaSuave },
                ]}
              >
                <Text style={{ fontSize: 22 }}>{resumen.topProducto.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.topTitulo, { color: colores.textoSuave }]}>
                  Más vendido hoy
                </Text>
                <Text style={[styles.topNombre, { color: colores.texto }]} numberOfLines={1}>
                  {resumen.topProducto.nombre} · {resumen.topProducto.cantidad} unidad(es)
                </Text>
              </View>
              <Text style={[styles.topTotal, { color: colores.texto }]}>
                {formatearDinero(resumen.topProducto.total, simbolo)}
              </Text>
            </Tarjeta>
          ) : null}

          <Text style={[styles.seccionTitulo, { color: colores.textoSuave }]}>Accesos rápidos</Text>
          <View style={styles.acciones}>
            {usuario.rol === 'admin' ? (
              <Accion
                icono="inventory-2"
                etiqueta="Productos"
                color={colores.info}
                colorFondo={colores.infoSuave}
                onPress={() => navigation.navigate('Productos')}
              />
            ) : null}
            <Accion
              icono="receipt-long"
              etiqueta="Historial"
              color={colores.acento}
              colorFondo={colores.acentoSuave}
              onPress={() => navigation.navigate('Historial')}
            />
            <Accion
              icono="bar-chart"
              etiqueta="Resumen"
              color={colores.advertencia}
              colorFondo={colores.advertenciaSuave}
              onPress={() => navigation.navigate('Resumen')}
            />
          </View>

          <Badge texto={`${settings?.nombreNegocio ?? 'Mi Negocio'} · ${settings?.moneda ?? 'CUP'}`} />
        </Animated.View>
      </ScrollView>
    </Pantalla>
  );
}

function Accion({
  icono,
  etiqueta,
  color,
  colorFondo,
  onPress,
}: {
  icono: 'inventory-2' | 'receipt-long' | 'bar-chart' | 'file-download';
  etiqueta: string;
  color: string;
  colorFondo: string;
  onPress: () => void;
}) {
  const { colores } = useTema();
  return (
    <SombraDura redondeo={radius.lg} offset={2} estilo={{ flex: 1 }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.accion,
          { backgroundColor: colores.superficie, borderColor: colores.borde },
          pressed && { opacity: 0.9 },
        ]}
      >
        <View style={[styles.accionIcono, { backgroundColor: colorFondo }]}>
          <MaterialIcons name={icono} size={22} color={color} />
        </View>
        <Text style={[styles.accionEtiqueta, { color: colores.texto }]}>{etiqueta}</Text>
      </Pressable>
    </SombraDura>
  );
}

const styles = StyleSheet.create({
  contenido: { paddingHorizontal: spacing.lg },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  saludo: {
    fontSize: typography.titulo,
    fontFamily: fuentes.bold,
    letterSpacing: -0.4,
  },
  fecha: { fontSize: typography.cuerpoChico, fontFamily: fuentes.regular, marginTop: 2 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  avatarTexto: { fontSize: 20, fontFamily: fuentes.bold, color: '#FFFFFF' },
  botonNuevaVenta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  botonNuevaVentaIcono: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonNuevaVentaTitulo: {
    fontSize: typography.destacado,
    fontFamily: fuentes.bold,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  botonNuevaVentaSub: {
    fontSize: typography.cuerpoChico,
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fuentes.medium,
    marginTop: 2,
  },
  filaTarjetas: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  tarjetaMitad: {
    flex: 1,
    padding: spacing.lg,
  },
  iconoMitad: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  mitadNumero: {
    fontSize: typography.titulo,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  mitadLabel: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.regular,
    marginTop: 3,
  },
  tarjetaTurno: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  turnoSub: { fontSize: typography.cuerpoChico, fontFamily: fuentes.regular },
  tarjetaTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  topTitulo: {
    fontSize: typography.micro,
    fontFamily: fuentes.semibold,
  },
  topNombre: { fontSize: typography.cuerpo, fontFamily: fuentes.semibold, marginTop: 2 },
  topTotal: {
    fontSize: typography.destacado,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
  },
  seccionTitulo: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  acciones: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  accion: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  accionIcono: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accionEtiqueta: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
  },
});
