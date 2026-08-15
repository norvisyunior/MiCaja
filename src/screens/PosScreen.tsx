import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import type { Categoria, Producto, Settings, TurnoCaja } from '../types';
import { listarCategorias, listarProductosActivos } from '../db/repos/catalogo';
import { obtenerSettings } from '../db/repos/settings';
import { turnoAbierto, turnoAbiertoOCrear } from '../db/repos/turnos';
import { registrarVenta, type VentaNueva } from '../db/repos/ventas';
import { useSesion } from '../store/sesion';
import { useCarrito, usarTotales } from '../store/carrito';
import { useAvisos } from '../store/avisos';
import { useTema } from '../store/tema';
import { NOMBRES_FORMA_PAGO } from '../utils/calculos';
import type { FormaPago } from '../types';
import type { LineaVenta } from '../utils/calculos';
import { formatearDinero, formatoHora } from '../utils/fechas';
import {
  Badge,
  Boton,
  Campo,
  Chip,
  Contador,
  Gradiente,
  Hoja,
  ListaVacia,
  Pantalla,
  ReglaPunteada,
  Sello,
  SombraDura,
  parsearMonto,
} from '../components/UI';
import { fuentes, gradientes, radius, spacing, typography } from '../theme';

const FORMAS: { id: FormaPago; icono: 'payments' | 'phone-android' | 'account-balance-wallet' | 'swap-horiz' }[] = [
  { id: 'efectivo', icono: 'payments' },
  { id: 'transfermovil', icono: 'phone-android' },
  { id: 'enzona', icono: 'phone-android' },
  { id: 'transferencia', icono: 'account-balance-wallet' },
  { id: 'mixto', icono: 'swap-horiz' },
];

function aLineaVentaNueva(l: LineaVenta) {
  return { productoId: l.productoId, nombre: l.nombre, precioUnitario: l.precio, cantidad: l.cantidad };
}

export default function PosScreen() {
  const db = useSQLiteContext();
  const usuario = useSesion((s) => s.usuario)!;
  const { colores } = useTema();
  const mostrarAviso = useAvisos((s) => s.mostrar);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [turno, setTurno] = useState<TurnoCaja | null>(null);
  const [categoriaSel, setCategoriaSel] = useState<number | 'todas'>('todas');
  const [hora, setHora] = useState(() => new Date());

  const [hoja, setHoja] = useState<'carrito' | 'pago' | null>(null);
  const [formaPago, setFormaPago] = useState<FormaPago>('efectivo');
  const [montoTexto, setMontoTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [ventaExitosa, setVentaExitosa] = useState<{ numero: number; total: number; forma: FormaPago; cambio: number } | null>(null);

  const lineas = useCarrito((s) => s.lineas);
  const descuentoPct = useCarrito((s) => s.descuentoPct);
  const { agregar, aumentar, disminuir, quitarLinea, vaciar, setDescuento } = useCarrito();
  const totales = usarTotales();

  const entradaGrilla = useRef(new Animated.Value(0)).current;
  const rebote = useRef(new Animated.Value(1)).current;
  const escalaExito = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    entradaGrilla.setValue(0);
    Animated.timing(entradaGrilla, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [categoriaSel, productos, entradaGrilla]);

  useEffect(() => {
    if (totales.cantidad > 0) {
      rebote.setValue(1.1);
      Animated.spring(rebote, { toValue: 1, friction: 5, useNativeDriver: true }).start();
    }
  }, [totales.cantidad, rebote]);

  useEffect(() => {
    if (ventaExitosa) {
      escalaExito.setValue(0);
      Animated.spring(escalaExito, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }).start();
    }
  }, [ventaExitosa, escalaExito]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [prods, cats, conf, t] = await Promise.all([
          listarProductosActivos(db),
          listarCategorias(db),
          obtenerSettings(db),
          turnoAbierto(db, usuario.id),
        ]);
        setProductos(prods);
        setCategorias(cats.filter((c) => c.activo));
        setSettings(conf);
        setTurno(t);
      })().catch(() => undefined);
    }, [db, usuario.id])
  );

  const filtrados = categoriaSel === 'todas' ? productos : productos.filter((p) => p.categoriaId === categoriaSel);
  const simbolo = settings?.simboloMoneda ?? '$';

  function stockDe(linea: LineaVenta): number {
    const p = productos.find((x) => x.id === linea.productoId);
    return p?.stock ?? 0;
  }

  function agregarProducto(p: Producto) {
    if (p.stock <= 0) {
      mostrarAviso('Agotado', `${p.nombre} no tiene stock disponible.`);
      return;
    }
    const existente = lineas.find((l) => l.productoId === p.id);
    if (existente && existente.cantidad >= p.stock) {
      mostrarAviso('Stock insuficiente', `Solo quedan ${p.stock} unidades de ${p.nombre}.`);
      return;
    }
    agregar({ productoId: p.id, nombre: p.nombre, emoji: p.emoji, color: p.color, precio: p.precio });
  }

  function aumentarLinea(i: number) {
    const linea = lineas[i];
    if (!linea) return;
    const stock = stockDe(linea);
    if (stock > 0 && linea.cantidad >= stock) {
      mostrarAviso('Stock insuficiente', `Solo quedan ${stock} unidades de ${linea.nombre}.`);
      return;
    }
    aumentar(i);
  }

  function cobrar() {
    if (lineas.length === 0) return;
    if (!turno) {
      mostrarAviso('Caja cerrada', 'Debes abrir la caja antes de cobrar.', [
        { texto: 'Cancelar', estilo: 'cancel' },
        {
          texto: 'Abrir caja',
          onPress: () =>
            abrirCaja().then(() => {
              setFormaPago('efectivo');
              setMontoTexto(String(totales.total));
              setHoja('pago');
            }),
        },
      ]);
      return;
    }
    setFormaPago('efectivo');
    setMontoTexto(String(totales.total));
    setHoja('pago');
  }

  async function abrirCaja() {
    await turnoAbiertoOCrear(db, usuario.id, new Date());
    setTurno(await turnoAbierto(db, usuario.id));
  }

  async function confirmarVenta() {
    if (guardando) return;
    const total = totales.total;
    let montoEfectivo = 0;
    let montoDigital = 0;

    if (formaPago === 'efectivo') {
      montoEfectivo = parsearMonto(montoTexto);
      if (montoEfectivo < total) {
        mostrarAviso('Monto insuficiente', 'El efectivo recibido no cubre el total de la venta.');
        return;
      }
    } else if (formaPago === 'mixto') {
      montoEfectivo = parsearMonto(montoTexto);
      if (montoEfectivo < 0 || montoEfectivo > total) {
        mostrarAviso('Monto inválido', 'El efectivo del pago mixto debe estar entre 0 y el total.');
        return;
      }
      montoDigital = total - montoEfectivo;
    }

    setGuardando(true);
    try {
      const venta: VentaNueva = {
        usuarioId: usuario.id,
        subtotal: totales.subtotal,
        descuentoPct,
        total,
        formaPago,
        montoEfectivo,
        montoDigital,
        items: lineas.map(aLineaVentaNueva),
      };
      const res = await registrarVenta(db, venta);
      const cambio = formaPago === 'efectivo' ? Math.max(0, montoEfectivo - total) : 0;
      setVentaExitosa({ numero: res.numero, total: res.total, forma: res.formaPago, cambio });
      setHoja(null);
      vaciar();
      const t = await turnoAbierto(db, usuario.id);
      setTurno(t);
      const [prods] = await Promise.all([listarProductosActivos(db)]);
      setProductos(prods);
    } catch (e) {
      console.error('ERROR REGISTRAR VENTA:', e);
      const esStock = String(e).includes('STOCK_INSUFICIENTE');
      const esTurno = String(e).includes('SIN_TURNO');
      const detalle = e instanceof Error ? e.message : String(e);
      mostrarAviso(
        esStock ? 'Stock insuficiente' : esTurno ? 'Caja cerrada' : 'Error',
        esStock
          ? 'No hay stock suficiente para completar la venta.'
          : esTurno
            ? 'Debes abrir la caja antes de vender.'
            : `No se pudo registrar la venta. Intenta de nuevo.\n\n(${detalle})`
      );
    } finally {
      setGuardando(false);
    }
  }

  const montoEfectivo = parsearMonto(montoTexto);
  const cambio = formaPago === 'efectivo' ? Math.max(0, montoEfectivo - totales.total) : 0;
  const mixtoDigital = formaPago === 'mixto' ? Math.max(0, totales.total - montoEfectivo) : 0;

  return (
    <Pantalla>
      <View style={[styles.cabecera, { borderBottomColor: colores.borde }]}>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.nombreNegocio, { color: colores.texto }]}
            numberOfLines={1}
          >
            {settings?.nombreNegocio ?? 'Caja'}
          </Text>
          <Text style={[styles.cabeceraSub, { color: colores.textoSuave }]}>
            {formatoHora(hora.toISOString())} · {usuario.nombre}
          </Text>
        </View>
        {turno ? (
          <Sello texto="Turno abierto" color={colores.exito} />
        ) : (
          <Pressable
            onPress={abrirCaja}
            style={({ pressed }) => [
              styles.abrirCajaBoton,
              pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
            ]}
          >
            <Gradiente colores={gradientes.primario} estilo={StyleSheet.absoluteFill} />
            <MaterialIcons name="lock-open" size={15} color="#FFFFFF" />
            <Text style={styles.abrirCajaTexto}>Abrir caja</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        horizontal
        data={[{ id: 'todas' as const, nombre: 'Todas' }, ...categorias]}
        keyExtractor={(c) => String(c.id)}
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={[styles.chips, { paddingBottom: spacing.md }]}
        renderItem={({ item }) => (
          <Chip
            etiqueta={item.nombre}
            activo={categoriaSel === item.id}
            onPress={() => setCategoriaSel(item.id)}
          />
        )}
      />

      <Animated.View
        style={[
          { flex: 1 },
          {
            opacity: entradaGrilla,
            transform: [
              {
                translateY: entradaGrilla.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
              },
            ],
          },
        ]}
      >
        <FlatList
          data={filtrados}
          numColumns={3}
          key="3col"
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={[styles.grilla, { paddingBottom: 170 }]}
          columnWrapperStyle={{ gap: spacing.sm }}
          ListEmptyComponent={
            <ListaVacia emoji="🧾" titulo="Sin productos" subtitulo="Agrega productos desde Ajustes" />
          }
          renderItem={({ item }) => {
            const agotado = item.stock <= 0;
            return (
              <SombraDura redondeo={radius.lg} offset={2} estilo={styles.productoContenedor}>
                <Pressable
                  onPress={() => agregarProducto(item)}
                  style={({ pressed }) => [
                    styles.producto,
                    { backgroundColor: colores.superficie, borderColor: colores.borde },
                    agotado && { opacity: 0.55 },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <View
                    style={[
                      styles.emojiFondo,
                      {
                        backgroundColor: agotado ? colores.superficieSuave : `${item.color}14`,
                      },
                    ]}
                  >
                    <Text style={styles.productoEmoji}>{item.emoji}</Text>
                    {agotado ? (
                      <View style={styles.agotadoSello}>
                        <Text style={[styles.agotadoSelloTexto, { color: colores.peligro }]}>Agotado</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.productoNombre, { color: colores.texto }]} numberOfLines={2}>
                    {item.nombre}
                  </Text>
                  <Text style={[styles.productoPrecio, { color: item.color }]}>
                    {simbolo}
                    {item.precio.toFixed(2)}
                  </Text>
                  <Text
                    style={[
                      styles.productoStock,
                      { color: agotado ? colores.peligro : colores.textoSuave },
                    ]}
                  >
                    {agotado ? 'Sin existencias' : `${item.stock} en stock`}
                  </Text>
                </Pressable>
              </SombraDura>
            );
          }}
        />
      </Animated.View>

      <View style={styles.barraCobro}>
        <View style={[styles.barraContenido, { backgroundColor: colores.barra, shadowColor: colores.sombra }]}>
          <Animated.View style={{ transform: [{ scale: rebote }], flex: 1 }}>
            <Text style={[styles.barraCantidad, { color: colores.textoSuave }]}>
              {totales.cantidad} {totales.cantidad === 1 ? 'artículo' : 'artículos'}
            </Text>
            <Text style={[styles.barraTotal, { color: colores.texto }]}>
              {simbolo}
              {totales.total.toFixed(2)}
            </Text>
            {!turno ? (
              <Text style={[styles.barraCajaCerrada, { color: colores.peligro }]}>Caja cerrada</Text>
            ) : null}
          </Animated.View>
          <Boton
            titulo={turno ? 'Cobrar' : 'Abrir caja'}
            icono={turno ? 'point-of-sale' : 'lock-open'}
            variante={turno ? 'acento' : 'primario'}
            tamanio={turno ? 'xl' : 'lg'}
            bloqueado={turno ? lineas.length === 0 : false}
            onPress={turno ? () => setHoja('carrito') : abrirCaja}
            estilo={{ minWidth: turno ? 170 : 150 }}
          />
        </View>
      </View>

      <Hoja
        visible={hoja === 'carrito'}
        onCerrar={() => setHoja(null)}
        titulo="Carrito"
        subtitulo={`${totales.cantidad} artículo(s) · ${lineas.length} línea(s)`}
        pie={
          <View>
            <View style={styles.filaTotal}>
              <Text style={[styles.textoFila, { color: colores.textoSuave }]}>Subtotal</Text>
              <Text style={[styles.valorFila, { color: colores.texto }]}>
                {formatearDinero(totales.subtotal, simbolo)}
              </Text>
            </View>
            {descuentoPct > 0 ? (
              <View style={styles.filaTotal}>
                <Text style={[styles.textoFila, { color: colores.textoSuave }]}>
                  Descuento ({descuentoPct}%)
                </Text>
                <Text style={[styles.valorFila, { color: colores.acento }]}>
                  −{formatearDinero(totales.subtotal - totales.total, simbolo)}
                </Text>
              </View>
            ) : null}
            <View style={styles.filaTotal}>
              <Text style={[styles.textoTotal, { color: colores.texto }]}>Total</Text>
              <Text style={[styles.valorTotal, { color: colores.texto }]}>
                {formatearDinero(totales.total, simbolo)}
              </Text>
            </View>
            <Boton
              titulo="Continuar al pago"
              icono="arrow-forward"
              variante="acento"
              tamanio="lg"
              bloqueado={lineas.length === 0}
              onPress={cobrar}
            />
          </View>
        }
      >
        <View style={styles.descuento}>
          <View style={{ flex: 1 }}>
            <Campo
              etiqueta="Descuento (%)"
              valor={descuentoPct === 0 ? '' : String(descuentoPct)}
              onChange={(t) => setDescuento(parsearMonto(t))}
              teclado="numeric"
              placeholder="0"
            />
          </View>
          <View style={styles.chipsDescuento}>
            {[5, 10, 15, 20].map((d) => (
              <Chip
                key={d}
                etiqueta={`${d}%`}
                activo={descuentoPct === d}
                onPress={() => setDescuento(descuentoPct === d ? 0 : d)}
              />
            ))}
          </View>
        </View>
        {lineas.length === 0 ? (
          <ListaVacia emoji="🛒" titulo="Carrito vacío" subtitulo="Toca un producto para agregarlo" />
        ) : (
          <View>
            {lineas.map((l, i) => (
              <View key={`${l.productoId}-${i}`}>
                <View style={[styles.linea, { backgroundColor: colores.superficie, borderColor: colores.borde }]}>
                  <View style={styles.lineaInfo}>
                    <View style={[styles.lineaEmoji, { backgroundColor: `${l.color}14` }]}>
                      <Text style={{ fontSize: 22 }}>{l.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.lineaNombre, { color: colores.texto }]} numberOfLines={1}>
                        {l.nombre}
                      </Text>
                      <Text style={[styles.lineaPrecio, { color: colores.textoSuave }]}>
                        {formatearDinero(l.precio, simbolo)} c/u
                      </Text>
                    </View>
                    <Contador
                      cantidad={l.cantidad}
                      onMas={() => aumentarLinea(i)}
                      onMenos={() => disminuir(i)}
                    />
                    <Pressable onPress={() => quitarLinea(i)} hitSlop={8} style={{ padding: spacing.xs }}>
                      <MaterialIcons name="delete-outline" size={20} color={colores.peligro} />
                    </Pressable>
                  </View>
                  <Text style={[styles.lineaSubtotal, { color: colores.primario }]}>
                    {formatearDinero(l.precio * l.cantidad, simbolo)}
                  </Text>
                </View>
                {i < lineas.length - 1 ? (
                  <ReglaPunteada estilo={{ marginVertical: spacing.md }} />
                ) : null}
              </View>
            ))}
          </View>
        )}
      </Hoja>

      <Hoja
        visible={hoja === 'pago'}
        onCerrar={() => setHoja(null)}
        titulo="Cobrar venta"
        subtitulo={settings?.nombreNegocio}
        pie={
          <View>
            <View style={styles.filaTotal}>
              <Text style={[styles.textoTotal, { color: colores.texto }]}>Total a cobrar</Text>
              <Text style={[styles.valorTotal, { color: colores.texto }]}>
                {formatearDinero(totales.total, simbolo)}
              </Text>
            </View>
            <Boton
              titulo="Confirmar venta"
              icono="check-circle"
              variante="acento"
              tamanio="lg"
              cargando={guardando}
              onPress={confirmarVenta}
            />
          </View>
        }
      >
        <Text style={[styles.pagoFormaEtiqueta, { color: colores.textoSuave }]}>Forma de pago</Text>
        <View style={styles.formas}>
          {FORMAS.map((f) => (
            <Chip
              key={f.id}
              etiqueta={NOMBRES_FORMA_PAGO[f.id]}
              icono={f.icono}
              activo={formaPago === f.id}
              onPress={() => {
                setFormaPago(f.id);
                setMontoTexto(f.id === 'efectivo' ? String(totales.total) : '');
              }}
            />
          ))}
        </View>

        <View style={[styles.pagoTotal, { backgroundColor: colores.acentoSuave }]}>
          <Text style={[styles.pagoTotalLabel, { color: colores.acento }]}>Total</Text>
          <Text style={[styles.pagoTotalValor, { color: colores.texto }]}>
            {formatearDinero(totales.total, simbolo)}
          </Text>
        </View>

        {formaPago === 'efectivo' ? (
          <>
            <Campo
              etiqueta="Efectivo recibido"
              valor={montoTexto}
              onChange={setMontoTexto}
              teclado="numeric"
              sufijo={simbolo}
              autoFocus
            />
            <View style={styles.efectivos}>
              <Chip
                etiqueta="Exacto"
                activo={parsearMonto(montoTexto) === totales.total}
                onPress={() => setMontoTexto(String(totales.total))}
              />
              {[100, 200, 500, 1000].map((m) => (
                <Chip
                  key={m}
                  etiqueta={String(m)}
                  activo={parsearMonto(montoTexto) === m}
                  onPress={() => setMontoTexto(String(m))}
                />
              ))}
            </View>
            {cambio > 0 ? (
              <View
                style={[
                  styles.cambio,
                  { backgroundColor: colores.acentoSuave },
                ]}
              >
                <MaterialIcons name="currency-exchange" size={18} color={colores.acento} />
                <Text style={[styles.cambioTexto, { color: colores.acento }]}>
                  Cambio: {formatearDinero(cambio, simbolo)}
                </Text>
              </View>
            ) : null}
          </>
        ) : formaPago === 'mixto' ? (
          <>
            <Campo
              etiqueta="Efectivo del pago mixto"
              valor={montoTexto}
              onChange={setMontoTexto}
              teclado="numeric"
              sufijo={simbolo}
              autoFocus
            />
            <View style={styles.filaTotal}>
              <Text style={[styles.textoFila, { color: colores.textoSuave }]}>Parte digital</Text>
              <Text style={[styles.valorFila, { color: colores.texto }]}>
                {formatearDinero(mixtoDigital, simbolo)}
              </Text>
            </View>
            {montoEfectivo > totales.total ? (
              <Text style={[styles.errorPago, { color: colores.peligro }]}>
                El efectivo no puede superar el total. Usa la opción Efectivo.
              </Text>
            ) : null}
          </>
        ) : (
          <View style={[styles.digitalInfo, { backgroundColor: colores.infoSuave }]}>
            <MaterialIcons name="verified" size={22} color={colores.info} />
            <Text style={[styles.digitalInfoTexto, { color: colores.info }]}>
              Se cobrarán {formatearDinero(totales.total, simbolo)} por {NOMBRES_FORMA_PAGO[formaPago]}.
            </Text>
          </View>
        )}
      </Hoja>

      {ventaExitosa ? (
        <View style={[styles.exitoFondo, { backgroundColor: colores.overlay }]}>
          <Animated.View
            style={{
              transform: [
                {
                  scale: escalaExito.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
                },
              ],
              opacity: escalaExito,
              width: '100%',
              maxWidth: 380,
            }}
          >
            <SombraDura offset={6} redondeo={radius.xl} estilo={{ width: '100%' }}>
              <View
                style={[
                  styles.exitoTarjeta,
                  {
                    backgroundColor: colores.superficie,
                  },
                ]}
              >
                <Gradiente colores={gradientes.exito} estilo={styles.exitoIcono}>
                  <MaterialIcons name="check" size={40} color="#FFFFFF" />
                </Gradiente>
                <Sello texto="Vendido" color={colores.exito} />
                <Text style={[styles.exitoTitulo, { color: colores.texto }]}>
                  ¡Venta registrada!
                </Text>
                <Text style={[styles.exitoNumero, { color: colores.textoSuave }]}>
                  Venta N.º {ventaExitosa.numero}
                </Text>
                <Text style={[styles.exitoTotal, { color: colores.texto }]}>
                  {formatearDinero(ventaExitosa.total, simbolo)}
                </Text>
                <Badge
                  texto={NOMBRES_FORMA_PAGO[ventaExitosa.forma]}
                  color={colores.primarioSuave}
                  colorTexto={colores.primario}
                />
                {ventaExitosa.cambio > 0 ? (
                  <Text style={[styles.exitoCambio, { color: colores.acento }]}>
                    Cambio a devolver: {formatearDinero(ventaExitosa.cambio, simbolo)}
                  </Text>
                ) : null}
                <ReglaPunteada estilo={{ alignSelf: 'stretch', marginVertical: spacing.lg }} />
                <Boton
                  titulo="Nueva venta"
                  icono="add-shopping-cart"
                  variante="acento"
                  tamanio="lg"
                  onPress={() => setVentaExitosa(null)}
                  estilo={{ alignSelf: 'stretch' }}
                />
              </View>
            </SombraDura>
          </Animated.View>
        </View>
      ) : null}
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  nombreNegocio: {
    fontSize: typography.subtitulo,
    fontFamily: fuentes.bold,
    letterSpacing: -0.3,
  },
  cabeceraSub: { fontSize: typography.cuerpoChico, fontFamily: fuentes.medium, marginTop: 2 },
  abrirCajaBoton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  abrirCajaTexto: {
    fontSize: typography.micro,
    fontFamily: fuentes.semibold,
    color: '#FFFFFF',
  },
  barraCajaCerrada: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
    marginTop: 2,
  },
  chips: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  grilla: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  productoContenedor: { flex: 1, maxWidth: '33.33%', marginBottom: spacing.sm },
  producto: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  emojiFondo: {
    width: '100%',
    aspectRatio: 1.15,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  productoEmoji: { fontSize: 34 },
  agotadoSello: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  agotadoSelloTexto: {
    fontSize: 8,
    fontFamily: fuentes.bold,
    textTransform: 'uppercase',
  },
  productoNombre: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
    textAlign: 'center',
    lineHeight: 17,
  },
  productoPrecio: {
    fontSize: 16,
    fontFamily: fuentes.bold,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  productoStock: {
    fontSize: 10,
    fontFamily: fuentes.medium,
    marginTop: 3,
  },
  barraCobro: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 96,
  },
  barraContenido: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md,
    paddingLeft: spacing.lg,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  barraCantidad: {
    fontSize: typography.micro,
    fontFamily: fuentes.medium,
  },
  barraTotal: {
    fontSize: 34,
    fontFamily: fuentes.bold,
    lineHeight: 40,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  linea: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  lineaInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineaEmoji: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineaNombre: { fontSize: typography.cuerpo, fontFamily: fuentes.semibold },
  lineaPrecio: { fontSize: typography.cuerpoChico, fontFamily: fuentes.regular },
  lineaSubtotal: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.bold,
    textAlign: 'right',
    marginTop: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
  descuento: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, marginBottom: spacing.md },
  chipsDescuento: { flexDirection: 'row', gap: spacing.xs, paddingBottom: 2 },
  filaTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  textoFila: { fontSize: typography.cuerpo, fontFamily: fuentes.regular },
  valorFila: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
  },
  textoTotal: { fontSize: typography.subtitulo, fontFamily: fuentes.bold },
  valorTotal: {
    fontSize: typography.titulo,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  pagoFormaEtiqueta: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
    marginBottom: spacing.sm,
  },
  formas: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  pagoTotal: {
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  pagoTotalLabel: {
    fontSize: typography.micro,
    fontFamily: fuentes.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  pagoTotalValor: {
    fontSize: 40,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  efectivos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  cambio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  cambioTexto: { fontFamily: fuentes.bold, fontSize: typography.cuerpo },
  errorPago: { fontFamily: fuentes.semibold, marginTop: spacing.sm },
  digitalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  digitalInfoTexto: { flex: 1, fontFamily: fuentes.semibold, fontSize: typography.cuerpo },
  exitoFondo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    zIndex: 10,
  },
  exitoTarjeta: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
  },
  exitoIcono: {
    width: 76,
    height: 76,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  exitoTitulo: {
    fontSize: typography.titulo,
    fontFamily: fuentes.bold,
    letterSpacing: -0.4,
    marginTop: spacing.sm,
  },
  exitoNumero: { fontSize: typography.cuerpo, fontFamily: fuentes.regular, marginTop: spacing.xs },
  exitoTotal: {
    fontSize: 40,
    fontFamily: fuentes.bold,
    marginVertical: spacing.md,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  exitoCambio: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.bold,
    marginTop: spacing.md,
  },
});
