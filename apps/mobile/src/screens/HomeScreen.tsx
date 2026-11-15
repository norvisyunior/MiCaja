import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Settings, TurnoCaja } from '../types';
import { resumenDia, type ResumenDia } from '../db/repos/estadisticas';
import { turnoAbierto } from '../db/repos/turnos';
import { obtenerSettings } from '../db/repos/settings';
import { useSesion } from '../store/sesion';
import { useTema } from '../store/tema';
import {
  Boton,
  Gradiente,
  Pantalla,
  Tarjeta,
  type NombreIcono,
} from '../components/UI';
import {
  fuentes,
  gradientes,
  paletaProductos,
  radius,
  sombraFlotante,
  spacing,
  typography,
} from '../theme';
import { formatearDinero, formatoFechaLarga, formatoHora, inicioDiaISO, finDiaISO } from '../utils/fechas';
import type { ParamListRaiz, ParamListTabs } from '../navigation';

interface Acceso {
  icono: NombreIcono;
  etiqueta: string;
  color: string;
  fondo: string;
  destino: 'Productos' | 'Historial' | 'Resumen';
}

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
  const pulso = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulso]);

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

  const ingresos = resumen?.ingresos ?? 0;
  const ventas = resumen?.ventas ?? 0;
  const ticket = resumen?.ticketPromedio ?? 0;
  const efectivo = resumen?.efectivo ?? 0;
  const digital = resumen?.digital ?? 0;
  const cobrado = efectivo + digital;
  const proporcionEfectivo = cobrado > 0 ? (efectivo / cobrado) * 100 : 0;

  const accesos: Acceso[] = [
    ...(usuario.rol === 'admin'
      ? [
          {
            icono: 'inventory-2' as NombreIcono,
            etiqueta: 'Productos',
            color: colores.info,
            fondo: colores.infoSuave,
            destino: 'Productos' as const,
          },
        ]
      : []),
    {
      icono: 'receipt-long',
      etiqueta: 'Historial',
      color: colores.acento,
      fondo: colores.acentoSuave,
      destino: 'Historial',
    },
    {
      icono: 'bar-chart',
      etiqueta: 'Resumen',
      color: colores.advertencia,
      fondo: colores.advertenciaSuave,
      destino: 'Resumen',
    },
  ];

  return (
    <Pantalla>
      <ScrollView
        contentContainerStyle={[styles.contenido, { paddingBottom: 110 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: entrada,
            transform: [
              {
                translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
              },
            ],
          }}
        >
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

          <View
            style={[
              styles.heroSombra,
              { backgroundColor: colores.acento, borderRadius: radius.lg, ...sombraFlotante(colores) },
            ]}
          >
            <Pressable
              onPress={() => navigation.navigate('Vender')}
              style={({ pressed }) => [styles.hero, pressed && { opacity: 0.94 }]}
            >
              <Gradiente colores={gradientes.cta} estilo={StyleSheet.absoluteFill} />
              <View style={styles.heroIcono}>
                <Animated.View
                  style={[
                    styles.pulso,
                    {
                      borderColor: 'rgba(255,255,255,0.9)',
                      opacity: pulso.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
                      transform: [
                        {
                          scale: pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }),
                        },
                      ],
                    },
                  ]}
                />
                <MaterialIcons name="point-of-sale" size={27} color={colores.acento} />
                <View style={styles.plusBadge}>
                  <Gradiente colores={gradientes.exito} estilo={StyleSheet.absoluteFill} />
                  <MaterialIcons name="add" size={12} color="#FFFFFF" />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitulo}>Nueva venta</Text>
                <Text style={styles.heroSub}>Registra un cobro en segundos</Text>
              </View>
              <View style={styles.heroFlecha}>
                <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" />
              </View>
            </Pressable>
          </View>

          <Tarjeta estilo={styles.tarjetaHoy}>
            <View style={styles.hoyCabecera}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.hoyEtiqueta, { color: colores.textoSuave }]}>
                  Ventas de hoy
                </Text>
                <Text style={[styles.hoyFecha, { color: colores.textoSuave }]}>
                  {ventas === 1 ? '1 venta registrada' : `${ventas} ventas registradas`}
                </Text>
              </View>
              <View style={[styles.hoyIcono, { backgroundColor: colores.acentoSuave }]}>
                <MaterialIcons name="insights" size={22} color={colores.acento} />
              </View>
            </View>

            <Text
              style={[styles.hoyValor, { color: colores.texto }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {cargando ? '—' : formatearDinero(ingresos, simbolo)}
            </Text>
            <Text style={[styles.hoySub, { color: colores.textoSuave }]}>ingresos de hoy</Text>

            <View style={[styles.hoyMetricas, { borderTopColor: colores.borde }]}>
              <View style={styles.hoyMetrica}>
                <Text style={[styles.hoyMetricaValor, { color: colores.texto }]} numberOfLines={1} adjustsFontSizeToFit>
                  {String(ventas)}
                </Text>
                <Text style={[styles.hoyMetricaLabel, { color: colores.textoSuave }]}>ventas</Text>
              </View>
              <View style={[styles.hoyDivisor, { backgroundColor: colores.borde }]} />
              <View style={styles.hoyMetrica}>
                <Text style={[styles.hoyMetricaValor, { color: colores.texto }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatearDinero(ticket, simbolo)}
                </Text>
                <Text style={[styles.hoyMetricaLabel, { color: colores.textoSuave }]}>ticket promedio</Text>
              </View>
              <View style={[styles.hoyDivisor, { backgroundColor: colores.borde }]} />
              <View style={styles.hoyMetrica}>
                <Text style={[styles.hoyMetricaValor, { color: colores.texto }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatearDinero(efectivo, simbolo)}
                </Text>
                <Text style={[styles.hoyMetricaLabel, { color: colores.textoSuave }]}>efectivo</Text>
              </View>
            </View>

            <View style={styles.hoyBarraFila}>
              <View style={[styles.hoyBarra, { backgroundColor: colores.superficieSuave }]}>
                <View
                  style={{
                    width: `${cobrado > 0 ? Math.max(4, proporcionEfectivo) : 0}%`,
                    height: '100%',
                    backgroundColor: colores.exito,
                  }}
                />
              </View>
              <View style={styles.hoyLeyenda}>
                <View style={[styles.hoyPunto, { backgroundColor: colores.exito }]} />
                <Text style={[styles.hoyLeyendaTexto, { color: colores.textoSuave }]}>
                  {formatearDinero(efectivo, simbolo)}
                </Text>
                <View style={[styles.hoyPunto, { backgroundColor: colores.info, marginLeft: spacing.sm }]} />
                <Text style={[styles.hoyLeyendaTexto, { color: colores.textoSuave }]}>
                  {formatearDinero(digital, simbolo)} digital
                </Text>
              </View>
            </View>
          </Tarjeta>

          <Tarjeta estilo={styles.tarjetaTurno}>
            <View style={styles.turnoEstado}>
              <View
                style={[
                  styles.turnoPunto,
                  { backgroundColor: turno ? colores.exito : colores.advertencia },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.turnoTitulo, { color: colores.texto }]}>
                  {turno ? 'Caja abierta' : 'Caja cerrada'}
                </Text>
                <Text style={[styles.turnoSub, { color: colores.textoSuave }]} numberOfLines={2}>
                  {turno
                    ? `Turno iniciado a las ${formatoHora(turno.apertura)}`
                    : 'Abre la caja para controlar los ingresos del día'}
                </Text>
              </View>
            </View>
            <Boton
              titulo={turno ? 'Cerrar' : 'Abrir'}
              variante={turno ? 'suave' : 'primario'}
              tamanio="sm"
              onPress={() => navigation.navigate('Turno')}
            />
          </Tarjeta>

          {resumen?.topProducto ? (
            <Tarjeta estilo={styles.tarjetaTop}>
              <View
                style={[
                  styles.topIcono,
                  {
                    backgroundColor: resumen.topProducto.imagen
                      ? colores.superficieSuave
                      : colores.advertenciaSuave,
                  },
                ]}
              >
                {resumen.topProducto.imagen ? (
                  <Image
                    source={{ uri: resumen.topProducto.imagen }}
                    style={styles.topImagen}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={{ fontSize: 24 }}>{resumen.topProducto.emoji}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.topTituloFila}>
                  <Text style={[styles.topTitulo, { color: colores.textoSuave }]}>
                    Más vendido hoy
                  </Text>
                  <View style={[styles.topSello, { backgroundColor: colores.advertenciaSuave }]}>
                    <MaterialIcons name="emoji-events" size={11} color={colores.advertencia} />
                    <Text style={[styles.topSelloTexto, { color: colores.advertencia }]}>TOP</Text>
                  </View>
                </View>
                <Text style={[styles.topNombre, { color: colores.texto }]} numberOfLines={1}>
                  {resumen.topProducto.nombre}
                </Text>
                <Text style={[styles.topDetalle, { color: colores.textoSuave }]}>
                  {resumen.topProducto.cantidad} unidad(es)
                </Text>
              </View>
              <Text style={[styles.topTotal, { color: colores.texto }]}>
                {formatearDinero(resumen.topProducto.total, simbolo)}
              </Text>
            </Tarjeta>
          ) : null}

          <Text style={[styles.seccionTitulo, { color: colores.textoSuave }]}>Accesos rápidos</Text>
          <Tarjeta padding={0} estilo={styles.acciones}>
            {accesos.map((acceso, indice) => (
              <Fragment key={acceso.etiqueta}>
                {indice > 0 ? (
                  <View style={[styles.accionDivisor, { backgroundColor: colores.borde }]} />
                ) : null}
                <Pressable
                  onPress={() => navigation.navigate(acceso.destino)}
                  style={({ pressed }) => [styles.accion, pressed && { opacity: 0.7 }]}
                >
                  <View style={[styles.accionIcono, { backgroundColor: acceso.fondo }]}>
                    <MaterialIcons name={acceso.icono} size={22} color={acceso.color} />
                  </View>
                  <Text style={[styles.accionEtiqueta, { color: colores.texto }]}>
                    {acceso.etiqueta}
                  </Text>
                </Pressable>
              </Fragment>
            ))}
          </Tarjeta>

          <Text style={[styles.pie, { color: colores.textoSuave }]}>
            {settings?.nombreNegocio ?? 'Mi Negocio'} · {settings?.moneda ?? 'CUP'}
          </Text>
        </Animated.View>
      </ScrollView>
    </Pantalla>
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
  heroSombra: {
    width: '100%',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  heroIcono: {
    width: 54,
    height: 54,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulso: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.full,
    borderWidth: 2,
  },
  plusBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 20,
    height: 20,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
  },
  heroTitulo: {
    fontSize: typography.destacado,
    fontFamily: fuentes.bold,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  heroSub: {
    fontSize: typography.cuerpoChico,
    color: 'rgba(255,255,255,0.78)',
    fontFamily: fuentes.medium,
    marginTop: 2,
  },
  heroFlecha: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tarjetaHoy: {
    marginTop: spacing.md,
  },
  hoyCabecera: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  hoyEtiqueta: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
  },
  hoyFecha: {
    fontSize: typography.micro,
    fontFamily: fuentes.regular,
    marginTop: 2,
  },
  hoyIcono: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hoyValor: {
    fontSize: typography.display,
    fontFamily: fuentes.bold,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.md,
  },
  hoySub: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.regular,
    marginTop: 2,
  },
  hoyMetricas: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  hoyMetrica: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
  },
  hoyMetricaValor: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
  },
  hoyMetricaLabel: {
    fontSize: 10,
    fontFamily: fuentes.medium,
    textAlign: 'center',
  },
  hoyDivisor: {
    width: StyleSheet.hairlineWidth,
    height: 28,
  },
  hoyBarraFila: {
    marginTop: spacing.md,
    gap: 6,
  },
  hoyBarra: {
    height: 7,
    borderRadius: radius.full,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  hoyLeyenda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  hoyPunto: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
  },
  hoyLeyendaTexto: {
    fontSize: 10,
    fontFamily: fuentes.medium,
  },
  tarjetaTurno: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  turnoEstado: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  turnoPunto: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  turnoTitulo: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.bold,
  },
  turnoSub: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.regular,
    marginTop: 2,
  },
  tarjetaTop: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  topIcono: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  topImagen: { width: '100%', height: '100%' },
  topTituloFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  topTitulo: {
    fontSize: typography.micro,
    fontFamily: fuentes.semibold,
  },
  topSello: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  topSelloTexto: {
    fontSize: 9,
    fontFamily: fuentes.bold,
    letterSpacing: 0.4,
  },
  topNombre: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.semibold,
    marginTop: 2,
  },
  topDetalle: {
    fontSize: typography.micro,
    fontFamily: fuentes.regular,
    marginTop: 1,
  },
  topTotal: {
    fontSize: typography.destacado,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
  },
  seccionTitulo: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  acciones: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  accion: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  accionDivisor: {
    width: StyleSheet.hairlineWidth,
    marginVertical: spacing.md,
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
  pie: {
    textAlign: 'center',
    fontSize: typography.micro,
    fontFamily: fuentes.medium,
    marginTop: spacing.xl,
  },
});
