import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import type { TurnoCaja } from '../types';
import { cerrarTurno, listarTurnos, turnoAbierto, turnoAbiertoOCrear } from '../db/repos/turnos';
import { resumenVentasTurno, type ResumenVentasTurno } from '../db/repos/ventas';
import { obtenerSettings } from '../db/repos/settings';
import { useSesion } from '../store/sesion';
import { useAvisos } from '../store/avisos';
import { useTema } from '../store/tema';
import { formatearDinero, formatoFechaCorta, formatoHora } from '../utils/fechas';
import {
  Badge,
  Boton,
  Campo,
  Encabezado,
  EstadoCarga,
  Gradiente,
  Hoja,
  ListaVacia,
  Pantalla,
  parsearMonto,
  Sello,
  SombraDura,
  Tarjeta,
} from '../components/UI';
import { fuentes, gradientes, radius, spacing, typography } from '../theme';

export default function TurnoScreen() {
  const db = useSQLiteContext();
  const usuario = useSesion((s) => s.usuario)!;
  const { colores } = useTema();
  const navigation = useNavigation();
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
    await turnoAbiertoOCrear(db, usuario.id, new Date());
    await cargar();
  }

  async function abrirArqueo() {
    setDineroTexto(String(resumen?.total ?? 0));
    setArqueando(true);
  }

  async function confirmarCierre() {
    if (!turno || guardando) return;
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

  const diferencia = turno ? parsearMonto(dineroTexto) - (resumen?.total ?? 0) : 0;

  if (cargando) {
    return (
      <Pantalla>
        <Encabezado titulo="Cierre de caja" onAtras={() => navigation.goBack()} />
        <EstadoCarga mensaje="Cargando turnos…" />
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <Encabezado titulo="Cierre de caja" subtitulo="Apertura, arqueo y cierre del turno" onAtras={() => navigation.goBack()} />

      {turno ? (
        <SombraDura redondeo={radius.md} offset={4} estilo={styles.tarjetaTurnoContenedor}>
          <View style={[styles.tarjetaTurno, { backgroundColor: colores.superficie, borderColor: colores.borde }]}>
            <View style={styles.turnoTop}>
              <Sello texto="Turno abierto" color={colores.exito} />
              <Text style={[styles.turnoHora, { color: colores.textoSuave }]}>
                desde {formatoHora(turno.apertura)}
              </Text>
            </View>
            <View style={styles.estadisticas}>
              <Estadistica
                valor={String(resumen?.ventas ?? 0)}
                etiqueta="ventas"
                color={colores.texto}
              />
              <Estadistica
                valor={formatearDinero(resumen?.efectivo ?? 0, simbolo)}
                etiqueta="efectivo"
                color={colores.acento}
              />
              <Estadistica
                valor={formatearDinero(resumen?.digital ?? 0, simbolo)}
                etiqueta="digital"
                color={colores.info}
              />
            </View>
            <Gradiente
              colores={gradientes.primario}
              estilo={[styles.turnoTotal, { borderColor: colores.bordeLuminoso }]}
            >
              <Text style={styles.turnoTotalLabel}>Total vendido</Text>
              <Text style={styles.turnoTotalValor}>{formatearDinero(resumen?.total ?? 0, simbolo)}</Text>
            </Gradiente>
            <Boton
              titulo="Cerrar caja y hacer arqueo"
              icono="lock-outline"
              variante="acento"
              tamanio="lg"
              onPress={abrirArqueo}
              estilo={{ marginTop: spacing.md }}
            />
          </View>
        </SombraDura>
      ) : (
        <Tarjeta estilo={[styles.sinTurno, { backgroundColor: colores.superficie }]}>
          <Text style={{ fontSize: 40 }}>🕐</Text>
          <Text style={[styles.sinTurnoTitulo, { color: colores.texto }]}>No hay turno abierto</Text>
          <Text style={[styles.sinTurnoSub, { color: colores.textoSuave }]}>
            Abre el turno antes de comenzar a vender para llevar el control de la caja.
          </Text>
          <Boton
            titulo="Abrir turno"
            icono="play-arrow"
            variante="acento"
            tamanio="lg"
            onPress={abrirTurno}
            estilo={{ marginTop: spacing.md, alignSelf: 'stretch' }}
          />
        </Tarjeta>
      )}

      <Text style={[styles.historialTitulo, { color: colores.textoSuave }]}>Historial</Text>
      <FlatList
        data={historial}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={[styles.lista, { paddingBottom: 40 }]}
        ListEmptyComponent={
          <ListaVacia emoji="📋" titulo="Sin turnos" subtitulo="Los turnos cerrados aparecerán aquí" />
        }
        renderItem={({ item }) => (
          <SombraDura redondeo={radius.md} offset={3}>
            <View style={[styles.filaTurno, { backgroundColor: colores.superficie, borderColor: colores.borde }]}>
              <View style={styles.filaTurnoFecha}>
                <Text style={[styles.filaTurnoDia, { color: colores.texto }]}>{formatoFechaCorta(item.apertura)}</Text>
                <Text style={[styles.filaTurnoHora, { color: colores.textoSuave }]}>
                  {formatoHora(item.apertura)}
                  {item.cierre ? ` – ${formatoHora(item.cierre)}` : ''}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.filaTurnoVentas, { color: colores.texto }]}>{item.ventasCount} venta(s)</Text>
                <Badge
                  texto={item.estado === 'abierto' ? 'Abierto' : 'Cerrado'}
                  color={item.estado === 'abierto' ? colores.acentoSuave : colores.superficieSuave}
                  colorTexto={item.estado === 'abierto' ? colores.acento : colores.textoSuave}
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
                      { color: item.diferencia < 0 ? colores.peligro : colores.acento },
                    ]}
                  >
                    {item.diferencia > 0 ? '+' : ''}
                    {formatearDinero(item.diferencia, simbolo)}
                  </Text>
                ) : null}
              </View>
            </View>
          </SombraDura>
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
              <Text style={[styles.textoArqueo, { color: colores.textoSuave }]}>Esperado</Text>
              <Text style={[styles.valorArqueo, { color: colores.texto }]}>
                {formatearDinero(resumen?.total ?? 0, simbolo)}
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
                          : colores.acento,
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
              variante="acento"
              tamanio="lg"
              cargando={guardando}
              onPress={confirmarCierre}
            />
          </View>
        }
      >
        <View style={[styles.desglose, { backgroundColor: colores.superficie, borderColor: colores.borde }]}>
          <View style={styles.desgloseFila}>
            <MaterialIcons name="payments" size={20} color={colores.acento} />
            <Text style={[styles.desgloseLabel, { color: colores.textoSuave }]}>Efectivo esperado</Text>
            <Text style={[styles.desgloseValor, { color: colores.texto }]}>
              {formatearDinero(resumen?.efectivo ?? 0, simbolo)}
            </Text>
          </View>
          <View style={styles.desgloseFila}>
            <MaterialIcons name="smartphone" size={20} color={colores.info} />
            <Text style={[styles.desgloseLabel, { color: colores.textoSuave }]}>Digital esperado</Text>
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
          <View style={styles.resultado}>
            <View
              style={[
                styles.resultadoIcono,
                {
                  backgroundColor: (resultado.diferencia ?? 0) === 0 ? colores.exito : colores.advertencia,
                },
              ]}
            >
              <MaterialIcons
                name={(resultado.diferencia ?? 0) === 0 ? 'done-all' : 'warning'}
                size={36}
                color="#FFFFFF"
              />
            </View>
            <Text style={[styles.resultadoTitulo, { color: colores.texto }]}>
              {(resultado.diferencia ?? 0) === 0 ? '¡Caja cuadrada!' : 'Caja con diferencia'}
            </Text>
            <Sello
              texto={(resultado.diferencia ?? 0) === 0 ? 'Cuadrada' : 'Diferencia'}
              color={(resultado.diferencia ?? 0) === 0 ? colores.exito : colores.advertencia}
            />
            {(resultado.diferencia ?? 0) !== 0 ? (
              <Text style={[styles.resultadoDiferencia, { color: colores.advertencia }]}>
                {(resultado.diferencia ?? 0) > 0 ? '+' : ''}
                {formatearDinero(resultado.diferencia ?? 0, simbolo)}
              </Text>
            ) : null}
            <Text style={[styles.resultadoDetalle, { color: colores.textoSuave }]}>
              {resultado.ventasCount} ventas · {formatearDinero(resultado.totalEsperado, simbolo)} esperados ·{' '}
              {formatearDinero(resultado.dineroReal ?? 0, simbolo)} contados
            </Text>
            <Boton
              titulo="Listo"
              variante="acento"
              tamanio="lg"
              onPress={() => setResultado(null)}
              estilo={{ marginTop: spacing.xl, alignSelf: 'stretch' }}
            />
          </View>
        ) : null}
      </Hoja>
    </Pantalla>
  );
}

function Estadistica({ valor, etiqueta, color }: { valor: string; etiqueta: string; color: string }) {
  const { colores } = useTema();
  return (
    <View style={styles.estadistica}>
      <Text style={[styles.estadisticaValor, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {valor}
      </Text>
      <Text style={[styles.estadisticaLabel, { color: colores.textoSuave }]}>{etiqueta}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjetaTurnoContenedor: { marginHorizontal: spacing.lg },
  tarjetaTurno: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.lg },
  turnoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  turnoHora: { fontSize: typography.cuerpoChico, fontFamily: fuentes.medium },
  estadisticas: { flexDirection: 'row' },
  estadistica: { flex: 1, alignItems: 'center' },
  estadisticaValor: {
    fontSize: typography.subtitulo,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
  },
  estadisticaLabel: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
    marginTop: 3,
  },
  turnoTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  turnoTotalLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fuentes.semibold,
    fontSize: typography.cuerpoChico,
  },
  turnoTotalValor: {
    color: '#FFFFFF',
    fontSize: typography.subtitulo,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
  },
  sinTurno: { marginHorizontal: spacing.lg, alignItems: 'center', paddingVertical: spacing.xl },
  sinTurnoTitulo: {
    fontSize: typography.subtitulo,
    fontFamily: fuentes.bold,
    marginTop: spacing.sm,
  },
  sinTurnoSub: { fontSize: typography.cuerpo, fontFamily: fuentes.regular, textAlign: 'center', marginTop: spacing.xs },
  historialTitulo: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.semibold,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  lista: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  filaTurno: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  filaTurnoFecha: { alignItems: 'center', minWidth: 70 },
  filaTurnoDia: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.bold,
  },
  filaTurnoHora: { fontSize: typography.cuerpoChico, fontFamily: fuentes.regular, marginTop: 2 },
  filaTurnoVentas: { fontSize: typography.cuerpo, fontFamily: fuentes.bold, marginBottom: 4 },
  filaTurnoTotal: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.bold,
    fontVariant: ['tabular-nums'],
  },
  filaTurnoDiferencia: { fontSize: typography.cuerpoChico, fontFamily: fuentes.bold },
  desglose: {
    borderWidth: StyleSheet.hairlineWidth,
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
  resultado: { alignItems: 'center', paddingTop: spacing.sm, gap: spacing.sm },
  resultadoIcono: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  resultadoTitulo: {
    fontSize: typography.subtitulo,
    fontFamily: fuentes.bold,
  },
  resultadoDiferencia: {
    fontSize: 32,
    fontFamily: fuentes.bold,
    marginTop: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
  resultadoDetalle: {
    fontSize: typography.cuerpo,
    fontFamily: fuentes.regular,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
