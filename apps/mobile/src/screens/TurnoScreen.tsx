import { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { TurnoCaja } from '../types';
import { cerrarTurno, listarTurnos, turnoAbierto, turnoAbiertoOCrear } from '../db/repos/turnos';
import { resumenVentasTurno, type ResumenVentasTurno } from '../db/repos/ventas';
import { evaluarBloqueoOperativo } from '../licencias/verificar';
import { AvisoLicencia } from '../components/AvisoLicencia';
import { obtenerSettings } from '../db/repos/settings';
import { useSesion } from '../store/sesion';
import { useAvisos } from '../store/avisos';
import { useTema } from '../store/tema';
import { formatearDinero, formatoFechaCorta, formatoHora } from '../utils/fechas';
import type { ParamListRaiz, ParamListTabs } from '../navigation';
import {
  Badge,
  Boton,
  Campo,
  Encabezado,
  EstadoCarga,
  Exito,
  Hoja,
  ListaVacia,
  Pantalla,
  parsearMonto,
  Sello,
  Superficie,
  Tarjeta,
  TarjetaAviso,
} from '../components/UI';
import { fuentes, radius, spacing, typography } from '../theme';

export default function TurnoScreen() {
  const db = useSQLiteContext();
  const usuario = useSesion((s) => s.usuario)!;
  const { colores } = useTema();
  const navigation = useNavigation<NavigationProp<ParamListRaiz & ParamListTabs>>();
  const mostrarAviso = useAvisos((s) => s.mostrar);

  const [turno, setTurno] = useState<TurnoCaja | null>(null);
  const [resumen, setResumen] = useState<ResumenVentasTurno | null>(null);
  const [historial, setHistorial] = useState<TurnoCaja[]>([]);
  const [simbolo, setSimbolo] = useState('$');
  const [cargando, setCargando] = useState(true);

  const [arqueando, setArqueando] = useState(false);
  const [dineroTexto, setDineroTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<TurnoCaja | null>(null);

  const cargar = useCallback(async () => {
    const t = await turnoAbierto(db, usuario.id);
    const [conf, hist] = await Promise.all([obtenerSettings(db), listarTurnos(db, 30)]);
    setSimbolo(conf.simboloMoneda);
    setHistorial(hist);
    setTurno(t);
    if (t) {
      setResumen(await resumenVentasTurno(db, t.id));
    } else {
      setResumen(null);
    }
    setCargando(false);
  }, [db, usuario.id]);

  useFocusEffect(
    useCallback(() => {
      cargar().catch(() => setCargando(false));
    }, [cargar])
  );

  async function abrirTurno() {
    const bloqueo = await evaluarBloqueoOperativo(db);
    if (bloqueo) {
      mostrarAviso(bloqueo.titulo, bloqueo.mensaje);
      return;
    }
    await turnoAbiertoOCrear(db, usuario.id, new Date());
    await cargar();
  }

  async function abrirArqueo() {
    setDineroTexto(String(resumen?.efectivo ?? 0));
    setArqueando(true);
  }

  async function confirmarCierre() {
    if (!turno || guardando) return;
    const bloqueo = await evaluarBloqueoOperativo(db);
    if (bloqueo) {
      mostrarAviso(bloqueo.titulo, bloqueo.mensaje);
      return;
    }
    const dineroReal = parsearMonto(dineroTexto);
    setGuardando(true);
    try {
      const res = await cerrarTurno(db, turno.id, dineroReal, new Date().toISOString());
      setArqueando(false);
      if (res) setResultado(res);
      await cargar();
    } catch {
      mostrarAviso('Error', 'No se pudo cerrar el turno.');
    } finally {
      setGuardando(false);
    }
  }

  const diferencia = turno ? parsearMonto(dineroTexto) - (resumen?.efectivo ?? 0) : 0;

  if (cargando) {
    return (
      <Pantalla>
        <Encabezado titulo="Cierre de día" onAtras={() => navigation.goBack()} />
        <Superficie>
          <EstadoCarga mensaje="Cargando turnos…" />
        </Superficie>
      </Pantalla>
    );
  }

  const cabecera = (
    <View style={{ gap: spacing.md }}>
      <AvisoLicencia />

      {turno ? (
        <Tarjeta>
          <View style={styles.turnoTop}>
            <View style={styles.turnoEstado}>
              <View style={[styles.turnoPunto, { backgroundColor: colores.exito }]} />
              <View>
                <Text style={[styles.turnoTitulo, { color: colores.texto }]}>Caja abierta</Text>
                <Text style={[styles.turnoHora, { color: colores.textoSuave }]}>
                  desde {formatoHora(turno.apertura)}
                </Text>
              </View>
            </View>
            <Sello texto="En curso" color={colores.exito} />
          </View>

          <View style={styles.resumenFilas}>
            <FilaResumen etiqueta="Ventas" valor={String(resumen?.ventas ?? 0)} />
            <FilaResumen
              icono="payments"
              etiqueta="Efectivo"
              valor={formatearDinero(resumen?.efectivo ?? 0, simbolo)}
            />
            <FilaResumen
              icono="credit-card"
              etiqueta="Tarjeta"
              valor={formatearDinero(resumen?.digital ?? 0, simbolo)}
            />
            <FilaResumen
              icono="payments"
              etiqueta="Otros"
              valor={formatearDinero(0, simbolo)}
            />
            <View style={[styles.totalFila, { borderTopColor: colores.borde }]}>
              <Text style={[styles.totalLabel, { color: colores.texto }]}>Total vendido</Text>
              <Text style={[styles.totalValor, { color: colores.texto }]}>
                {formatearDinero(resumen?.total ?? 0, simbolo)}
              </Text>
            </View>
          </View>

          <Boton
            titulo="Finalizar día"
            icono="lock-outline"
            tamanio="lg"
            onPress={abrirArqueo}
            estilo={{ marginTop: spacing.md }}
          />
          <Pressable
            onPress={() => navigation.navigate('Resumen')}
            style={styles.verReporte}
          >
            <Text style={[styles.verReporteTexto, { color: colores.primario }]}>Ver reporte</Text>
          </Pressable>
        </Tarjeta>
      ) : (
        <Tarjeta>
          <View style={styles.sinTurno}>
            <View style={[styles.sinTurnoIcono, { backgroundColor: colores.primarioSuave }]}>
              <MaterialIcons name="lock-clock" size={30} color={colores.primario} />
            </View>
            <Text style={[styles.sinTurnoTitulo, { color: colores.texto }]}>
              No hay turno abierto
            </Text>
            <Text style={[styles.sinTurnoSub, { color: colores.textoSuave }]}>
              Abre el turno antes de comenzar a vender para llevar el control de la caja.
            </Text>
            <Boton
              titulo="Abrir turno"
              icono="play-arrow"
              tamanio="lg"
              onPress={abrirTurno}
              estilo={{ marginTop: spacing.md, alignSelf: 'stretch' }}
            />
          </View>
        </Tarjeta>
      )}

      <Text style={[styles.historialTitulo, { color: colores.textoSuave }]}>Historial de turnos</Text>
    </View>
  );

  return (
    <Pantalla>
      <Encabezado titulo="Cierre de día" onAtras={() => navigation.goBack()} />
      <Superficie>

        <FlatList
          data={historial}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={styles.lista}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={cabecera}
          ListEmptyComponent={
            <ListaVacia emoji="📋" titulo="Sin turnos" subtitulo="Los turnos cerrados aparecerán aquí" />
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.filaTurno,
                { borderBottomColor: colores.borde },
                pressed && { backgroundColor: colores.superficieSuave },
              ]}
            >
              <View style={styles.filaTurnoFecha}>
                <Text style={[styles.filaTurnoDia, { color: colores.texto }]}>
                  {formatoFechaCorta(item.apertura)}
                </Text>
                <Text style={[styles.filaTurnoHora, { color: colores.textoSuave }]}>
                  {formatoHora(item.apertura)}
                  {item.cierre ? ` – ${formatoHora(item.cierre)}` : ''}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.filaTurnoVentas, { color: colores.texto }]}>
                  {item.ventasCount} venta(s)
                </Text>
                <Badge
                  texto={item.estado === 'abierto' ? 'Abierto' : 'Cerrado'}
                  color={item.estado === 'abierto' ? colores.exitoSuave : colores.superficieSuave}
                  colorTexto={item.estado === 'abierto' ? colores.exito : colores.textoSuave}
                />
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={[styles.filaTurnoTotal, { color: colores.texto }]}>
                  {formatearDinero(item.totalEsperado, simbolo)}
                </Text>
                {item.diferencia != null && item.diferencia !== 0 ? (
                  <Text
                    style={[
                      styles.filaTurnoDiferencia,
                      { color: item.diferencia < 0 ? colores.peligro : colores.advertencia },
                    ]}
                  >
                    {item.diferencia > 0 ? '+' : ''}
                    {formatearDinero(item.diferencia, simbolo)}
                  </Text>
                ) : (
                  <Text style={[styles.filaTurnoDiferencia, { color: colores.textoSuave }]}>
                    sin diferencia
                  </Text>
                )}
              </View>
            </Pressable>
          )}
        />

        <Hoja
          visible={arqueando}
          onCerrar={() => setArqueando(false)}
          titulo="Arqueo de caja"
          subtitulo="Cuenta el dinero y registra el resultado"
          pie={
            <View>
              <View style={styles.filaArqueo}>
                <Text style={[styles.textoArqueo, { color: colores.textoSuave }]}>Efectivo esperado</Text>
                <Text style={[styles.valorArqueo, { color: colores.texto }]}>
                  {formatearDinero(resumen?.efectivo ?? 0, simbolo)}
                </Text>
              </View>
              <View style={styles.filaArqueo}>
                <Text style={[styles.textoArqueo, { color: colores.textoSuave }]}>Diferencia</Text>
                <Text
                  style={[
                    styles.valorArqueo,
                    {
                      color:
                        diferencia === 0
                          ? colores.texto
                          : diferencia < 0
                            ? colores.peligro
                            : colores.advertencia,
                    },
                  ]}
                >
                  {diferencia > 0 ? '+' : ''}
                  {formatearDinero(diferencia, simbolo)}
                </Text>
              </View>
              <Boton
                titulo="Confirmar cierre"
                icono="lock"
                tamanio="lg"
                cargando={guardando}
                onPress={confirmarCierre}
              />
            </View>
          }
        >
          <View style={[styles.desglose, { borderColor: colores.borde }]}>
            <View style={styles.desgloseFila}>
              <MaterialIcons name="payments" size={20} color={colores.primario} />
              <Text style={[styles.desgloseLabel, { color: colores.textoSuave }]}>Efectivo esperado</Text>
              <Text style={[styles.desgloseValor, { color: colores.texto }]}>
                {formatearDinero(resumen?.efectivo ?? 0, simbolo)}
              </Text>
            </View>
            <View style={styles.desgloseFila}>
              <MaterialIcons name="smartphone" size={20} color={colores.info} />
              <Text style={[styles.desgloseLabel, { color: colores.textoSuave }]}>Tarjeta esperada</Text>
              <Text style={[styles.desgloseValor, { color: colores.texto }]}>
                {formatearDinero(resumen?.digital ?? 0, simbolo)}
              </Text>
            </View>
          </View>
          <Campo
            etiqueta="Dinero real contado"
            valor={dineroTexto}
            onChange={setDineroTexto}
            teclado="numeric"
            sufijo={simbolo}
            autoFocus
          />
        </Hoja>

        <Hoja visible={!!resultado} onCerrar={() => setResultado(null)} titulo="Turno cerrado">
          {resultado ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              {((resultado.diferencia ?? 0) === 0) ? (
                <Exito
                  titulo="Cuadre correcto"
                  mensaje="El efectivo contado coincide con lo esperado."
                />
              ) : (
                <TarjetaAviso
                  icono="warning"
                  titulo="Diferencia en caja"
                  destacado={formatearDinero(resultado.diferencia ?? 0, simbolo)}
                  mensaje="Revisa el efectivo contado antes de continuar."
                  tono="advertencia"
                />
              )}
              <Text style={[styles.resultadoDetalle, { color: colores.textoSuave }]}>
                {resultado.ventasCount} ventas · {formatearDinero(resultado.totalEsperado, simbolo)} vendidos ·{' '}
                {formatearDinero(resultado.desglose.efectivo_total ?? 0, simbolo)} en efectivo esperado ·{' '}
                {formatearDinero(resultado.dineroReal ?? 0, simbolo)} contados
              </Text>
              <Boton
                titulo="Listo"
                tamanio="lg"
                onPress={() => setResultado(null)}
                estilo={{ marginTop: spacing.lg }}
              />
            </ScrollView>
          ) : null}
        </Hoja>
      </Superficie>
    </Pantalla>
  );
}

function FilaResumen({
  icono,
  etiqueta,
  valor,
}: {
  icono?: 'payments' | 'smartphone' | 'credit-card';
  etiqueta: string;
  valor: string;
}) {
  const { colores } = useTema();
  return (
    <View style={styles.resumenFila}>
      {icono ? (
        <MaterialIcons name={icono} size={18} color={colores.primario} />
      ) : (
        <MaterialIcons name="receipt-long" size={18} color={colores.primario} />
      )}
      <Text style={[styles.resumenEtiqueta, { color: colores.textoSuave }]}>{etiqueta}</Text>
      <Text style={[styles.resumenValor, { color: colores.texto }]}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  verReporte: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  verReporteTexto: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
  },
  lista: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, paddingTop: spacing.md },
  turnoTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  turnoEstado: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  turnoPunto: { width: 10, height: 10, borderRadius: radius.full },
  turnoTitulo: { fontSize: typography.cuerpo, fontFamily: fuentes.bold },
  turnoHora: { fontSize: typography.cuerpoChico, fontFamily: fuentes.medium, marginTop: 2 },
  resumenFilas: { marginTop: spacing.md },
  resumenFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  resumenEtiqueta: { flex: 1, fontSize: typography.cuerpo, fontFamily: fuentes.regular },
  resumenValor: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.semibold,
    fontVariant: ['tabular-nums'],
  },
  totalFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    marginTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  totalLabel: { fontSize: typography.destacado, fontFamily: fuentes.semibold },
  totalValor: {
    fontSize: typography.subtitulo,
    fontFamily: fuentes.display,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  sinTurno: { alignItems: 'center', paddingVertical: spacing.md },
  sinTurnoIcono: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  sinTurnoTitulo: { fontSize: typography.destacado, fontFamily: fuentes.display },
  sinTurnoSub: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.regular,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 21,
  },
  historialTitulo: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filaTurno: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filaTurnoFecha: { alignItems: 'flex-start', minWidth: 74 },
  filaTurnoDia: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.bold,
  },
  filaTurnoHora: { fontSize: typography.micro, fontFamily: fuentes.regular, marginTop: 2 },
  filaTurnoVentas: { fontSize: typography.cuerpo, fontFamily: fuentes.semibold, marginBottom: 4 },
  filaTurnoTotal: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
  },
  filaTurnoDiferencia: { fontSize: typography.cuerpoChico, fontFamily: fuentes.semibold },
  desglose: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  desgloseFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  desgloseLabel: { flex: 1, fontSize: typography.cuerpo, fontFamily: fuentes.semibold },
  desgloseValor: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
  },
  filaArqueo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  textoArqueo: { fontSize: typography.cuerpo, fontFamily: fuentes.regular },
  valorArqueo: {
    fontSize: typography.subtitulo,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
  },
  resultadoDetalle: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.regular,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 21,
  },
});
