import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import type { Settings } from '../types';
import {
  resumenDia,
  ventasPorDia,
  ventasPorForma,
  topProductos,
  type ResumenDia,
  type VentaPorDia,
  type VentaPorForma,
  type TopProducto,
} from '../db/repos/estadisticas';
import { obtenerSettings } from '../db/repos/settings';
import { useTema } from '../store/tema';
import { useSesion } from '../store/sesion';
import { Boton, Chip, Encabezado, EstadoCarga, Pantalla, SombraDura, Tarjeta } from '../components/UI';
import { Barras, BarraApilada, FilasProgreso } from '../components/Graficos';
import { fuentes, radius, spacing, typography } from '../theme';
import { NOMBRES_FORMA_PAGO } from '../utils/calculos';
import { formatearDinero, inicioDiaISO, finDiaISO, inicioSemanaISO, inicioMesISO } from '../utils/fechas';
import type { ParamListRaiz, ParamListTabs } from '../navigation';

type Rango = 'hoy' | 'semana' | 'mes';

const RANGOS: { id: Rango; etiqueta: string }[] = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'semana', etiqueta: 'Semana' },
  { id: 'mes', etiqueta: 'Mes' },
];

const COLORES_FORMA: Record<string, string> = {
  efectivo: '#22C55E',
  transfermovil: '#3B82F6',
  enzona: '#A855F7',
  transferencia: '#14B8A6',
  mixto: '#FF6B35',
};

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export default function ResumenScreen() {
  const db = useSQLiteContext();
  const usuario = useSesion((s) => s.usuario)!;
  const { colores } = useTema();
  const navigation = useNavigation<NavigationProp<ParamListRaiz & ParamListTabs>>();

  const [rango, setRango] = useState<Rango>('hoy');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [resumen, setResumen] = useState<ResumenDia | null>(null);
  const [porDia, setPorDia] = useState<VentaPorDia[]>([]);
  const [porForma, setPorForma] = useState<VentaPorForma[]>([]);
  const [tops, setTops] = useState<TopProducto[]>([]);
  const [cargando, setCargando] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let activo = true;
      (async () => {
        const [desde, hasta] =
          rango === 'hoy'
            ? ([inicioDiaISO(), finDiaISO()] as const)
            : rango === 'semana'
              ? ([inicioSemanaISO(), finDiaISO()] as const)
              : ([inicioMesISO(), finDiaISO()] as const);

        const [conf, r, dias, formas, top] = await Promise.all([
          obtenerSettings(db),
          resumenDia(db, desde, hasta),
          ventasPorDia(db, desde, hasta),
          ventasPorForma(db, desde, hasta),
          topProductos(db, desde, hasta, 5),
        ]);
        if (!activo) return;
        setSettings(conf);
        setResumen(r);
        setPorDia(dias);
        setPorForma(formas);
        setTops(top);
        setCargando(false);
      })().catch(() => activo && setCargando(false));
      return () => {
        activo = false;
      };
    }, [db, rango])
  );

  if (cargando || !resumen) {
    return (
      <Pantalla>
        <Encabezado titulo="Resumen" />
        <EstadoCarga />
      </Pantalla>
    );
  }

  const simbolo = settings?.simboloMoneda ?? '$';
  const totales = porDia.reduce((a, d) => a + d.total, 0);
  const ventasTotal = porDia.reduce((a, d) => a + d.ventas, 0);
  const datosBarras =
    porDia.length > 0
      ? porDia.map((d) => {
          const fecha = new Date(`${d.dia}T12:00:00`);
          return {
            etiqueta: DIAS[fecha.getDay()],
            valor: d.ventas,
            max: d.ventas === Math.max(...porDia.map((x) => x.ventas)),
          };
        })
      : [{ etiqueta: '—', valor: 0, max: false }];

  const segmentos = porForma.map((f) => ({
    etiqueta: f.formaPago,
    valor: f.total,
    color: COLORES_FORMA[f.formaPago] ?? colores.primario,
  }));

  const kpis = [
    { etiqueta: 'Ventas', valor: String(resumen.ventas), icono: 'receipt-long', color: colores.info, fondo: colores.infoSuave },
    {
      etiqueta: 'Ingresos',
      valor: formatearDinero(resumen.ingresos, simbolo),
      icono: 'payments',
      color: colores.acento,
      fondo: colores.acentoSuave,
    },
    {
      etiqueta: 'Ticket promedio',
      valor: formatearDinero(resumen.ticketPromedio, simbolo),
      icono: 'shopping-bag',
      color: colores.advertencia,
      fondo: colores.advertenciaSuave,
    },
    {
      etiqueta: 'Efectivo',
      valor: formatearDinero(resumen.efectivo, simbolo),
      icono: 'currency-exchange',
      color: colores.primario,
      fondo: colores.primarioSuave,
    },
  ];

  return (
    <Pantalla>
      <Encabezado
        titulo="Resumen"
        subtitulo="Rendimiento del negocio"
        derecha={
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            {RANGOS.map((r) => (
              <Chip key={r.id} etiqueta={r.etiqueta} activo={rango === r.id} onPress={() => setRango(r.id)} />
            ))}
          </View>
        }
      />
      <ScrollView contentContainerStyle={[styles.contenido, { paddingBottom: 110 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.kpis}>
          {kpis.map((k) => (
            <SombraDura key={k.etiqueta} redondeo={radius.lg} offset={2} estilo={styles.kpiContenedor}>
              <View style={[styles.kpi, { backgroundColor: colores.superficie, borderColor: colores.borde }]}>
                <View style={[styles.kpiIcono, { backgroundColor: k.fondo }]}>
                  <MaterialIcons name={k.icono as never} size={18} color={k.color} />
                </View>
                <Text style={[styles.kpiValor, { color: colores.texto }]} numberOfLines={1} adjustsFontSizeToFit>
                  {k.valor}
                </Text>
                <Text style={[styles.kpiLabel, { color: colores.textoSuave }]}>{k.etiqueta}</Text>
              </View>
            </SombraDura>
          ))}
        </View>

        <Tarjeta estilo={styles.tarjeta} redondeo={radius.md}>
          <View style={styles.tarjetaCabecera}>
            <View>
              <Text style={[styles.tarjetaTitulo, { color: colores.texto }]}>Ventas por día</Text>
              <Text style={[styles.tarjetaSub, { color: colores.textoSuave }]}>
                {ventasTotal} ventas · {formatearDinero(totales, simbolo)}
              </Text>
            </View>
            <MaterialIcons name="trending-up" size={22} color={colores.acento} />
          </View>
          <Barras datos={datosBarras} />
        </Tarjeta>

        <Tarjeta estilo={styles.tarjeta} redondeo={radius.md}>
          <View style={styles.tarjetaCabecera}>
            <View>
              <Text style={[styles.tarjetaTitulo, { color: colores.texto }]}>Formas de pago</Text>
              <Text style={[styles.tarjetaSub, { color: colores.textoSuave }]}>
                {formatearDinero(resumen.efectivo + resumen.digital, simbolo)} cobrados
              </Text>
            </View>
            <MaterialIcons name="account-balance-wallet" size={22} color={colores.info} />
          </View>
          <BarraApilada segmentos={segmentos} />
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {porForma.map((f) => (
              <View key={f.formaPago} style={styles.leyendaFila}>
                <View style={[styles.leyendaPunto, { backgroundColor: COLORES_FORMA[f.formaPago] ?? colores.primario }]} />
                <Text style={[styles.leyendaTexto, { color: colores.texto }]}>
                  {NOMBRES_FORMA_PAGO[f.formaPago]}
                </Text>
                <Text style={[styles.leyendaTotal, { color: colores.texto }]}>
                  {formatearDinero(f.total, simbolo)}
                </Text>
                <Text style={[styles.leyendaVentas, { color: colores.textoSuave }]}>{f.ventas} venta(s)</Text>
              </View>
            ))}
          </View>
        </Tarjeta>

        <Tarjeta estilo={styles.tarjeta} redondeo={radius.md}>
          <View style={styles.tarjetaCabecera}>
            <View>
              <Text style={[styles.tarjetaTitulo, { color: colores.texto }]}>Productos más vendidos</Text>
              <Text style={[styles.tarjetaSub, { color: colores.textoSuave }]}>Por cantidad de unidades</Text>
            </View>
            <MaterialIcons name="emoji-events" size={22} color={colores.advertencia} />
          </View>
          {tops.length === 0 ? (
            <Text style={[styles.sinDatos, { color: colores.textoSuave }]}>Sin ventas en este período</Text>
          ) : (
            <FilasProgreso
              items={tops.map((t) => ({
                emoji: t.emoji,
                nombre: t.nombre,
                valor: t.cantidad,
                detalle: `${t.cantidad} u · ${formatearDinero(t.total, simbolo)}`,
              }))}
            />
          )}
        </Tarjeta>

        <Boton
          titulo="Cerrar caja / turno"
          icono="lock-outline"
          variante="suave"
          tamanio="lg"
          onPress={() => navigation.navigate('Turno')}
          estilo={{ marginTop: spacing.md }}
        />
      </ScrollView>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  contenido: { paddingHorizontal: spacing.lg, gap: spacing.md },
  kpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kpiContenedor: {
    width: '48.5%',
  },
  kpi: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  kpiIcono: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  kpiValor: {
    fontSize: typography.subtitulo,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  kpiLabel: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.regular,
    marginTop: 3,
  },
  tarjeta: {
    padding: spacing.lg,
  },
  tarjetaCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  tarjetaTitulo: {
    fontSize: typography.destacado,
    fontFamily: fuentes.bold,
    letterSpacing: -0.3,
  },
  tarjetaSub: { fontSize: typography.cuerpoChico, fontFamily: fuentes.regular, marginTop: 2 },
  leyendaFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  leyendaPunto: { width: 12, height: 12, borderRadius: radius.full },
  leyendaTexto: { flex: 1, fontSize: typography.cuerpo, fontFamily: fuentes.regular },
  leyendaTotal: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
  },
  leyendaVentas: { fontSize: typography.cuerpoChico, fontFamily: fuentes.regular },
  sinDatos: { fontSize: typography.cuerpo, fontFamily: fuentes.regular, textAlign: 'center', paddingVertical: spacing.md },
});
