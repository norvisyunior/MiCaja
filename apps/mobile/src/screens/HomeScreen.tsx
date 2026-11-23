import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Settings, TurnoCaja } from '../types';
import { resumenDia, type ResumenDia } from '../db/repos/estadisticas';
import { turnoAbierto } from '../db/repos/turnos';
import { obtenerSettings } from '../db/repos/settings';
import { useSesion } from '../store/sesion';
import { useSync } from '../store/sync';
import { useTema } from '../store/tema';
import { useConexionBackend } from '../sync/conexion';
import { sincronizarSilencioso } from '../sync/motor';
import {
  AccionRapida,
  Boton,
  Exito,
  Gradiente,
  Hoja,
  Pantalla,
  Sello,
  Superficie,
  Tarjeta,
  type NombreIcono,
} from '../components/UI';
import { AvisoLicencia as AvisoLicenciaTarjeta } from '../components/AvisoLicencia';
import {
  fuentes,
  gradientes,
  radius,
  spacing,
  typography,
} from '../theme';
import { formatearDinero, formatoFechaLarga, formatoFechaHora, formatoHora, inicioDiaISO, finDiaISO } from '../utils/fechas';
import type { ParamListRaiz, ParamListTabs } from '../navigation';

interface Acceso {
  icono: NombreIcono;
  etiqueta: string;
  destino: 'Vender' | 'Productos' | 'Resumen' | 'Configuracion' | 'Sincronizar';
  soloAdmin?: boolean;
}

export default function HomeScreen() {
  const db = useSQLiteContext();
  const usuario = useSesion((s) => s.usuario)!;
  const ultimaSync = useSync((s) => s.ultimaSync);
  const sincronizando = useSync((s) => s.sincronizando);
  const pendientes = useSync((s) => s.pendientes);
  const fallidas = useSync((s) => s.fallidas);
  const errorSync = useSync((s) => s.error);
  const conectado = useSync((s) => s.conectado);
  const { colores } = useTema();
  const navigation = useNavigation<NavigationProp<ParamListRaiz & ParamListTabs>>();

  useConexionBackend(db, true);
  const enLinea = conectado === true;
  const sinConexion = conectado === false;

  const [settings, setSettings] = useState<Settings | null>(null);
  const [turno, setTurno] = useState<TurnoCaja | null>(null);
  const [resumen, setResumen] = useState<ResumenDia | null>(null);
  const [cargando, setCargando] = useState(true);
  const [syncAbierto, setSyncAbierto] = useState(false);
  const [syncCompletado, setSyncCompletado] = useState(false);

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
    }, [db, usuario.id, ultimaSync, entrada])
  );

  const simbolo = settings?.simboloMoneda ?? '$';
  const hora = new Date();
  const saludo = hora.getHours() < 12 ? 'Buenos días' : hora.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';

  const ingresos = resumen?.ingresos ?? 0;
  const ventas = resumen?.ventas ?? 0;
  const ticket = resumen?.ticketPromedio ?? 0;
  const efectivo = resumen?.efectivo ?? 0;
  const digital = resumen?.digital ?? 0;
  const cobrado = efectivo + digital;
  const proporcionEfectivo = cobrado > 0 ? (efectivo / cobrado) * 100 : 0;

  const accesos = ([
    { icono: 'point-of-sale', etiqueta: 'Ventas', destino: 'Vender' },
    { icono: 'warehouse', etiqueta: 'Inventario', destino: 'Productos' },
    { icono: 'sync', etiqueta: 'Sincronización', destino: 'Sincronizar' },
  ] as Acceso[]);

  async function sincronizarAhora() {
    setSyncCompletado(false);
    try {
      await sincronizarSilencioso(db);
      const [conf, t, r] = await Promise.all([
        obtenerSettings(db),
        turnoAbierto(db, usuario.id),
        resumenDia(db, inicioDiaISO(), finDiaISO()),
      ]);
      setSettings(conf);
      setTurno(t);
      setResumen(r);
      setSyncCompletado(true);
    } catch {
      // El estado del store ya refleja el error de sincronización.
    }
  }

  return (
    <Pantalla>
      <Superficie>
        <ScrollView
          contentContainerStyle={styles.contenido}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={{
              opacity: entrada,
              transform: [
                {
                  translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
                },
              ],
              gap: spacing.md,
            }}
          >
            <View style={styles.saludoFila}>
              <View style={{ flex: 1 }}>
                <Pressable
                  onPress={() => setSyncAbierto(true)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={
                    enLinea
                      ? 'Conectado al servidor'
                      : sinConexion
                        ? 'Sin conexión al servidor, trabajando offline'
                        : 'Comprobando conexión con el servidor'
                  }
                  style={({ pressed }) => [
                    styles.conexion,
                    {
                      backgroundColor: enLinea
                        ? colores.exitoSuave
                        : sinConexion
                          ? colores.peligroSuave
                          : colores.superficieSuave,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.conexionPunto,
                      {
                        backgroundColor: enLinea
                          ? colores.exito
                          : sinConexion
                            ? colores.peligro
                            : colores.textoSuave,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.conexionTexto,
                      {
                        color: enLinea
                          ? colores.exito
                          : sinConexion
                            ? colores.peligro
                            : colores.textoSuave,
                      },
                    ]}
                  >
                    {enLinea
                      ? 'En línea'
                      : sinConexion
                        ? 'Sin conexión · Modo offline'
                        : 'Comprobando conexión…'}
                  </Text>
                </Pressable>
                <Text style={[styles.saludo, { color: colores.texto }]}>
                  {saludo}, {usuario.nombre.split(' ')[0]}
                </Text>
                <Text style={[styles.fecha, { color: colores.textoSuave }]}>
                  {formatoFechaLarga(hora.toISOString())}
                </Text>
              </View>
              <Pressable
                onPress={() => setSyncAbierto(true)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Estado de sincronización"
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 4 }]}
              >
                <MaterialIcons name="notifications-none" size={23} color={colores.texto} />
                {pendientes > 0 ? (
                  <View
                    style={[
                      styles.puntoAviso,
                      { backgroundColor: colores.advertencia, borderColor: colores.fondo },
                    ]}
                  />
                ) : null}
              </Pressable>
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: colores.primarioSuave },
                ]}
              >
                <Text style={[styles.avatarTexto, { color: colores.primario }]}>
                  {usuario.nombre.charAt(0).toUpperCase()}
                </Text>
              </View>
            </View>

            <AvisoLicenciaTarjeta />

            <View style={styles.acciones}>
              {accesos.map((acceso) => (
                <AccionRapida
                  key={acceso.etiqueta}
                  icono={acceso.icono}
                  etiqueta={acceso.etiqueta}
                  onPress={() => {
                    if (acceso.destino === 'Sincronizar') setSyncAbierto(true);
                    else navigation.navigate(acceso.destino);
                  }}
                />
              ))}
            </View>

            <Gradiente colores={gradientes.cta} estilo={styles.hero}>
              <View style={styles.heroCabecera}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroEtiqueta}>Ventas de hoy</Text>
                  <Text
                    style={styles.heroValor}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {cargando ? '—' : formatearDinero(ingresos, simbolo)}
                  </Text>
                </View>
                <View style={styles.heroIcono}>
                  <MaterialIcons name="insights" size={23} color="#FFFFFF" />
                </View>
              </View>

              <View style={styles.heroMetricas}>
                <View style={styles.heroMetrica}>
                  <Text style={styles.heroMetricaValor}>{String(ventas)}</Text>
                  <Text style={styles.heroMetricaLabel}>ventas</Text>
                </View>
                <View style={styles.heroDivisor} />
                <View style={styles.heroMetrica}>
                  <Text style={styles.heroMetricaValor} numberOfLines={1} adjustsFontSizeToFit>
                    {formatearDinero(ticket, simbolo)}
                  </Text>
                  <Text style={styles.heroMetricaLabel}>ticket medio</Text>
                </View>
                <View style={styles.heroDivisor} />
                <View style={styles.heroMetrica}>
                  <Text style={styles.heroMetricaValor} numberOfLines={1} adjustsFontSizeToFit>
                    {formatearDinero(efectivo, simbolo)}
                  </Text>
                  <Text style={styles.heroMetricaLabel}>efectivo</Text>
                </View>
              </View>

              <View style={styles.heroBarraFila}>
                <View style={styles.heroBarra}>
                  <View
                    style={{
                      width: `${cobrado > 0 ? Math.max(4, proporcionEfectivo) : 0}%`,
                      height: '100%',
                      backgroundColor: '#FFFFFF',
                    }}
                  />
                </View>
                <View style={styles.heroLeyenda}>
                  <Text style={styles.heroLeyendaTexto}>
                    {formatearDinero(efectivo, simbolo)} efectivo
                  </Text>
                  <Text style={styles.heroLeyendaTexto}>
                    {formatearDinero(digital, simbolo)} digital
                  </Text>
                </View>
              </View>
            </Gradiente>

            <View style={styles.filaTarjetas}>
              <Tarjeta estilo={styles.tarjetaMini}>
                <View style={styles.miniCabecera}>
                  <View
                    style={[
                      styles.miniIcono,
                      { backgroundColor: turno ? colores.exitoSuave : colores.advertenciaSuave },
                    ]}
                  >
                    <MaterialIcons
                      name={turno ? 'lock-open' : 'lock'}
                      size={18}
                      color={turno ? colores.exito : colores.advertencia}
                    />
                  </View>
                  <Sello
                    texto={turno ? 'Abierta' : 'Cerrada'}
                    color={turno ? colores.exito : colores.advertencia}
                  />
                </View>
                <Text style={[styles.miniTitulo, { color: colores.texto }]}>
                  Caja {turno ? 'abierta' : 'cerrada'}
                </Text>
                <Text style={[styles.miniSub, { color: colores.textoSuave }]} numberOfLines={2}>
                  {turno
                    ? `Desde las ${formatoHora(turno.apertura)}`
                    : 'Abre la caja para empezar a vender'}
                </Text>
                <Boton
                  titulo={turno ? 'Cerrar' : 'Abrir'}
                  variante={turno ? 'suave' : 'primario'}
                  tamanio="sm"
                  onPress={() => navigation.navigate('Cierre')}
                  estilo={styles.miniBoton}
                />
              </Tarjeta>

              <Tarjeta estilo={styles.tarjetaMini}>
                <View style={styles.miniCabecera}>
                  <View
                    style={[
                      styles.miniIcono,
                      { backgroundColor: colores.primarioSuave },
                    ]}
                  >
                    {resumen?.topProducto ? resumen.topProducto.imagen ? (
                      <Image
                        source={{ uri: resumen.topProducto.imagen }}
                        style={styles.miniImagen}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={{ fontSize: 20 }}>{resumen.topProducto.emoji}</Text>
                    ) : (
                      <MaterialIcons name="emoji-events" size={18} color={colores.textoSuave} />
                    )}
                  </View>
                  {resumen?.topProducto ? (
                    <MaterialIcons name="trending-up" size={17} color={colores.primario} />
                  ) : null}
                </View>
                <Text style={[styles.miniTitulo, { color: colores.texto }]}>
                  {resumen?.topProducto ? 'Más vendido' : 'Sin datos'}
                </Text>
                <Text style={[styles.miniSub, { color: colores.textoSuave }]} numberOfLines={2}>
                  {resumen?.topProducto?.nombre ?? 'Aún no hay ventas hoy'}
                </Text>
                <Text style={[styles.miniTotal, { color: colores.primario }]}>
                  {resumen?.topProducto
                    ? `${formatearDinero(resumen.topProducto.total, simbolo)} · ${resumen.topProducto.cantidad} uds.`
                    : '—'}
                </Text>
              </Tarjeta>
            </View>

            <View style={styles.pie}>
              <View
                style={[
                  styles.piePunto,
                  {
                    backgroundColor: sinConexion
                      ? colores.peligro
                      : enLinea
                        ? colores.exito
                        : colores.advertencia,
                  },
                ]}
              />
              <Text style={[styles.pieTexto, { color: colores.textoSuave }]}>
                {settings?.nombreNegocio ?? 'Mi Negocio'} · {settings?.moneda ?? 'CUP'} ·{' '}
                {sinConexion ? 'Sin conexión' : enLinea ? 'En línea' : 'Comprobando…'}
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
      </Superficie>

      <Hoja
        visible={syncAbierto}
        onCerrar={() => {
          setSyncAbierto(false);
          setSyncCompletado(false);
        }}
        titulo="Sincronización"
        subtitulo={sincronizando ? 'Por favor espera' : 'Estado de este dispositivo'}
        pie={
          sincronizando ? null : syncCompletado ? (
            <Boton
              titulo="Aceptar"
              tamanio="lg"
              onPress={() => {
                setSyncAbierto(false);
                setSyncCompletado(false);
              }}
            />
          ) : (
            <Boton
              titulo="Sincronizar ahora"
              tamanio="lg"
              onPress={() => void sincronizarAhora()}
            />
          )
        }
      >
        {sincronizando ? (
          <View style={styles.syncProceso}>
            <View style={[styles.syncSpinner, { backgroundColor: colores.primarioSuave }]}>
              <ActivityIndicator size="large" color={colores.primario} />
            </View>
            <Text style={[styles.syncTituloProceso, { color: colores.texto }]}>
              Sincronizando datos...
            </Text>
            <Text style={[styles.syncSub, { color: colores.textoSuave }]}>Por favor espera</Text>
            <View style={[styles.syncBarra, { backgroundColor: colores.superficieSuave }]}>
              <View style={[styles.syncBarraAvance, { backgroundColor: colores.primario, width: '70%' }]} />
            </View>
            <Text style={[styles.syncPorcentaje, { color: colores.primario }]}>70%</Text>
          </View>
        ) : syncCompletado ? (
          <Exito
            titulo="¡Todo actualizado!"
            mensaje="Tus datos están sincronizados con el servidor."
          />
        ) : (
          <>
            <View style={[styles.syncEstado, { backgroundColor: colores.primarioSuave }]}>
              <View
                style={[
                  styles.syncIcono,
                  { backgroundColor: sinConexion ? colores.peligroSuave : colores.superficie },
                ]}
              >
                <MaterialIcons
                  name={sinConexion ? 'cloud-off' : enLinea ? 'cloud-done' : 'cloud-sync'}
                  size={26}
                  color={
                    sinConexion
                      ? colores.peligro
                      : enLinea
                        ? colores.primario
                        : colores.textoSuave
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.syncTitulo, { color: colores.texto }]}>
                  {sinConexion
                    ? 'Sin conexión'
                    : enLinea
                      ? 'En línea'
                      : 'Comprobando conexión'}
                </Text>
                <Text style={[styles.syncSub, { color: colores.textoSuave }]}>
                  {ultimaSync
                    ? `Última sincronización: ${formatoFechaHora(ultimaSync)}`
                    : 'Aún no se ha sincronizado este dispositivo'}
                </Text>
              </View>
            </View>

            <View style={styles.syncFilas}>
              <View style={[styles.syncFila, { borderBottomColor: colores.borde }]}>
                <Text style={[styles.syncFilaLabel, { color: colores.textoSuave }]}>Cambios pendientes</Text>
                <Text style={[styles.syncFilaValor, { color: colores.texto }]}>{pendientes}</Text>
              </View>
              <View style={[styles.syncFila, { borderBottomColor: colores.borde }]}>
                <Text style={[styles.syncFilaLabel, { color: colores.textoSuave }]}>Cambios rechazados</Text>
                <Text style={[styles.syncFilaValor, { color: fallidas > 0 ? colores.peligro : colores.texto }]}>
                  {fallidas}
                </Text>
              </View>
              <View style={styles.syncFila}>
                <Text style={[styles.syncFilaLabel, { color: colores.textoSuave }]}>Modo</Text>
                <Text style={[styles.syncFilaValor, { color: colores.texto }]}>
                  {sinConexion ? 'Sin conexión' : enLinea ? 'En línea' : 'Comprobando…'}
                </Text>
              </View>
            </View>
            {errorSync ? (
              <Text style={[styles.syncError, { color: colores.peligro }]}>{errorSync}</Text>
            ) : null}
          </>
        )}
      </Hoja>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: spacing.md, paddingBottom: 32 },
  puntoAviso: {
    position: 'absolute',
    top: 4,
    right: 3,
    width: 9,
    height: 9,
    borderRadius: radius.full,
    borderWidth: 2,
  },
  saludoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  conexion: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.full,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: 6,
  },
  conexionPunto: { width: 6, height: 6, borderRadius: radius.full },
  conexionTexto: { fontSize: typography.micro, fontFamily: fuentes.semibold },
  saludo: {
    fontSize: 21,
    fontFamily: fuentes.display,
    letterSpacing: -0.5,
  },
  fecha: { fontSize: typography.cuerpoChico, fontFamily: fuentes.regular, marginTop: 2 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: { fontSize: 18, fontFamily: fuentes.display },
  acciones: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  hero: {
    borderRadius: radius.tarjeta,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroCabecera: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  heroEtiqueta: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.medium,
    color: 'rgba(255, 255, 255, 0.82)',
  },
  heroValor: {
    fontSize: 38,
    fontFamily: fuentes.display,
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
    color: '#FFFFFF',
    marginTop: 2,
  },
  heroIcono: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMetricas: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.25)',
  },
  heroMetrica: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
  },
  heroMetricaValor: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
    color: '#FFFFFF',
  },
  heroMetricaLabel: {
    fontSize: 10,
    fontFamily: fuentes.medium,
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.76)',
  },
  heroDivisor: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  heroBarraFila: { gap: 8 },
  heroBarra: {
    height: 7,
    borderRadius: radius.full,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  heroLeyenda: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heroLeyendaTexto: {
    fontSize: 10,
    fontFamily: fuentes.medium,
    color: 'rgba(255, 255, 255, 0.88)',
  },
  filaTarjetas: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tarjetaMini: {
    flex: 1,
    padding: spacing.md,
    gap: 4,
    minHeight: 158,
  },
  miniCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  miniIcono: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  miniImagen: { width: '100%', height: '100%' },
  miniTitulo: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.semibold,
  },
  miniSub: {
    fontSize: typography.micro,
    fontFamily: fuentes.regular,
    lineHeight: 15,
    minHeight: 30,
  },
  miniTotal: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
    marginTop: 'auto',
  },
  miniBoton: { alignSelf: 'stretch', marginTop: spacing.sm },
  pie: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  piePunto: { width: 6, height: 6, borderRadius: radius.full },
  pieTexto: {
    fontSize: typography.micro,
    fontFamily: fuentes.medium,
  },
  syncProceso: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  syncSpinner: {
    width: 84,
    height: 84,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  syncTituloProceso: {
    fontSize: typography.subtitulo,
    fontFamily: fuentes.display,
    textAlign: 'center',
  },
  syncBarra: {
    width: '100%',
    height: 8,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  syncBarraAvance: { height: '100%', borderRadius: radius.full },
  syncPorcentaje: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.bold,
    alignSelf: 'flex-end',
  },
  syncEstado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.tarjeta,
    padding: spacing.md,
  },
  syncIcono: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncTitulo: { fontSize: typography.cuerpo, fontFamily: fuentes.semibold },
  syncSub: { fontSize: typography.micro, fontFamily: fuentes.regular, marginTop: 2 },
  syncFilas: { marginTop: spacing.md },
  syncFila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  syncFilaLabel: { fontSize: typography.cuerpo, fontFamily: fuentes.regular },
  syncFilaValor: { fontSize: typography.cuerpo, fontFamily: fuentes.semibold },
  syncError: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.medium,
    marginTop: spacing.md,
  },
});
