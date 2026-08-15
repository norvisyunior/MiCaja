import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import type { FormaPago, Venta } from '../types';
import { listarVentas, anularVenta, puedeAnularVenta } from '../db/repos/ventas';
import { obtenerSettings } from '../db/repos/settings';
import { useSesion } from '../store/sesion';
import { useAvisos } from '../store/avisos';
import { useTema } from '../store/tema';
import { NOMBRES_FORMA_PAGO } from '../utils/calculos';
import {
  finDiaISO,
  formatearDinero,
  formatoFechaHora,
  inicioDiaISO,
  inicioMesISO,
  inicioSemanaISO,
} from '../utils/fechas';
import { Badge, Boton, Campo, Chip, Encabezado, Hoja, ListaVacia, Pantalla, ReglaPunteada, SombraDura, EstadoCarga } from '../components/UI';
import { fuentes, radius, spacing, typography } from '../theme';

type Filtro = 'hoy' | 'semana' | 'mes' | 'todas';

const FILTROS: { id: Filtro; etiqueta: string }[] = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'semana', etiqueta: 'Semana' },
  { id: 'mes', etiqueta: 'Mes' },
  { id: 'todas', etiqueta: 'Todas' },
];

function rango(filtro: Filtro): [string, string] {
  switch (filtro) {
    case 'hoy':
      return [inicioDiaISO(), finDiaISO()];
    case 'semana':
      return [inicioSemanaISO(), finDiaISO()];
    case 'mes':
      return [inicioMesISO(), finDiaISO()];
    default:
      return ['2000-01-01T00:00:00.000Z', '2100-01-01T00:00:00.000Z'];
  }
}

export default function HistorialScreen() {
  const db = useSQLiteContext();
  const usuario = useSesion((s) => s.usuario)!;
  const { colores } = useTema();
  const mostrarAviso = useAvisos((s) => s.mostrar);

  const [filtro, setFiltro] = useState<Filtro>('hoy');
  const [busqueda, setBusqueda] = useState('');
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [simbolo, setSimbolo] = useState('$');
  const [detalle, setDetalle] = useState<Venta | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [noAnulable, setNoAnulable] = useState(false);

  async function abrirDetalle(item: Venta) {
    setDetalle(item);
    setAnulando(false);
    setMotivo('');
    setNoAnulable(false);
    const permitido = await puedeAnularVenta(db, item.id);
    if (permitido) return;
    setNoAnulable(true);
  }

  useFocusEffect(
    useCallback(() => {
      let activo = true;
      (async () => {
        const [desde, hasta] = rango(filtro);
        const [lista, conf] = await Promise.all([
          listarVentas(db, desde, hasta),
          obtenerSettings(db),
        ]);
        if (!activo) return;
        setVentas(lista);
        setSimbolo(conf.simboloMoneda);
        setCargando(false);
      })().catch(() => activo && setCargando(false));
      return () => {
        activo = false;
      };
    }, [db, filtro])
  );

  const coinciden = (v: Venta) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return (
      String(v.numero).includes(q) ||
      (v.usuarioNombre ?? '').toLowerCase().includes(q) ||
      v.items.some((it) => it.nombre.toLowerCase().includes(q))
    );
  };

  const filtradas = ventas.filter(coinciden);
  const totalFiltrado = filtradas.filter((v) => !v.anulada).reduce((a, v) => a + v.total, 0);
  const ventasValidas = filtradas.filter((v) => !v.anulada).length;

  async function confirmarAnulacion() {
    if (!detalle || !motivo.trim() || guardando) return;
    setGuardando(true);
    try {
      await anularVenta(db, detalle.id, motivo.trim(), usuario.id);
      setDetalle(null);
      setAnulando(false);
      setMotivo('');
      const [desde, hasta] = rango(filtro);
      const lista = await listarVentas(db, desde, hasta);
      setVentas(lista);
    } catch (e) {
      if (e instanceof Error && e.message === 'TURNO_CERRADO') {
        mostrarAviso(
          'Caja cerrada',
          'La caja de esta venta ya está cerrada. No se puede anular una venta de una apertura cerrada.'
        );
      } else {
        mostrarAviso('Error', 'No se pudo anular la venta. Intenta de nuevo.');
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Pantalla>
      <Encabezado
        titulo="Historial"
        subtitulo={ventasValidas > 0 ? `${ventasValidas} venta(s) · ${formatearDinero(totalFiltrado, simbolo)}` : 'Tus ventas registradas'}
      />
      <View style={[styles.busqueda, { gap: spacing.sm }]}>
        <Campo
          valor={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar por número, producto o usuario…"
          icono="search"
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {FILTROS.map((f) => (
            <Chip key={f.id} etiqueta={f.etiqueta} activo={filtro === f.id} onPress={() => setFiltro(f.id)} />
          ))}
        </View>
      </View>

      {cargando ? (
        <EstadoCarga />
      ) : (
        <FlatList
          data={filtradas}
          keyExtractor={(v) => String(v.id)}
          contentContainerStyle={[styles.lista, { paddingBottom: 110 }]}
          ListEmptyComponent={
            <ListaVacia emoji="🧾" titulo="Sin ventas" subtitulo="Las ventas registradas aparecerán aquí" />
          }
          renderItem={({ item }) => {
            const d = new Date(item.fechaIso);
            const fecha = d.toLocaleDateString('es-CU', { day: '2-digit', month: 'short' });
            const hora = d.toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' });
            return (
              <SombraDura redondeo={radius.md} offset={3}>
                <Pressable
                  onPress={() => abrirDetalle(item)}
                  style={({ pressed }) => [
                    styles.filaVenta,
                    { backgroundColor: colores.superficie, borderColor: colores.borde },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <View
                    style={[
                      styles.fechaBloque,
                      {
                        backgroundColor: item.anulada ? colores.peligroSuave : colores.superficieSuave,
                        borderColor: item.anulada ? colores.peligro : colores.borde,
                      },
                    ]}
                  >
                    <Text style={[styles.fechaDia, { color: item.anulada ? colores.peligro : colores.primario }]}>
                      {fecha}
                    </Text>
                    <Text style={[styles.fechaHora, { color: colores.textoSuave }]}>{hora}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.filaVentaNombre, { color: colores.texto }]} numberOfLines={1}>
                      {item.items.length > 0 ? item.items.map((it) => it.nombre).slice(0, 3).join(', ') : `Venta N.º ${item.numero}`}
                      {item.items.length > 3 ? ` +${item.items.length - 3}` : ''}
                    </Text>
                    <View style={styles.filaVentaBadges}>
                      <Badge
                        texto={NOMBRES_FORMA_PAGO[item.formaPago]}
                        color={colores.infoSuave}
                        colorTexto={colores.info}
                      />
                      {item.anulada ? (
                        <Badge texto="Anulada" color={colores.peligroSuave} colorTexto={colores.peligro} icono="block" />
                      ) : null}
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.filaVentaTotal,
                      { color: colores.texto },
                      item.anulada && { color: colores.textoSuave, textDecorationLine: 'line-through' },
                    ]}
                  >
                    {formatearDinero(item.total, simbolo)}
                  </Text>
                </Pressable>
              </SombraDura>
            );
          }}
        />
      )}

      <Hoja
        visible={!!detalle}
        onCerrar={() => {
          setDetalle(null);
          setAnulando(false);
          setMotivo('');
        }}
        titulo={detalle ? `Venta N.º ${detalle.numero}` : ''}
        subtitulo={detalle ? formatoFechaHora(detalle.fechaIso) : ''}
        pie={
          detalle && !detalle.anulada && !noAnulable ? (
            <Boton
              titulo="Anular venta"
              icono="block"
              variante="peligro"
              tamanio="md"
              onPress={() => setAnulando(true)}
            />
          ) : undefined
        }
      >
        {detalle ? (
          <>
            <View style={styles.detalleCabecera}>
              <Badge texto={NOMBRES_FORMA_PAGO[detalle.formaPago]} color={colores.infoSuave} colorTexto={colores.info} />
              <Badge texto={detalle.usuarioNombre ?? '—'} icono="person" color={colores.superficieSuave} colorTexto={colores.textoSuave} />
              {detalle.anulada ? (
                <Badge texto="Anulada" color={colores.peligroSuave} colorTexto={colores.peligro} icono="block" />
              ) : null}
            </View>

            {detalle.items.map((it) => (
              <View key={it.id} style={[styles.detalleItem, { backgroundColor: colores.superficie, borderColor: colores.borde }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detalleItemNombre, { color: colores.texto }]}>{it.nombre}</Text>
                  <Text style={[styles.detalleItemSub, { color: colores.textoSuave }]}>
                    {it.cantidad} × {formatearDinero(it.precioUnitario, simbolo)}
                  </Text>
                </View>
                <Text style={[styles.detalleItemTotal, { color: colores.texto }]}>
                  {formatearDinero(it.subtotal, simbolo)}
                </Text>
              </View>
            ))}

            <View style={[styles.detalleTotales, { backgroundColor: colores.superficie, borderColor: colores.borde }]}>
              <View style={styles.filaDetalle}>
                <Text style={[styles.textoDetalle, { color: colores.textoSuave }]}>Subtotal</Text>
                <Text style={[styles.valorDetalle, { color: colores.texto }]}>
                  {formatearDinero(detalle.subtotal, simbolo)}
                </Text>
              </View>
              {detalle.descuentoPct > 0 ? (
                <View style={styles.filaDetalle}>
                  <Text style={[styles.textoDetalle, { color: colores.textoSuave }]}>
                    Descuento ({detalle.descuentoPct}%)
                  </Text>
                  <Text style={[styles.valorDetalle, { color: colores.acento }]}>
                    −{formatearDinero(detalle.subtotal - detalle.total, simbolo)}
                  </Text>
                </View>
              ) : null}
              <View style={styles.filaDetalle}>
                <Text style={[styles.textoDetalle, { color: colores.textoSuave }]}>Efectivo</Text>
                <Text style={[styles.valorDetalle, { color: colores.texto }]}>
                  {formatearDinero(detalle.montoEfectivo, simbolo)}
                </Text>
              </View>
              <View style={styles.filaDetalle}>
                <Text style={[styles.textoDetalle, { color: colores.textoSuave }]}>Digital</Text>
                <Text style={[styles.valorDetalle, { color: colores.texto }]}>
                  {formatearDinero(detalle.montoDigital, simbolo)}
                </Text>
              </View>
              <View
                style={[
                  styles.filaDetalle,
                  { borderTopWidth: 1, borderTopColor: colores.borde, paddingTop: spacing.sm, marginTop: spacing.sm },
                ]}
              >
                <Text style={[styles.textoDetalleTotal, { color: colores.texto }]}>Total</Text>
                <Text style={[styles.valorDetalleTotal, { color: colores.primario }]}>
                  {formatearDinero(detalle.total, simbolo)}
                </Text>
              </View>
            </View>

            {detalle.anulada ? (
              <View style={[styles.anuladaInfo, { backgroundColor: colores.peligroSuave, borderColor: colores.peligro }]}>
                <MaterialIcons name="info-outline" size={18} color={colores.peligro} />
                <Text style={[styles.anuladaTexto, { color: colores.peligro }]}>
                  {detalle.motivoAnulacion ?? 'Sin motivo registrado.'}
                </Text>
              </View>
            ) : null}

            {!detalle.anulada && noAnulable ? (
              <View style={[styles.anuladaInfo, { backgroundColor: colores.advertenciaSuave, borderColor: colores.advertencia }]}>
                <MaterialIcons name="lock" size={18} color={colores.advertencia} />
                <Text style={[styles.anuladaTexto, { color: colores.advertencia }]}>
                  La caja de esta venta ya está cerrada. No se puede anular.
                </Text>
              </View>
            ) : null}

            {anulando ? (
              <View style={styles.anularZona}>
                <ReglaPunteada estilo={{ marginBottom: spacing.lg }} />
                <Campo
                  etiqueta="Motivo de la anulación"
                  valor={motivo}
                  onChange={setMotivo}
                  placeholder="Ej.: venta errónea, cambio de producto…"
                  multiline
                  autoFocus
                />
                <View style={styles.anularBotones}>
                  <Boton titulo="Cancelar" variante="secundario" onPress={() => setAnulando(false)} estilo={{ flex: 1 }} />
                  <Boton
                    titulo="Confirmar anulación"
                    variante="peligro"
                    cargando={guardando}
                    bloqueado={!motivo.trim()}
                    onPress={confirmarAnulacion}
                    estilo={{ flex: 2 }}
                  />
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </Hoja>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  busqueda: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  lista: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  filaVenta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  fechaBloque: {
    width: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  fechaDia: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.bold,
  },
  fechaHora: { fontSize: typography.micro, fontFamily: fuentes.medium, marginTop: 2 },
  filaVentaNombre: { fontSize: typography.cuerpo, fontFamily: fuentes.semibold },
  filaVentaBadges: { flexDirection: 'row', gap: spacing.xs, marginTop: 6, flexWrap: 'wrap' },
  filaVentaTotal: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
  },
  detalleCabecera: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
  detalleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  detalleItemNombre: { fontSize: typography.cuerpo, fontFamily: fuentes.semibold },
  detalleItemSub: { fontSize: typography.cuerpoChico, fontFamily: fuentes.regular, marginTop: 2 },
  detalleItemTotal: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
  },
  detalleTotales: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  filaDetalle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    borderTopWidth: 0,
    paddingTop: 0,
  },
  textoDetalle: { fontSize: typography.cuerpo, fontFamily: fuentes.regular },
  valorDetalle: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.semibold,
    fontVariant: ['tabular-nums'],
  },
  textoDetalleTotal: { fontSize: typography.subtitulo, fontFamily: fuentes.bold },
  valorDetalleTotal: {
    fontSize: typography.subtitulo,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
  },
  anuladaInfo: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  anuladaTexto: { flex: 1, fontFamily: fuentes.semibold },
  anularZona: { marginTop: spacing.lg },
  anularBotones: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
});
