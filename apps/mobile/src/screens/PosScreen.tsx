import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Categoria, Producto, Settings, TurnoCaja } from '../types';
import { listarCategorias, listarProductosActivos } from '../db/repos/catalogo';
import { obtenerSettings } from '../db/repos/settings';
import { turnoAbierto, turnoAbiertoOCrear } from '../db/repos/turnos';
import { registrarVenta, type VentaNueva } from '../db/repos/ventas';
import { evaluarBloqueoOperativo } from '../licencias/verificar';
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
  Encabezado,
  Exito,
  Hoja,
  ListaVacia,
  Pantalla,
  ReglaPunteada,
  Superficie,
  parsearMonto,
} from '../components/UI';
import { AvisoLicencia } from '../components/AvisoLicencia';
import {
  fuentes,
  radius,
  spacing,
  typography,
} from '../theme';

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
  const [busqueda, setBusqueda] = useState('');
  const [hora, setHora] = useState(() => new Date());

  const [hoja, setHoja] = useState<'carrito' | 'pago' | 'cliente' | null>(null);
  const [formaPago, setFormaPago] = useState<FormaPago>('efectivo');
  const [montoTexto, setMontoTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cliente, setCliente] = useState('');
  const [clienteTexto, setClienteTexto] = useState('');
  const [ventaExitosa, setVentaExitosa] = useState<{
    numero: number;
    total: number;
    forma: FormaPago;
    cambio: number;
    items: LineaVenta[];
    negocio: string;
    cliente: string;
  } | null>(null);

  const lineas = useCarrito((s) => s.lineas);
  const descuentoPct = useCarrito((s) => s.descuentoPct);
  const { agregar, aumentar, disminuir, quitarLinea, vaciar, setDescuento } = useCarrito();
  const totales = usarTotales();

  const entradaLista = useRef(new Animated.Value(0)).current;
  const rebote = useRef(new Animated.Value(1)).current;
  const escalaExito = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    entradaLista.setValue(0);
    Animated.timing(entradaLista, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [categoriaSel, productos, entradaLista]);

  useEffect(() => {
    if (totales.cantidad > 0) {
      rebote.setValue(1.08);
      Animated.spring(rebote, { toValue: 1, friction: 5, useNativeDriver: true }).start();
    }
  }, [totales.cantidad, rebote]);

  useEffect(() => {
    if (ventaExitosa) {
      escalaExito.setValue(0);
      Animated.spring(escalaExito, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
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

  const q = busqueda.trim().toLowerCase();
  const filtrados = productos.filter(
    (p) =>
      (categoriaSel === 'todas' || p.categoriaId === categoriaSel) &&
      (q === '' || p.nombre.toLowerCase().includes(q))
  );
  const simbolo = settings?.simboloMoneda ?? '$';

  function cantidadEnCarrito(productoId: number): number {
    return lineas.find((l) => l.productoId === productoId)?.cantidad ?? 0;
  }

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
    agregar({ productoId: p.id, nombre: p.nombre, emoji: p.emoji, color: p.color, imagen: p.imagen, precio: p.precio });
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

  function confirmarVaciar() {
    if (lineas.length === 0) return;
    mostrarAviso('Vaciar carrito', 'Se quitarán todos los productos de esta venta.', [
      { texto: 'Cancelar', estilo: 'cancel' },
      { texto: 'Vaciar', estilo: 'peligro', onPress: vaciar },
    ]);
  }

  async function cobrar() {
    if (lineas.length === 0) return;

    // Sin licencia activada no se llega ni al cobro: se avisa antes de abrir
    // el pago para no hacer elegir forma de pago en vano.
    const bloqueo = await evaluarBloqueoOperativo(db);
    if (bloqueo) {
      mostrarAviso(bloqueo.titulo, bloqueo.mensaje);
      return;
    }

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
    const bloqueo = await evaluarBloqueoOperativo(db);
    if (bloqueo) {
      mostrarAviso(bloqueo.titulo, bloqueo.mensaje);
      return;
    }
    await turnoAbiertoOCrear(db, usuario.id, new Date());
    setTurno(await turnoAbierto(db, usuario.id));
  }

  async function confirmarVenta() {
    const bloqueo = await evaluarBloqueoOperativo(db);
    if (bloqueo) {
      mostrarAviso(bloqueo.titulo, bloqueo.mensaje);
      return;
    }
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
      setVentaExitosa({
        numero: res.numero,
        total: res.total,
        forma: res.formaPago,
        cambio,
        items: lineas.map((l) => ({ ...l })),
        negocio: settings?.nombreNegocio ?? 'MiCaja',
        cliente,
      });
      setHoja(null);
      vaciar();
      setCliente('');
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

  async function compartirTicket() {
    if (!ventaExitosa) return;
    const v = ventaExitosa;
    const simbolo = settings?.simboloMoneda ?? '$';
    const cuerpo = [
      v.negocio.toUpperCase(),
      `Venta #${String(v.numero).padStart(3, '0')}`,
      new Date().toLocaleString('es-CU'),
      v.cliente ? `Cliente: ${v.cliente}` : '',
      '--------------------------------',
      ...v.items.map(
        (i) => `${i.cantidad} x ${i.nombre}  ${formatearDinero(i.cantidad * i.precio, simbolo)}`
      ),
      '--------------------------------',
      `TOTAL: ${formatearDinero(v.total, simbolo)}`,
      `Pago: ${NOMBRES_FORMA_PAGO[v.forma]}`,
      v.cambio > 0 ? `Cambio: ${formatearDinero(v.cambio, simbolo)}` : '',
      '¡Gracias por su compra!',
    ]
      .filter(Boolean)
      .join('\n');
    const nombre = `ticket-${String(v.numero).padStart(3, '0')}.txt`;
    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([cuerpo], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = nombre;
        document.body.appendChild(enlace);
        enlace.click();
        document.body.removeChild(enlace);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return;
      }
      const archivo = new File(Paths.cache, nombre);
      archivo.create({ overwrite: true, intermediates: true });
      archivo.write(cuerpo);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(archivo.uri, {
          mimeType: 'text/plain',
          dialogTitle: 'Ticket de venta',
        });
      } else {
        mostrarAviso('Ticket listo', 'El ticket se guardó en el dispositivo.');
      }
    } catch {
      mostrarAviso('No se pudo compartir', 'No fue posible generar el ticket.');
    }
  }

  return (
    <Pantalla>
      <Encabezado
        titulo="Nueva venta"
        subtitulo={`${formatoHora(hora.toISOString())} · ${usuario.nombre}`}
        derecha={
          <>
            <Pressable
              onPress={confirmarVaciar}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Vaciar carrito"
              style={({ pressed }) => [
                { opacity: pressed ? 0.5 : lineas.length ? 1 : 0.35, padding: 4 },
              ]}
            >
              <MaterialIcons name="delete-outline" size={21} color="#FFFFFF" />
            </Pressable>
            {turno ? (
              <View style={styles.turnoPill}>
                <View style={[styles.turnoPunto, { backgroundColor: '#6BE3A0' }]} />
                <Text style={styles.turnoPillTexto}>Abierto</Text>
              </View>
            ) : null}
          </>
        }
      />

      <Superficie>
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
          <Campo
            valor={busqueda}
            onChange={setBusqueda}
            placeholder="Buscar producto..."
            icono="search"
          />
        </View>

        <AvisoLicencia />

        <FlatList
          horizontal
          data={[{ id: 'todas' as const, nombre: 'Todas' }, ...categorias]}
          keyExtractor={(c) => String(c.id)}
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={styles.chips}
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
              opacity: entradaLista,
              transform: [
                {
                  translateY: entradaLista.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
                },
              ],
            },
          ]}
        >
          <FlatList
            data={filtrados}
            keyExtractor={(p) => String(p.id)}
            contentContainerStyle={styles.lista}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <ListaVacia emoji="🧾" titulo="Sin productos" subtitulo="Agrega productos desde Ajustes" />
            }
            renderItem={({ item }) => {
              const agotado = item.stock <= 0;
              const enCarrito = cantidadEnCarrito(item.id);
              return (
                <Pressable
                  onPress={() => agregarProducto(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.nombre}, ${simbolo}${item.precio.toFixed(2)}`}
                  style={({ pressed }) => [
                    styles.filaProducto,
                    { borderBottomColor: colores.borde },
                    agotado && { opacity: 0.5 },
                    pressed && !agotado && { backgroundColor: colores.superficieSuave },
                  ]}
                >
                  <View style={[styles.productoTile, { backgroundColor: colores.superficieSuave }]}>
                    {item.imagen ? (
                      <Image source={{ uri: item.imagen }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : (
                      <Text style={styles.productoEmoji}>{item.emoji}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.productoNombre, { color: colores.texto }]} numberOfLines={1}>
                      {item.nombre}
                    </Text>
                    <Text style={[styles.productoPrecio, { color: colores.textoSuave }]}>
                      {formatearDinero(item.precio, simbolo)}
                      {agotado ? ' · Agotado' : item.stock <= item.stockMinimo ? ` · Quedan ${item.stock}` : ''}
                    </Text>
                  </View>
                  {enCarrito > 0 ? (
                    <View style={[styles.cantidadBadge, { backgroundColor: colores.primarioSuave }]}>
                      <Text style={[styles.cantidadBadgeTexto, { color: colores.primario }]}>{enCarrito}</Text>
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.masBoton,
                      { backgroundColor: agotado ? colores.superficieSuave : colores.primarioSuave },
                    ]}
                  >
                    <MaterialIcons
                      name="add"
                      size={22}
                      color={agotado ? colores.textoSuave : colores.primario}
                    />
                  </View>
                </Pressable>
              );
            }}
          />
        </Animated.View>

        <View
          style={[
            styles.barraCobro,
            { backgroundColor: colores.superficie, borderTopColor: colores.borde },
          ]}
        >
          <Animated.View style={{ transform: [{ scale: rebote }], flex: 1 }}>
            <Text style={[styles.barraCantidad, { color: colores.textoSuave }]}>
              Total · {totales.cantidad} {totales.cantidad === 1 ? 'artículo' : 'artículos'}
            </Text>
            <Text style={[styles.barraTotal, { color: colores.texto }]}>
              {formatearDinero(totales.total, simbolo)}
            </Text>
            <Pressable
              onPress={() => {
                setClienteTexto(cliente);
                setHoja('cliente');
              }}
              style={styles.agregarCliente}
              hitSlop={6}
            >
              <MaterialIcons name="person-add" size={15} color={colores.primario} />
              <Text style={[styles.agregarClienteTexto, { color: colores.primario }]} numberOfLines={1}>
                {cliente || 'Agregar cliente'}
              </Text>
            </Pressable>
            {!turno ? (
              <Text style={[styles.barraCajaCerrada, { color: colores.peligro }]}>Caja cerrada</Text>
            ) : null}
          </Animated.View>
          <Boton
            titulo={turno ? 'Cobrar' : 'Abrir caja'}
            icono={turno ? 'point-of-sale' : 'lock-open'}
            variante="primario"
            tamanio="lg"
            bloqueado={turno ? lineas.length === 0 : false}
            onPress={turno ? () => setHoja('carrito') : abrirCaja}
            estilo={{ minWidth: turno ? 158 : 150 }}
          />
        </View>
      </Superficie>

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
                <Text style={[styles.valorFila, { color: colores.primario }]}>
                  −{formatearDinero(totales.subtotal - totales.total, simbolo)}
                </Text>
              </View>
            ) : null}
            <View style={[styles.filaTotal, { marginTop: spacing.xs }]}>
              <Text style={[styles.textoTotal, { color: colores.texto }]}>Total</Text>
              <Text style={[styles.valorTotal, { color: colores.texto }]}>
                {formatearDinero(totales.total, simbolo)}
              </Text>
            </View>
            <Boton
              titulo="Continuar al pago"
              variante="primario"
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
                {i > 0 ? (
                  <View style={[styles.lineaDivisor, { backgroundColor: colores.borde }]} />
                ) : null}
                <View style={styles.linea}>
                  <View style={styles.lineaInfo}>
                    <View style={[styles.lineaEmoji, { backgroundColor: colores.superficieSuave }]}>
                      {l.imagen ? (
                        <Image source={{ uri: l.imagen }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      ) : (
                        <Text style={{ fontSize: 21 }}>{l.emoji}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.lineaNombre, { color: colores.texto }]} numberOfLines={1}>
                        {l.nombre}
                      </Text>
                      <Text style={[styles.lineaPrecio, { color: colores.textoSuave }]}>
                        {formatearDinero(l.precio * l.cantidad, simbolo)}
                      </Text>
                    </View>
                    <Contador
                      cantidad={l.cantidad}
                      onMas={() => aumentarLinea(i)}
                      onMenos={() => disminuir(i)}
                    />
                    <Pressable
                      onPress={() => quitarLinea(i)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Quitar ${l.nombre}`}
                      style={({ pressed }) => [{ padding: spacing.xs }, pressed && { opacity: 0.55 }]}
                    >
                      <MaterialIcons name="close" size={18} color={colores.textoSuave} />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </Hoja>

      <Hoja
        visible={hoja === 'cliente'}
        onCerrar={() => setHoja(null)}
        titulo="Agregar cliente"
        subtitulo="Opcional · aparecerá en el ticket"
        pie={
          <View style={{ gap: spacing.sm }}>
            <Boton
              titulo="Guardar"
              tamanio="lg"
              onPress={() => {
                setCliente(clienteTexto.trim());
                setHoja(null);
              }}
            />
            {cliente ? (
              <Boton
                titulo="Quitar cliente"
                variante="fantasma"
                tamanio="md"
                onPress={() => {
                  setCliente('');
                  setClienteTexto('');
                  setHoja(null);
                }}
              />
            ) : null}
          </View>
        }
      >
        <Campo
          valor={clienteTexto}
          onChange={setClienteTexto}
          placeholder="Nombre del cliente"
          icono="person"
          autoFocus
        />
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
              variante="primario"
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

        <View style={[styles.pagoTotal, { backgroundColor: colores.primarioSuave }]}>
          <Text style={[styles.pagoTotalLabel, { color: colores.primario }]}>Total</Text>
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
              <View style={[styles.cambio, { backgroundColor: colores.exitoSuave }]}>
                <MaterialIcons name="currency-exchange" size={18} color={colores.exito} />
                <Text style={[styles.cambioTexto, { color: colores.exito }]}>
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
        <View style={[styles.exitoFondo, { backgroundColor: colores.fondo }]}>
          <Animated.View
            style={{
              transform: [
                {
                  scale: escalaExito.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }),
                },
              ],
              opacity: escalaExito,
              width: '100%',
              flex: 1,
            }}
          >
            <View style={styles.exitoCabecera}>
              <Text style={[styles.exitoEtiqueta, { color: colores.textoSuave }]}>
                Venta #{String(ventaExitosa.numero).padStart(3, '0')}
              </Text>
            </View>
            <Exito
              titulo="Venta registrada con éxito"
              mensaje={`Se cobraron ${formatearDinero(ventaExitosa.total, simbolo)} por ${NOMBRES_FORMA_PAGO[ventaExitosa.forma]}.`}
            >
              <Text style={[styles.exitoTotal, { color: colores.texto }]}>
                Total: {formatearDinero(ventaExitosa.total, simbolo)}
              </Text>
              {ventaExitosa.cambio > 0 ? (
                <Text style={[styles.exitoCambio, { color: colores.exito }]}>
                  Cambio a devolver: {formatearDinero(ventaExitosa.cambio, simbolo)}
                </Text>
              ) : null}
              <Badge
                texto={NOMBRES_FORMA_PAGO[ventaExitosa.forma]}
                color={colores.primarioSuave}
                colorTexto={colores.primario}
              />
              <ReglaPunteada estilo={{ alignSelf: 'stretch', marginVertical: spacing.lg }} />
              <Boton
                titulo="Imprimir ticket"
                variante="secundario"
                tamanio="lg"
                icono="print"
                onPress={() => void compartirTicket()}
                estilo={{ alignSelf: 'stretch' }}
              />
              <Boton
                titulo="Nueva venta"
                variante="primario"
                tamanio="lg"
                onPress={() => setVentaExitosa(null)}
                estilo={{ alignSelf: 'stretch', marginTop: spacing.sm }}
              />
            </Exito>
          </Animated.View>
        </View>
      ) : null}
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  turnoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  turnoPunto: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
  },
  turnoPillTexto: {
    fontSize: 11,
    fontFamily: fuentes.semibold,
    color: '#FFFFFF',
  },
  chips: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  lista: { paddingHorizontal: spacing.md, paddingBottom: 104 },
  filaProducto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  productoTile: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productoEmoji: { fontSize: 26 },
  productoNombre: { fontSize: typography.cuerpo, fontFamily: fuentes.semibold },
  productoPrecio: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.regular,
    marginTop: 1,
  },
  cantidadBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  cantidadBadgeTexto: { fontSize: 11, fontFamily: fuentes.bold },
  masBoton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barraCobro: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
  },
  barraCantidad: {
    fontSize: typography.micro,
    fontFamily: fuentes.medium,
  },
  barraTotal: {
    fontSize: 28,
    fontFamily: fuentes.display,
    lineHeight: 34,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.8,
  },
  barraCajaCerrada: {
    fontSize: typography.micro,
    fontFamily: fuentes.semibold,
    marginTop: 1,
  },
  agregarCliente: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 5,
    paddingVertical: 2,
  },
  agregarClienteTexto: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
    maxWidth: 130,
  },
  lineaDivisor: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
  linea: {
    paddingVertical: spacing.sm,
  },
  lineaInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineaEmoji: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lineaNombre: { fontSize: typography.cuerpo, fontFamily: fuentes.semibold },
  lineaPrecio: { fontSize: typography.cuerpoChico, fontFamily: fuentes.regular },
  descuento: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, marginBottom: spacing.md },
  chipsDescuento: { flexDirection: 'row', gap: spacing.xs, paddingBottom: 10 },
  filaTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  textoFila: { fontSize: typography.cuerpo, fontFamily: fuentes.regular },
  valorFila: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.semibold,
    fontVariant: ['tabular-nums'],
  },
  textoTotal: { fontSize: typography.subtitulo, fontFamily: fuentes.semibold },
  valorTotal: {
    fontSize: typography.titulo,
    fontFamily: fuentes.display,
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
    borderRadius: radius.tarjeta,
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
    fontSize: 38,
    fontFamily: fuentes.display,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  efectivos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  cambio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  cambioTexto: { fontFamily: fuentes.semibold, fontSize: typography.cuerpo },
  errorPago: { fontFamily: fuentes.semibold, marginTop: spacing.sm },
  digitalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  digitalInfoTexto: { flex: 1, fontFamily: fuentes.medium, fontSize: typography.cuerpo },
  exitoFondo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    zIndex: 10,
  },
  exitoCabecera: {
    paddingTop: spacing.lg,
    alignItems: 'center',
  },
  exitoEtiqueta: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.semibold,
  },
  exitoTotal: {
    fontSize: 26,
    fontFamily: fuentes.display,
    marginTop: spacing.lg,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.6,
  },
  exitoCambio: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.semibold,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
});
