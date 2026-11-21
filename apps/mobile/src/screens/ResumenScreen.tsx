import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
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
import { useSync } from '../store/sync';
import {
  Boton,
  Encabezado,
  EstadoCarga,
  Pantalla,
  Segmentado,
  Superficie,
  Tarjeta,
} from '../components/UI';
import { Barras, BarraApilada } from '../components/Graficos';
import { fuentes, radius, spacing, typography } from '../theme';
import { NOMBRES_FORMA_PAGO } from '../utils/calculos';
import { formatearDinero, inicioDiaISO, finDiaISO, inicioSemanaISO, inicioMesISO } from '../utils/fechas';
import type { ParamListRaiz, ParamListTabs } from '../navigation';

type Rango = 'hoy' | 'semana' | 'mes';

const RANGOS: { id: Rango; etiqueta: string }[] = [
  { id: 'hoy', etiqueta: 'Diario' },
  { id: 'semana', etiqueta: 'Semanal' },
  { id: 'mes', etiqueta: 'Mensual' },
];

const COLORES_FORMA: Record<string, string> = {
  efectivo: '#22A85A',
  transfermovil: '#2E6FE0',
  enzona: '#7C5CE0',
  transferencia: '#14B8A6',
  mixto: '#E8A33D',
};

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export default function ResumenScreen() {
  const db = useSQLiteContext();
  const ultimaSync = useSync((s) => s.ultimaSync);
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
    }, [db, rango, ultimaSync])
  );

  if (cargando || !resumen) {
    return (
      <Pantalla>
        <Encabezado titulo="Reportes" />
        <Superficie>
          <EstadoCarga />
        </Superficie>
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
            valor: d.total,
            max: d.total === Math.max(...porDia.map((x) => x.total)),
          };
        })
      : [{ etiqueta: '—', valor: 0, max: false }];

  const segmentos = porForma.map((f) => ({
    etiqueta: f.formaPago,
    valor: f.total,
    color: COLORES_FORMA[f.formaPago] ?? colores.primario,
  }));

  const tituloPeriodo =
    rango === 'hoy' ? 'Ventas del día' : rango === 'semana' ? 'Ventas de la semana' : 'Ventas del mes';

  return (
    <Pantalla>
      <Encabezado titulo="Reportes" />
      <Superficie>

        <ScrollView
          contentContainerStyle={styles.contenido}
          showsVerticalScrollIndicator={false}
        >
          <Segmentado opciones={RANGOS} valor={rango} onCambio={setRango} />

          <Tarjeta>
            <Text style={[styles.tarjetaTitulo, { color: colores.texto }]}>{tituloPeriodo}</Text>
            <Text
              style={[styles.cifraGrande, { color: colores.texto }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatearDinero(totales, simbolo)}
            </Text>
            <Text style={[styles.tarjetaSub, { color: colores.textoSuave }]}>
              {ventasTotal} venta(s) · ticket medio {formatearDinero(resumen.ticketPromedio, simbolo)}
            </Text>
            <View style={{ marginTop: spacing.sm }}>
              <Barras datos={datosBarras} alto={92} />
            </View>
          </Tarjeta>

          <Tarjeta>
            <View style={styles.tarjetaCabecera}>
              <Text style={[styles.tarjetaTitulo, { color: colores.texto }]}>
                Productos más vendidos
              </Text>
              <View style={[styles.iconoSuave, { backgroundColor: colores.primarioSuave }]}>
                <MaterialIcons name="emoji-events" size={18} color={colores.primario} />
              </View>
            </View>
            {tops.length === 0 ? (
              <Text style={[styles.sinDatos, { color: colores.textoSuave }]}>
                Sin ventas en este período
              </Text>
            ) : (
              <View>
                {tops.map((t, i) => (
                  <View
                    key={`${t.nombre}-${i}`}
                    style={[
                      styles.topFila,
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colores.borde },
                    ]}
                  >
                    <View style={[styles.topTile, { backgroundColor: colores.superficieSuave }]}>
                      <Text style={{ fontSize: 21 }}>{t.emoji}</Text>
                    </View>
                    <Text
                      style={[styles.topNombre, { color: colores.texto }]}
                      numberOfLines={1}
                    >
                      {t.nombre}
                    </Text>
                    <Text style={[styles.topCantidad, { color: colores.texto }]}>{t.cantidad}</Text>
                  </View>
                ))}
              </View>
            )}
          </Tarjeta>

          <Tarjeta>
            <View style={styles.tarjetaCabecera}>
              <Text style={[styles.tarjetaTitulo, { color: colores.texto }]}>Formas de pago</Text>
              <View style={[styles.iconoSuave, { backgroundColor: colores.infoSuave }]}>
                <MaterialIcons name="account-balance-wallet" size={18} color={colores.info} />
              </View>
            </View>
            {porForma.length === 0 ? (
              <Text style={[styles.sinDatos, { color: colores.textoSuave }]}>
                Sin cobros en este período
              </Text>
            ) : (
              <>
                <BarraApilada segmentos={segmentos} />
                <View style={styles.leyenda}>
                  {porForma.map((f) => (
                    <View key={f.formaPago} style={styles.leyendaFila}>
                      <View
                        style={[
                          styles.leyendaPunto,
                          { backgroundColor: COLORES_FORMA[f.formaPago] ?? colores.primario },
                        ]}
                      />
                      <Text style={[styles.leyendaTexto, { color: colores.texto }]}>
                        {NOMBRES_FORMA_PAGO[f.formaPago]}
                      </Text>
                      <Text style={[styles.leyendaCantidad, { color: colores.textoSuave }]}>
                        {f.ventas}
                      </Text>
                      <Text style={[styles.leyendaTotal, { color: colores.texto }]}>
                        {formatearDinero(f.total, simbolo)}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </Tarjeta>

          <View style={styles.acciones}>
            <Boton
              titulo="Ver historial"
              icono="receipt-long"
              variante="secundario"
              tamanio="md"
              onPress={() => navigation.navigate('Historial')}
              estilo={{ flex: 1 }}
            />
            <Boton
              titulo="Cerrar caja"
              icono="lock-outline"
              variante="primario"
              tamanio="md"
              onPress={() => navigation.navigate('Turno')}
              estilo={{ flex: 1 }}
            />
          </View>
        </ScrollView>
      </Superficie>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  tarjetaTitulo: {
    fontSize: typography.destacado,
    fontFamily: fuentes.display,
    letterSpacing: -0.3,
  },
  cifraGrande: {
    fontSize: 34,
    fontFamily: fuentes.display,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.xs,
  },
  tarjetaSub: { fontSize: typography.cuerpoChico, fontFamily: fuentes.regular, marginTop: 2 },
  tarjetaCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  iconoSuave: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
  },
  topTile: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topNombre: { flex: 1, fontSize: typography.cuerpo, fontFamily: fuentes.medium },
  topCantidad: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
  },
  leyenda: { gap: spacing.sm, marginTop: spacing.md },
  leyendaFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  leyendaPunto: { width: 9, height: 9, borderRadius: radius.full },
  leyendaTexto: { flex: 1, fontSize: typography.cuerpoChico, fontFamily: fuentes.medium },
  leyendaCantidad: { fontSize: typography.micro, fontFamily: fuentes.medium, minWidth: 26, textAlign: 'right' },
  leyendaTotal: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
    fontVariant: ['tabular-nums'],
    minWidth: 74,
    textAlign: 'right',
  },
  sinDatos: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.regular,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  acciones: { flexDirection: 'row', gap: spacing.sm },
});
