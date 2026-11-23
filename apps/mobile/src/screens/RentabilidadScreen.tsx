import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  actualizarGasto,
  crearGasto,
  eliminarGasto,
  listarGastos,
} from '../db/repos/gastos';
import {
  crearMovimientoCaja,
  eliminarMovimientoCaja,
  listarMovimientosCajaPorFecha,
} from '../db/repos/cierre';
import {
  calcularRentabilidadLocal,
  type ReporteRentabilidadLocal,
} from '../db/repos/rentabilidad';
import { obtenerSettings } from '../db/repos/settings';
import { turnoAbierto } from '../db/repos/turnos';
import {
  CATEGORIAS_GASTO,
  type CategoriaGasto,
  type Gasto,
  type MovimientoCaja,
  type Settings,
  type TipoMovimientoCaja,
} from '../types';
import { useAvisos } from '../store/avisos';
import { useSesion } from '../store/sesion';
import { useSync } from '../store/sync';
import { useTema } from '../store/tema';
import {
  Boton,
  Campo,
  Chip,
  ConfirmarModal,
  Encabezado,
  EstadoCarga,
  Hoja,
  Pantalla,
  Superficie,
  Tarjeta,
  parsearMonto,
} from '../components/UI';
import { fuentes, radius, spacing, typography, type PaletaColores } from '../theme';
import {
  formatearDinero,
  formatoFechaCorta,
  inicioDiaISO,
  finDiaISO,
  inicioSemanaISO,
  inicioMesISO,
  inicioMesAnteriorISO,
  finMesAnteriorISO,
} from '../utils/fechas';
import { FORMAS_PAGO, NOMBRES_FORMA_PAGO } from '../utils/calculos';
import type { ParamListRaiz, ParamListTabs } from '../navigation';

type Periodo = 'hoy' | 'semana' | 'mes' | 'mes_anterior' | 'personalizado';

const PERIODOS: { id: Periodo; etiqueta: string }[] = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: 'semana', etiqueta: '7 días' },
  { id: 'mes', etiqueta: 'Este mes' },
  { id: 'mes_anterior', etiqueta: 'Mes anterior' },
  { id: 'personalizado', etiqueta: 'Otro' },
];

const ETIQUETAS_MOVIMIENTO: Record<TipoMovimientoCaja, string> = {
  entrada: 'Entrada de efectivo',
  retiro: 'Retiro de efectivo',
  gasto: 'Gasto desde caja',
  otra_salida: 'Otra salida',
};

const ETIQUETAS_CATEGORIA: Record<CategoriaGasto, string> = {
  transporte: 'Transporte',
  servicios: 'Servicios',
  salarios: 'Salarios',
  electricidad: 'Electricidad',
  alquiler: 'Alquiler',
  otros: 'Otros',
};

function dosDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}

function fechaATexto(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
}

function textoAFecha(texto: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const fecha = new Date(anio, mes - 1, dia, 12);
  if (
    fecha.getFullYear() !== anio ||
    fecha.getMonth() !== mes - 1 ||
    fecha.getDate() !== dia
  ) {
    return null;
  }
  return fecha.toISOString();
}

interface FormaGasto {
  abierto: boolean;
  editar: Gasto | null;
  categoria: CategoriaGasto;
  concepto: string;
  monto: string;
  fecha: string;
  formaPago: string;
  guardando: boolean;
}

export default function RentabilidadScreen({
  esPestania = false,
}: {
  esPestania?: boolean;
}) {
  const db = useSQLiteContext();
  const { colores } = useTema();
  const navigation = useNavigation<NavigationProp<ParamListRaiz & ParamListTabs>>();
  const usuario = useSesion((s) => s.usuario);
  const pendientes = useSync((s) => s.pendientes);
  const mostrarAviso = useAvisos((s) => s.mostrar);

  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const [personalizado, setPersonalizado] = useState(() => ({
    desde: inicioDiaISO(),
    hasta: finDiaISO(),
  }));
  const [desdeTexto, setDesdeTexto] = useState(() => fechaATexto(inicioDiaISO()));
  const [hastaTexto, setHastaTexto] = useState(() => fechaATexto(new Date().toISOString()));
  const [reporte, setReporte] = useState<ReporteRentabilidadLocal | null>(null);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [cargando, setCargando] = useState(true);
  const [borrando, setBorrando] = useState<Gasto | null>(null);
  const [forma, setForma] = useState<FormaGasto>({
    abierto: false,
    editar: null,
    categoria: 'otros',
    concepto: '',
    monto: '',
    fecha: fechaATexto(new Date().toISOString()),
    formaPago: 'efectivo',
    guardando: false,
  });
  const [movimiento, setMovimiento] = useState({
    abierto: false,
    tipo: 'retiro' as TipoMovimientoCaja,
    monto: '',
    descripcion: '',
  });

  const rangos: Record<Exclude<Periodo, 'personalizado'>, () => [string, string]> = {
    hoy: () => [inicioDiaISO(), finDiaISO()],
    semana: () => [inicioSemanaISO(), finDiaISO()],
    mes: () => [inicioMesISO(), finDiaISO()],
    mes_anterior: () => [inicioMesAnteriorISO(), finMesAnteriorISO()],
  };
  const [desde, hasta] =
    periodo === 'personalizado'
      ? [personalizado.desde, personalizado.hasta]
      : rangos[periodo]();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [conf, datos] = await Promise.all([
        obtenerSettings(db),
        calcularRentabilidadLocal(db, desde, hasta),
      ]);
      setSettings(conf);
      setReporte(datos);
      setGastos(await listarGastos(db, datos.desde, datos.hasta));
      setMovimientos(
        await listarMovimientosCajaPorFecha(db, datos.desde, datos.hasta)
      );
    } catch {
      mostrarAviso('Error', 'No se pudo calcular la rentabilidad.');
    } finally {
      setCargando(false);
    }
  }, [db, desde, hasta, mostrarAviso]);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar])
  );

  function seleccionarPeriodo(id: Periodo) {
    if (id === 'personalizado') {
      setDesdeTexto(fechaATexto(desde));
      setHastaTexto(fechaATexto(hasta));
    }
    setPeriodo(id);
  }

  function aplicarPersonalizado() {
    const nuevoDesde = textoAFecha(desdeTexto);
    const nuevoHasta = textoAFecha(hastaTexto);
    if (!nuevoDesde || !nuevoHasta) {
      mostrarAviso('Fechas inválidas', 'Usa el formato AAAA-MM-DD.');
      return;
    }
    if (nuevoDesde >= nuevoHasta) {
      mostrarAviso('Rango inválido', 'La fecha final debe ser mayor que la inicial.');
      return;
    }
    setPersonalizado({ desde: nuevoDesde, hasta: nuevoHasta });
    setPeriodo('personalizado');
  }

  function abrirGasto(gasto: Gasto | null) {
    setForma({
      abierto: true,
      editar: gasto,
      categoria: gasto?.categoria ?? 'otros',
      concepto: gasto?.concepto ?? '',
      monto: gasto ? String(gasto.monto) : '',
      fecha: fechaATexto(gasto?.fecha ?? new Date().toISOString()),
      formaPago: gasto?.formaPago ?? 'efectivo',
      guardando: false,
    });
  }

  async function guardarGasto() {
    const concepto = forma.concepto.trim();
    const monto = parsearMonto(forma.monto);
    const fecha = textoAFecha(forma.fecha);
    if (!concepto || monto <= 0 || !fecha) {
      mostrarAviso('Datos incompletos', 'Revisa concepto, monto y fecha.');
      return;
    }
    setForma((f) => ({ ...f, guardando: true }));
    try {
      const turno = await turnoAbierto(db, usuario?.id ?? 0);
      const datos = {
        categoria: forma.categoria,
        concepto,
        monto,
        fecha,
        formaPago: forma.formaPago,
      };
      if (forma.editar) {
        await actualizarGasto(db, forma.editar.id, datos);
      } else {
        await crearGasto(db, {
          ...datos,
          turnoId: turno?.id ?? null,
          usuarioId: usuario?.id ?? null,
        });
      }
      setForma((f) => ({ ...f, abierto: false, guardando: false }));
      await cargar();
    } catch {
      setForma((f) => ({ ...f, guardando: false }));
      mostrarAviso('Error', 'No se pudo guardar el gasto.');
    }
  }

  async function confirmarBorrado() {
    if (!borrando) return;
    await eliminarGasto(db, borrando.id);
    setBorrando(null);
    await cargar();
  }

  async function guardarMovimiento() {
    const monto = parsearMonto(movimiento.monto);
    if (!(monto > 0) || !movimiento.descripcion.trim()) {
      mostrarAviso('Datos incompletos', 'Indica monto y descripción.');
      return;
    }
    const turno = await turnoAbierto(db, usuario?.id ?? 0);
    await crearMovimientoCaja(db, {
      turnoId: turno?.id ?? null,
      usuarioId: usuario?.id ?? null,
      tipo: movimiento.tipo,
      monto,
      descripcion: movimiento.descripcion,
    });
    setMovimiento({ abierto: false, tipo: 'retiro', monto: '', descripcion: '' });
    await cargar();
  }

  const simbolo = settings?.simboloMoneda ?? '$';
  const esAdmin = usuario?.rol === 'admin';
  const mensajeEstado: Record<ReporteRentabilidadLocal['estado'], string> = {
    sin_datos: 'Todavía no hay información para este período.',
    equilibrio: 'El negocio está en equilibrio.',
    ganancia: 'El negocio está generando ganancias.',
    perdida: 'El negocio está teniendo pérdidas.',
    parcial: 'Rentabilidad estimada: faltan costos en algunas ventas.',
  };

  if (!esAdmin) {
    return (
      <Pantalla>
        <Encabezado titulo="Rentabilidad" onAtras={() => navigation.goBack()} />
        <Superficie>
          <Tarjeta>
            <Text style={[styles.sinDatos, { color: colores.textoSuave }]}>
              Esta información solo está disponible para administradores.
            </Text>
          </Tarjeta>
        </Superficie>
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <Encabezado
        titulo="Rentabilidad"
        subtitulo="Lo que realmente gana tu negocio"
        onAtras={esPestania ? undefined : () => navigation.goBack()}
        derecha={
          <Pressable
            onPress={() => void cargar()}
            accessibilityLabel="Actualizar"
            style={styles.botonActualizar}
          >
            <MaterialIcons name="refresh" size={21} color={colores.primario} />
          </Pressable>
        }
      />
      <Superficie>
        <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false}>
          <View style={[styles.segmentado, { backgroundColor: colores.superficieSuave }]}>
            {PERIODOS.map((opcion) => (
              <Pressable
                key={opcion.id}
                onPress={() => seleccionarPeriodo(opcion.id)}
                style={[
                  styles.segmento,
                  periodo === opcion.id && {
                    backgroundColor: colores.superficie,
                    borderColor: colores.primario,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.segmentoTexto,
                    { color: periodo === opcion.id ? colores.primario : colores.textoSuave },
                  ]}
                >
                  {opcion.etiqueta}
                </Text>
              </Pressable>
            ))}
          </View>

          {esAdmin ? (
            <Boton
              titulo="Historial de cierres"
              icono="history"
              variante="fantasma"
              tamanio="sm"
              onPress={() => navigation.navigate('HistorialCierres')}
            />
          ) : null}

          {periodo === 'personalizado' ? (
            <Tarjeta>
              <View style={styles.rangoFila}>
                <View style={{ flex: 1 }}>
                  <Campo etiqueta="Desde" valor={desdeTexto} onChange={setDesdeTexto} teclado="numeric" maxLength={10} />
                </View>
                <View style={{ flex: 1 }}>
                  <Campo etiqueta="Hasta" valor={hastaTexto} onChange={setHastaTexto} teclado="numeric" maxLength={10} />
                </View>
              </View>
              <Boton titulo="Aplicar rango" icono="check" variante="secundario" tamanio="sm" onPress={aplicarPersonalizado} estilo={{ marginTop: spacing.sm }} />
            </Tarjeta>
          ) : null}

          {pendientes > 0 ? (
            <Tarjeta>
              <Text style={[styles.avisoTexto, { color: colores.textoSuave }]}>
                Hay {pendientes} operación(es) pendiente(s) de sincronizar. Los datos mostrados son los de este dispositivo.
              </Text>
            </Tarjeta>
          ) : null}

          {cargando && !reporte ? (
            <Tarjeta><EstadoCarga /></Tarjeta>
          ) : reporte ? (
            <>
              <Tarjeta>
                <Text style={[styles.etiqueta, { color: colores.textoSuave }]}>Ganancia neta estimada</Text>
                <Text
                  style={[
                    styles.cifraGrande,
                    { color: reporte.gananciaNeta < 0 ? colores.peligro : colores.texto },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatearDinero(reporte.gananciaNeta, simbolo)}
                </Text>
                <Text style={[styles.tarjetaSub, { color: colores.textoSuave }]}>
                  {mensajeEstado[reporte.estado]}
                </Text>
              </Tarjeta>

              <Tarjeta>
                <FilaResumen etiqueta="Ventas netas" valor={formatearDinero(reporte.ventas.total, simbolo)} colores={colores} />
                <FilaResumen etiqueta="Costo de productos vendidos" valor={formatearDinero(reporte.costoVentas, simbolo)} colores={colores} />
                <FilaResumen etiqueta="Gastos operativos" valor={formatearDinero(reporte.gastos.total, simbolo)} colores={colores} />
                <FilaResumen etiqueta="Margen neto" valor={reporte.margenPct === null ? '—' : `${reporte.margenPct.toFixed(1)}%`} colores={colores} destacado />
              </Tarjeta>

              {reporte.lineasSinCosto > 0 ? (
                <Tarjeta>
                  <View style={styles.avisoFila}>
                    <MaterialIcons name="info-outline" size={20} color={colores.advertencia} />
                    <Text style={[styles.avisoTexto, { color: colores.texto }]}>
                      {reporte.lineasSinCosto} línea(s) sin costo. Afecta {reporte.ventasSinCosto} venta(s). La ganancia es parcial.
                    </Text>
                  </View>
                </Tarjeta>
              ) : null}

              <Tarjeta>
                <View style={styles.tarjetaCabecera}>
                  <Text style={[styles.tarjetaTitulo, { color: colores.texto }]}>¿Qué te deja más dinero?</Text>
                  <MaterialIcons name="trending-up" size={19} color={colores.primario} />
                </View>
                {reporte.ranking.length === 0 ? (
                  <Text style={[styles.sinDatos, { color: colores.textoSuave }]}>Sin ventas en este período</Text>
                ) : (
                  reporte.ranking.map((producto, indice) => (
                    <View
                      key={`${producto.productoId ?? producto.nombre}-${indice}`}
                      style={[
                        styles.rankingFila,
                        indice > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colores.borde },
                      ]}
                    >
                      <View style={[styles.rankingNumero, { backgroundColor: colores.superficieSuave }]}>
                        <Text style={{ color: colores.primario, fontFamily: fuentes.bold, fontSize: 12 }}>{indice + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rankingNombre, { color: colores.texto }]} numberOfLines={1}>{producto.nombre}</Text>
                        <Text style={[styles.rankingDetalle, { color: colores.textoSuave }]}>
                          {producto.cantidad} uds. · ingresos {formatearDinero(producto.ventas, simbolo)} · costo {formatearDinero(producto.costo, simbolo)}
                        </Text>
                      </View>
                      <View style={styles.rankingDerecha}>
                        <Text style={[styles.rankingGanancia, { color: producto.ganancia < 0 ? colores.peligro : colores.exito }]}>
                          {formatearDinero(producto.ganancia, simbolo)}
                        </Text>
                        <Text style={[styles.rankingDetalle, { color: colores.textoSuave }]}>
                          {producto.sinCosto || producto.margenPct === null ? 'coste —' : `${producto.margenPct.toFixed(1)}%`}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </Tarjeta>
            </>
          ) : (
            <Tarjeta>
              <Text style={[styles.sinDatos, { color: colores.textoSuave }]}>No hay datos para este período.</Text>
            </Tarjeta>
          )}

          <Tarjeta>
            <View style={styles.tarjetaCabecera}>
              <View>
                <Text style={[styles.tarjetaTitulo, { color: colores.texto }]}>Gastos</Text>
                <Text style={[styles.tarjetaSub, { color: colores.textoSuave }]}>
                  {formatearDinero(reporte?.gastos.total ?? 0, simbolo)} en el período
                </Text>
              </View>
              <Boton titulo="Añadir" icono="add" variante="primario" tamanio="sm" onPress={() => abrirGasto(null)} />
            </View>
            {gastos.length === 0 ? (
              <Text style={[styles.sinDatos, { color: colores.textoSuave }]}>Sin gastos registrados</Text>
            ) : (
              gastos.map((gasto, indice) => (
                <View
                  key={gasto.uuid}
                  style={[
                    styles.gastoFila,
                    indice > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colores.borde },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.gastoConcepto, { color: colores.texto }]} numberOfLines={1}>{gasto.concepto}</Text>
                    <Text style={[styles.gastoDetalle, { color: colores.textoSuave }]}>
                      {ETIQUETAS_CATEGORIA[gasto.categoria]} · {NOMBRES_FORMA_PAGO[gasto.formaPago as keyof typeof NOMBRES_FORMA_PAGO] ?? gasto.formaPago} · {formatoFechaCorta(gasto.fecha)}
                    </Text>
                  </View>
                  <Text style={[styles.gastoMonto, { color: colores.texto }]}>{formatearDinero(gasto.monto, simbolo)}</Text>
                  <Pressable onPress={() => abrirGasto(gasto)} accessibilityLabel="Editar gasto" style={styles.iconoAccion}>
                    <MaterialIcons name="edit" size={18} color={colores.textoSuave} />
                  </Pressable>
                  <Pressable onPress={() => setBorrando(gasto)} accessibilityLabel="Eliminar gasto" style={styles.iconoAccion}>
                    <MaterialIcons name="delete-outline" size={18} color={colores.peligro} />
                  </Pressable>
                </View>
              ))
            )}
          </Tarjeta>

          <Tarjeta>
            <View style={styles.tarjetaCabecera}>
              <View>
                <Text style={[styles.tarjetaTitulo, { color: colores.texto }]}>Movimientos de caja</Text>
                <Text style={[styles.tarjetaSub, { color: colores.textoSuave }]}>
                  Entradas y retiros: solo afectan a rentabilidad, no al cierre.
                </Text>
              </View>
              <Boton
                titulo="Añadir"
                icono="add"
                variante="secundario"
                tamanio="sm"
                onPress={() => setMovimiento((m) => ({ ...m, abierto: true }))}
              />
            </View>
            {movimientos.length === 0 ? (
              <Text style={[styles.sinDatos, { color: colores.textoSuave }]}>Sin movimientos registrados</Text>
            ) : (
              movimientos.map((mov, indice) => (
                <View
                  key={mov.uuid}
                  style={[
                    styles.gastoFila,
                    indice > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colores.borde },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.gastoConcepto, { color: colores.texto }]} numberOfLines={1}>
                      {ETIQUETAS_MOVIMIENTO[mov.tipo]}
                    </Text>
                    <Text style={[styles.gastoDetalle, { color: colores.textoSuave }]}>{mov.descripcion}</Text>
                  </View>
                  <Text style={[styles.gastoMonto, { color: colores.texto }]}>
                    {mov.tipo === 'entrada' ? '+' : '−'}{formatearDinero(mov.monto, simbolo)}
                  </Text>
                  <Pressable
                    onPress={() => void eliminarMovimientoCaja(db, mov.id).then(cargar)}
                    accessibilityLabel="Eliminar movimiento"
                    style={styles.iconoAccion}
                  >
                    <MaterialIcons name="delete-outline" size={18} color={colores.peligro} />
                  </Pressable>
                </View>
              ))
            )}
          </Tarjeta>
        </ScrollView>
      </Superficie>

      <Hoja
        visible={movimiento.abierto}
        onCerrar={() => setMovimiento((m) => ({ ...m, abierto: false }))}
        titulo="Movimiento de caja"
        subtitulo="Solo para rentabilidad; no modifica el cierre del día."
        pie={<Boton titulo="Guardar movimiento" icono="save" onPress={() => void guardarMovimiento()} />}
      >
        <Text style={[styles.etiqueta, { color: colores.textoSuave }]}>Tipo</Text>
        <View style={styles.categoriasChips}>
          {(['entrada', 'retiro', 'otra_salida'] as TipoMovimientoCaja[]).map((tipo) => (
            <Chip
              key={tipo}
              etiqueta={ETIQUETAS_MOVIMIENTO[tipo]}
              activo={movimiento.tipo === tipo}
              onPress={() => setMovimiento((m) => ({ ...m, tipo }))}
            />
          ))}
        </View>
        <Campo
          etiqueta="Monto"
          valor={movimiento.monto}
          onChange={(t) => setMovimiento((m) => ({ ...m, monto: t }))}
          teclado="numeric"
          sufijo={simbolo}
        />
        <Campo
          etiqueta="Descripción"
          valor={movimiento.descripcion}
          onChange={(t) => setMovimiento((m) => ({ ...m, descripcion: t }))}
          placeholder="Motivo del movimiento"
          maxLength={140}
        />
      </Hoja>

      <Hoja
        visible={forma.abierto}
        onCerrar={() => setForma((f) => ({ ...f, abierto: false }))}
        titulo={forma.editar ? 'Editar gasto' : 'Nuevo gasto'}
        subtitulo="Si se paga en efectivo, sale automáticamente de la caja."
        pie={
          <Boton
            titulo={forma.editar ? 'Guardar cambios' : 'Guardar gasto'}
            icono="save"
            onPress={() => void guardarGasto()}
            cargando={forma.guardando}
          />
        }
      >
        <Text style={[styles.etiqueta, { color: colores.textoSuave }]}>Categoría</Text>
        <View style={styles.categoriasChips}>
          {CATEGORIAS_GASTO.map((categoria) => (
            <Chip
              key={categoria}
              etiqueta={ETIQUETAS_CATEGORIA[categoria]}
              activo={forma.categoria === categoria}
              onPress={() => setForma((f) => ({ ...f, categoria }))}
            />
          ))}
        </View>
        <Campo etiqueta="Concepto" valor={forma.concepto} onChange={(t) => setForma((f) => ({ ...f, concepto: t }))} placeholder="Ej.: Combustible" icono="description" maxLength={120} />
        <View style={styles.rangoFila}>
          <View style={{ flex: 1 }}>
            <Campo etiqueta="Monto" valor={forma.monto} onChange={(t) => setForma((f) => ({ ...f, monto: t }))} teclado="numeric" placeholder="0.00" icono="payments" />
          </View>
          <View style={{ flex: 1 }}>
            <Campo etiqueta="Fecha" valor={forma.fecha} onChange={(t) => setForma((f) => ({ ...f, fecha: t }))} placeholder="AAAA-MM-DD" teclado="numeric" maxLength={10} />
          </View>
        </View>
        <Text style={[styles.etiqueta, { color: colores.textoSuave, marginTop: spacing.sm }]}>Forma de pago</Text>
        <View style={styles.categoriasChips}>
          {FORMAS_PAGO.map((formaPago) => (
            <Chip
              key={formaPago}
              etiqueta={NOMBRES_FORMA_PAGO[formaPago]}
              activo={forma.formaPago === formaPago}
              onPress={() => setForma((f) => ({ ...f, formaPago }))}
            />
          ))}
        </View>
      </Hoja>

      <ConfirmarModal
        visible={borrando !== null}
        onCerrar={() => setBorrando(null)}
        onConfirmar={() => void confirmarBorrado()}
        titulo="Eliminar gasto"
        mensaje={`¿Eliminar "${borrando?.concepto ?? ''}"?`}
        textoConfirmar="Eliminar"
        peligro
      />
    </Pantalla>
  );
}

function FilaResumen({
  etiqueta,
  valor,
  colores,
  destacado,
}: {
  etiqueta: string;
  valor: string;
  colores: PaletaColores;
  destacado?: boolean;
}) {
  return (
    <View
      style={[
        styles.resumenFila,
        destacado && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colores.borde,
          marginTop: spacing.xs,
          paddingTop: spacing.sm,
        },
      ]}
    >
      <Text style={[styles.resumenEtiqueta, { color: colores.textoSuave }]}>{etiqueta}</Text>
      <Text style={[styles.resumenValor, { color: colores.texto, fontFamily: destacado ? fuentes.bold : fuentes.semibold }]}>
        {valor}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  segmentado: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: radius.lg, padding: 4, gap: 3 },
  segmento: { paddingHorizontal: spacing.sm, paddingVertical: 8, alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: 'transparent' },
  segmentoTexto: { fontFamily: fuentes.semibold, fontSize: typography.cuerpoChico },
  rangoFila: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  botonActualizar: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
  etiqueta: { fontSize: typography.cuerpoChico, fontFamily: fuentes.medium },
  cifraGrande: { fontSize: 33, fontFamily: fuentes.display, letterSpacing: -1, marginTop: 3, fontVariant: ['tabular-nums'] },
  tarjetaSub: { fontSize: typography.cuerpoChico, fontFamily: fuentes.regular, marginTop: 3 },
  tarjetaTitulo: { fontSize: typography.destacado, fontFamily: fuentes.display, letterSpacing: -0.3 },
  tarjetaCabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.sm },
  resumenFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 },
  resumenEtiqueta: { fontSize: typography.cuerpo, fontFamily: fuentes.regular },
  resumenValor: { fontSize: typography.cuerpo, fontVariant: ['tabular-nums'] },
  avisoFila: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  avisoTexto: { flex: 1, fontSize: typography.cuerpoChico, fontFamily: fuentes.regular },
  rankingFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10 },
  rankingNumero: { width: 28, height: 28, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  rankingNombre: { fontSize: typography.cuerpo, fontFamily: fuentes.semibold },
  rankingDetalle: { fontSize: typography.micro, fontFamily: fuentes.regular, marginTop: 2 },
  rankingDerecha: { alignItems: 'flex-end' },
  rankingGanancia: { fontSize: typography.cuerpo, fontFamily: fuentes.bold, fontVariant: ['tabular-nums'] },
  categoriasChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  gastoFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10 },
  gastoConcepto: { fontSize: typography.cuerpo, fontFamily: fuentes.semibold },
  gastoDetalle: { fontSize: typography.micro, fontFamily: fuentes.regular, marginTop: 2 },
  gastoMonto: { fontSize: typography.cuerpoChico, fontFamily: fuentes.bold, fontVariant: ['tabular-nums'] },
  iconoAccion: { padding: 4 },
  sinDatos: { fontSize: typography.cuerpo, fontFamily: fuentes.regular, textAlign: 'center', paddingVertical: spacing.md },
});
