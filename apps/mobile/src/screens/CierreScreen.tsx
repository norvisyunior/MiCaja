import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  calcularResumenCierre,
  guardarConteo,
  aplicarDiferenciasInventario,
  type ResumenCierre,
} from '../db/repos/cierre';
import {
  cerrarTurno,
  turnoAbierto,
  turnoAbiertoOCrear,
} from '../db/repos/turnos';
import { obtenerSettings } from '../db/repos/settings';
import { listarProductos } from '../db/repos/catalogo';
import { evaluarBloqueoOperativo } from '../licencias/verificar';
import type { TurnoCaja } from '../types';
import { useAvisos } from '../store/avisos';
import { useSesion } from '../store/sesion';
import { useSync } from '../store/sync';
import { useTema } from '../store/tema';
import {
  Boton,
  Campo,
  Encabezado,
  EstadoCarga,
  Exito,
  Hoja,
  Pantalla,
  Superficie,
  Tarjeta,
  TarjetaAviso,
  parsearMonto,
} from '../components/UI';
import { fuentes, radius, spacing, typography } from '../theme';
import { formatearDinero } from '../utils/fechas';
import { NOMBRES_FORMA_PAGO } from '../utils/calculos';
import { pedirSyncAhora } from '../sync/disparador';
import type { ParamListRaiz, ParamListTabs } from '../navigation';

type Paso = 1 | 2 | 3 | 4;

export default function CierreScreen({
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

  const [turno, setTurno] = useState<TurnoCaja | null>(null);
  const [productos, setProductos] = useState<{ id: number; nombre: string; stock: number }[]>([]);
  const [resumen, setResumen] = useState<ResumenCierre | null>(null);
  const [simbolo, setSimbolo] = useState('$');
  const [cargando, setCargando] = useState(true);
  const [paso, setPaso] = useState<Paso>(1);
  const [fondoTexto, setFondoTexto] = useState('');
  const [contadoTexto, setContadoTexto] = useState('0');
  const [observacion, setObservacion] = useState('');
  const [aplicarAjustes, setAplicarAjustes] = useState(false);
  const [resultado, setResultado] = useState<TurnoCaja | null>(null);
  const [listoParaVender, setListoParaVender] = useState(false);
  const [conteos, setConteos] = useState<Record<number, string>>({});
  const [motivos, setMotivos] = useState<Record<number, string>>({});
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [t, conf, prods] = await Promise.all([
        turnoAbierto(db, usuario?.id ?? 0),
        obtenerSettings(db),
        listarProductos(db),
      ]);
      setTurno(t);
      setProductos(prods.map((p) => ({ id: p.id, nombre: p.nombre, stock: p.stock })));
      setSimbolo(conf.simboloMoneda ?? '$');
      setResumen(t ? await calcularResumenCierre(db, t.id) : null);
      setContadoTexto(String(t ? (await calcularResumenCierre(db, t.id)).efectivoEsperado : 0));
      setConteos({});
      setMotivos({});
      setPaso(1);
      setAplicarAjustes(false);
      setObservacion('');
    } finally {
      setCargando(false);
    }
  }, [db, usuario?.id]);

  useFocusEffect(
    useCallback(() => {
      void cargar().catch(() => setCargando(false));
    }, [cargar])
  );

  async function abrirCaja() {
    const texto = fondoTexto.trim();
    if (texto === '') {
      mostrarAviso('Falta el efectivo inicial', 'Indica con cuánto dinero en efectivo abres el día.');
      return;
    }
    const fondo = parsearMonto(texto);
    if (fondo < 0) {
      mostrarAviso('Efectivo inválido', 'No puede ser negativo.');
      return;
    }
    const bloqueo = await evaluarBloqueoOperativo(db);
    if (bloqueo) {
      mostrarAviso(bloqueo.titulo, bloqueo.mensaje);
      return;
    }
    await turnoAbiertoOCrear(db, usuario?.id ?? 0, new Date(), fondo);
    setListoParaVender(true);
    await cargar();
    pedirSyncAhora();
  }

  async function guardarConteoProducto(productoId: number, sistema: number) {
    if (!turno) return;
    const contada = parsearMonto(conteos[productoId] ?? String(sistema));
    if (contada < 0) {
      mostrarAviso('Cantidad inválida', 'La existencia no puede ser negativa.');
      return;
    }
    await guardarConteo(db, {
      turnoId: turno.id,
      productoId,
      cantidadSistema: sistema,
      cantidadContada: contada,
      motivo: motivos[productoId],
      usuarioId: usuario?.id ?? 0,
    });
    await cargar();
  }

  async function confirmarCierre() {
    if (!turno || !resumen || guardando) return;
    const bloqueo = await evaluarBloqueoOperativo(db);
    if (bloqueo) {
      mostrarAviso(bloqueo.titulo, bloqueo.mensaje);
      return;
    }
    setGuardando(true);
    try {
      if (aplicarAjustes) {
        await aplicarDiferenciasInventario(db, turno.id, usuario?.id ?? 0);
      }
      const cerrado = await cerrarTurno(
        db,
        turno.id,
        parsearMonto(contadoTexto),
        new Date().toISOString(),
        {
          cantidadVentas: resumen.cantidadVentas,
          totalVendido: resumen.totalVendido,
          efectivoEsperado: resumen.efectivoEsperado,
          desglose: resumen.desglose,
        },
        observacion.trim() || null
      );
      setResultado(cerrado);
      setTurno(null);
      pedirSyncAhora();
      await cargar();
    } catch {
      mostrarAviso('Error', 'No se pudo confirmar el cierre.');
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return (
      <Pantalla>
        <Encabezado titulo="Cierre del día" onAtras={() => navigation.goBack()} />
        <Superficie><EstadoCarga mensaje="Cargando caja…" /></Superficie>
      </Pantalla>
    );
  }

  const diferencia = resumen
    ? parsearMonto(contadoTexto) - resumen.efectivoEsperado
    : 0;

  return (
    <Pantalla>
      <Encabezado
        titulo="Cierre del día"
        subtitulo={turno ? 'Asistente de cierre' : 'Historial de cierres'}
        onAtras={esPestania ? undefined : () => navigation.goBack()}
      />
      <Superficie>
        <ScrollView contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false}>
          {pendientes > 0 ? (
            <Tarjeta>
              <Text style={[styles.nota, { color: colores.textoSuave }]}>
                Hay {pendientes} operación(es) pendiente(s) de sincronizar. El cierre se guardará localmente y se subirá después.
              </Text>
            </Tarjeta>
          ) : null}

          {!turno ? (
            <>
              <Tarjeta>
                <Text style={[styles.titulo, { color: colores.texto }]}>Caja cerrada</Text>
                <Text style={[styles.nota, { color: colores.textoSuave }]}>
                  Indica el efectivo con el que abres la caja para comenzar la jornada.
                </Text>
                <Campo
                  etiqueta="Efectivo inicial"
                  valor={fondoTexto}
                  onChange={setFondoTexto}
                  teclado="numeric"
                  sufijo={simbolo}
                />
                <Text style={[styles.titulo, { color: colores.texto, marginTop: spacing.md }]}>
                  Inventario con el que abres el día
                </Text>
                {productos.length === 0 ? (
                  <Text style={[styles.nota, { color: colores.textoSuave }]}>No hay productos registrados.</Text>
                ) : (
                  productos.map((producto) => (
                    <View key={producto.id} style={styles.fila}>
                      <Text style={[styles.nota, { color: colores.texto, flex: 1 }]}>{producto.nombre}</Text>
                      <Text style={[styles.monto, { color: colores.texto }]}>{producto.stock} uds.</Text>
                    </View>
                  ))
                )}
                <Boton titulo="Abrir caja" icono="lock-open" onPress={() => void abrirCaja()} estilo={{ marginTop: spacing.md }} />
              </Tarjeta>
            </>
          ) : resumen ? (
            <>
              <View style={[styles.pasos, { backgroundColor: colores.superficieSuave }]}>
                {([1, 2, 3, 4] as Paso[]).map((p) => (
                  <Boton
                    key={p}
                    titulo={['Efectivo', 'Ventas', 'Inventario', 'Revisar'][p - 1]}
                    variante={paso === p ? 'primario' : 'fantasma'}
                    tamanio="sm"
                    onPress={() => setPaso(p)}
                    estilo={{ flex: 1 }}
                  />
                ))}
              </View>

              {paso === 1 ? (
                <Tarjeta>
                  <Text style={[styles.titulo, { color: colores.texto }]}>Efectivo en caja</Text>
                  <Fila etiqueta="Efectivo inicial" valor={formatearDinero(resumen.fondoInicial, simbolo)} />
                  <Fila etiqueta="Ventas cobradas en efectivo" valor={formatearDinero(resumen.ventasEfectivo, simbolo)} />
                  {resumen.pagos
                    .filter((p) => p.formaPago !== 'efectivo')
                    .map((p) => (
                      <Fila
                        key={p.formaPago}
                        etiqueta={`Ventas por ${NOMBRES_FORMA_PAGO[p.formaPago] ?? p.formaPago}`}
                        valor={formatearDinero(p.total, simbolo)}
                      />
                    ))}
                  <Fila
                    etiqueta="Total transferencias y otros métodos"
                    valor={formatearDinero(resumen.desglose.digital_total ?? 0, simbolo)}
                  />
                  <Fila etiqueta="Devoluciones en efectivo" valor={`− ${formatearDinero(resumen.devolucionesEfectivo, simbolo)}`} />
                  <Fila etiqueta="Efectivo esperado" valor={formatearDinero(resumen.efectivoEsperado, simbolo)} destacado />
                  <Text style={[styles.detalle, { color: colores.textoSuave, marginBottom: spacing.sm }]}>
                    Las transferencias y otros métodos no se cuentan como efectivo físico.
                  </Text>

                  <Campo etiqueta="Efectivo contado" valor={contadoTexto} onChange={setContadoTexto} teclado="numeric" sufijo={simbolo} />
                  <TarjetaAviso
                    icono={diferencia === 0 ? 'check-circle' : 'warning'}
                    titulo={diferencia === 0 ? 'El dinero coincide' : diferencia > 0 ? 'Sobra dinero' : 'Falta dinero'}
                    destacado={`${diferencia > 0 ? '+' : ''}${formatearDinero(diferencia, simbolo)}`}
                    mensaje="No se modifica el esperado para ocultar la diferencia."
                    tono={diferencia === 0 ? 'exito' : 'advertencia'}
                  />
                  <Campo etiqueta="Observación (opcional)" valor={observacion} onChange={setObservacion} placeholder="Explica la diferencia" multiline />
                  <Boton titulo="Continuar a ventas" icono="arrow-forward" onPress={() => setPaso(2)} estilo={{ marginTop: spacing.sm }} />
                </Tarjeta>
              ) : null}

              {paso === 2 ? (
                <Tarjeta>
                  <Text style={[styles.titulo, { color: colores.texto }]}>Resumen de ventas</Text>
                  <Fila etiqueta="Total vendido" valor={formatearDinero(resumen.totalVendido, simbolo)} destacado />
                  <Fila etiqueta="Cantidad de ventas" valor={String(resumen.cantidadVentas)} />
                  <Fila etiqueta="Anulaciones / devoluciones" valor={String(resumen.anulaciones)} />
                  <Fila etiqueta="Reembolso en efectivo" valor={formatearDinero(resumen.devolucionesEfectivo, simbolo)} />
                  <Fila etiqueta="Reembolso digital" valor={formatearDinero(resumen.devolucionesDigital, simbolo)} />
                  {resumen.pagos.map((p) => (
                    <Fila
                      key={p.formaPago}
                      etiqueta={NOMBRES_FORMA_PAGO[p.formaPago] ?? p.formaPago}
                      valor={formatearDinero(p.total, simbolo)}
                    />
                  ))}
                  <Boton titulo="Continuar a inventario" icono="arrow-forward" onPress={() => setPaso(3)} estilo={{ marginTop: spacing.sm }} />
                  <Boton titulo="Volver a efectivo" icono="arrow-back" variante="fantasma" onPress={() => setPaso(1)} estilo={{ marginTop: spacing.xs }} />
                </Tarjeta>
              ) : null}

              {paso === 3 ? (
                <Tarjeta>
                  <Text style={[styles.titulo, { color: colores.texto }]}>Inventario al cierre</Text>
                  <Text style={[styles.nota, { color: colores.textoSuave }]}>
                    El conteo físico es opcional. Solo escribe la cantidad si quieres verificar un producto.
                  </Text>
                  {resumen.inventario.map((p) => {
                    const conteo = resumen.conteos.find((c) => c.productoId === p.productoId);
                    const contado = conteos[p.productoId] ?? (conteo ? String(conteo.cantidadContada) : '');
                    const diferenciaInv = contado === '' ? 0 : parsearMonto(contado) - p.final;
                    return (
                      <View key={p.productoId} style={styles.productoFila}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.nota, { color: colores.texto }]}>{p.nombre}</Text>
                          <Text style={[styles.detalle, { color: colores.textoSuave }]}>
                            Inicial {p.inicial} · +{p.entradas} · −{p.salidas} · final {p.final}
                          </Text>
                          {diferenciaInv !== 0 ? (
                            <Text style={[styles.detalle, { color: diferenciaInv > 0 ? colores.exito : colores.peligro }]}>
                              Diferencia: {diferenciaInv > 0 ? '+' : ''}{diferenciaInv}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.conteoCampo}>
                          <Campo
                            valor={contado}
                            onChange={(t) => setConteos((c) => ({ ...c, [p.productoId]: t }))}
                            placeholder="Contado"
                            teclado="numeric"
                          />
                        </View>
                        {contado !== '' ? (
                          <Boton
                            titulo="Guardar"
                            tamanio="sm"
                            variante="suave"
                            onPress={() => void guardarConteoProducto(p.productoId, p.final)}
                          />
                        ) : null}
                      </View>
                    );
                  })}
                  <View style={styles.ajusteFila}>
                    <Text style={[styles.nota, { color: colores.texto, flex: 1 }]}>Aplicar diferencias al inventario al confirmar</Text>
                    <Switch value={aplicarAjustes} onValueChange={setAplicarAjustes} />
                  </View>
                  <Boton titulo="Continuar a revisión" icono="arrow-forward" onPress={() => setPaso(4)} estilo={{ marginTop: spacing.sm }} />
                  <Boton titulo="Volver a ventas" icono="arrow-back" variante="fantasma" onPress={() => setPaso(2)} estilo={{ marginTop: spacing.xs }} />
                </Tarjeta>
              ) : null}

              {paso === 4 ? (
                <Tarjeta>
                  <Text style={[styles.titulo, { color: colores.texto }]}>Revisión final</Text>
                  <Fila etiqueta="Efectivo esperado" valor={formatearDinero(resumen.efectivoEsperado, simbolo)} />
                  <Fila etiqueta="Efectivo contado" valor={formatearDinero(parsearMonto(contadoTexto), simbolo)} />
                  <Fila etiqueta="Diferencia" valor={`${diferencia > 0 ? '+' : ''}${formatearDinero(diferencia, simbolo)}`} destacado />
                  <Fila etiqueta="Ventas" valor={`${resumen.cantidadVentas} · ${formatearDinero(resumen.totalVendido, simbolo)}`} />
                  <Fila etiqueta="Cobrado en efectivo" valor={formatearDinero(resumen.ventasEfectivo, simbolo)} />
                  {resumen.pagos
                    .filter((p) => p.formaPago !== 'efectivo')
                    .map((p) => (
                      <Fila
                        key={p.formaPago}
                        etiqueta={NOMBRES_FORMA_PAGO[p.formaPago] ?? p.formaPago}
                        valor={formatearDinero(p.total, simbolo)}
                      />
                    ))}
                  <Fila etiqueta="Conteos registrados" valor={String(resumen.conteos.length)} />
                  <Boton titulo="Confirmar cierre" icono="lock" cargando={guardando} onPress={() => void confirmarCierre()} estilo={{ marginTop: spacing.md }} />
                  <Boton titulo="Revisar efectivo" icono="arrow-back" variante="fantasma" onPress={() => setPaso(1)} estilo={{ marginTop: spacing.xs }} />
                </Tarjeta>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </Superficie>

      <Hoja
        visible={listoParaVender}
        onCerrar={() => setListoParaVender(false)}
        titulo="Día listo para comenzar a vender"
        subtitulo="La caja está abierta con el efectivo inicial indicado."
      >
        <Exito
          titulo="Caja abierta"
          mensaje="Ya puedes registrar ventas. Al finalizar el día, vuelve aquí para hacer el cierre."
        />
        <Boton
          titulo="Nueva venta"
          icono="shopping-cart"
          onPress={() => {
            setListoParaVender(false);
            navigation.navigate('Vender');
          }}
          estilo={{ marginTop: spacing.md }}
        />
        <Boton
          titulo="Quedarse aquí"
          icono="check"
          variante="fantasma"
          onPress={() => setListoParaVender(false)}
          estilo={{ marginTop: spacing.xs }}
        />
      </Hoja>

      <Hoja visible={resultado !== null} onCerrar={() => setResultado(null)} titulo="Cierre confirmado">
        {resultado ? (
          <>
            <Exito titulo="Jornada cerrada" mensaje="El cierre quedó guardado y se sincronizará automáticamente." />
            <Fila etiqueta="Efectivo esperado" valor={formatearDinero(resultado.efectivoEsperado, simbolo)} />
            <Fila etiqueta="Efectivo contado" valor={formatearDinero(resultado.dineroReal ?? 0, simbolo)} />
            <Fila etiqueta="Diferencia" valor={formatearDinero(resultado.diferencia ?? 0, simbolo)} destacado />
            <Boton titulo="Listo" onPress={() => setResultado(null)} estilo={{ marginTop: spacing.lg }} />
          </>
        ) : null}
      </Hoja>

    </Pantalla>
  );
}

function Fila({
  etiqueta,
  valor,
  destacado,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}) {
  const { colores } = useTema();
  return (
    <View
      style={[
        styles.fila,
        destacado && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colores.borde, marginTop: spacing.xs, paddingTop: spacing.sm },
      ]}
    >
      <Text style={[styles.nota, { color: colores.textoSuave }]}>{etiqueta}</Text>
      <Text style={[styles.monto, { color: colores.texto, fontFamily: destacado ? fuentes.bold : fuentes.semibold }]}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  contenido: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  pasos: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.lg },
  titulo: { fontSize: typography.destacado, fontFamily: fuentes.display },
  nota: { fontSize: typography.cuerpoChico, fontFamily: fuentes.regular },
  detalle: { fontSize: typography.micro, fontFamily: fuentes.regular, marginTop: 2 },
  etiqueta: { fontSize: typography.cuerpoChico, fontFamily: fuentes.medium },
  fila: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 6 },
  monto: { fontSize: typography.cuerpoChico, fontFamily: fuentes.semibold, fontVariant: ['tabular-nums'] },
  movimientoFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },
  productoFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },
  conteoCampo: { width: 84 },
  ajusteFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  tipos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
});
