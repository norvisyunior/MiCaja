import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { listarTurnos } from '../db/repos/turnos';
import { obtenerSettings } from '../db/repos/settings';
import type { TurnoCaja } from '../types';
import { useSesion } from '../store/sesion';
import { useTema } from '../store/tema';
import {
  Encabezado,
  Hoja,
  Pantalla,
  Superficie,
  Tarjeta,
} from '../components/UI';
import { fuentes, spacing, typography } from '../theme';
import { formatearDinero, formatoFechaHora } from '../utils/fechas';
import type { ParamListRaiz, ParamListTabs } from '../navigation';

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
    <View style={[styles.fila, destacado && { borderTopWidth: 1, borderTopColor: colores.borde, marginTop: spacing.xs, paddingTop: spacing.sm }]}>
      <Text style={[styles.etiqueta, { color: colores.textoSuave }]}>{etiqueta}</Text>
      <Text style={[styles.valor, { color: colores.texto, fontFamily: destacado ? fuentes.bold : fuentes.semibold }]}>
        {valor}
      </Text>
    </View>
  );
}

export default function HistorialCierresScreen() {
  const db = useSQLiteContext();
  const { colores } = useTema();
  const navigation = useNavigation<NavigationProp<ParamListRaiz & ParamListTabs>>();
  const usuario = useSesion((s) => s.usuario);
  const [cierres, setCierres] = useState<TurnoCaja[]>([]);
  const [simbolo, setSimbolo] = useState('$');
  const [detalle, setDetalle] = useState<TurnoCaja | null>(null);

  const cargar = useCallback(async () => {
    const [lista, conf] = await Promise.all([
      listarTurnos(db, 100),
      obtenerSettings(db),
    ]);
    setCierres(lista.filter((t) => t.estado === 'cerrado'));
    setSimbolo(conf.simboloMoneda ?? '$');
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar])
  );

  if (usuario?.rol !== 'admin') {
    return (
      <Pantalla>
        <Encabezado titulo="Historial de cierres" onAtras={() => navigation.goBack()} />
        <Superficie>
          <Tarjeta>
            <Text style={[styles.sinDatos, { color: colores.textoSuave }]}>
              Esta información solo está disponible para el dueño del negocio.
            </Text>
          </Tarjeta>
        </Superficie>
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <Encabezado
        titulo="Historial de cierres"
        subtitulo="Solo el dueño del negocio"
        onAtras={() => navigation.goBack()}
      />
      <Superficie>
        {cierres.length === 0 ? (
          <Tarjeta>
            <Text style={[styles.sinDatos, { color: colores.textoSuave }]}>
              Todavía no hay cierres registrados.
            </Text>
          </Tarjeta>
        ) : (
          <FlatList
            data={cierres}
            keyExtractor={(item) => item.uuid ?? String(item.id)}
            contentContainerStyle={styles.lista}
            renderItem={({ item }) => (
              <Tarjeta onPress={() => setDetalle(item)}>
                <Text style={[styles.fecha, { color: colores.texto }]}>
                  {formatoFechaHora(item.cierre ?? item.apertura)}
                </Text>
                <Fila etiqueta="Total vendido" valor={formatearDinero(item.totalEsperado, simbolo)} />
                <Fila etiqueta="Efectivo contado" valor={formatearDinero(item.dineroReal ?? 0, simbolo)} />
                <Fila
                  etiqueta="Diferencia"
                  valor={formatearDinero(item.diferencia ?? 0, simbolo)}
                  destacado
                />
              </Tarjeta>
            )}
          />
        )}
      </Superficie>

      <Hoja visible={detalle !== null} onCerrar={() => setDetalle(null)} titulo="Detalle del cierre">
        {detalle ? (
          <>
            <Fila etiqueta="Fecha" valor={formatoFechaHora(detalle.cierre ?? detalle.apertura)} />
            <Fila etiqueta="Ventas" valor={`${detalle.ventasCount} · ${formatearDinero(detalle.totalEsperado, simbolo)}`} />
            <Fila etiqueta="Efectivo esperado" valor={formatearDinero(detalle.efectivoEsperado, simbolo)} />
            <Fila etiqueta="Efectivo contado" valor={formatearDinero(detalle.dineroReal ?? 0, simbolo)} />
            <Fila etiqueta="Diferencia" valor={formatearDinero(detalle.diferencia ?? 0, simbolo)} destacado />
            {detalle.observacionDiferencia ? (
              <Text style={[styles.observacion, { color: colores.textoSuave }]}>
                {detalle.observacionDiferencia}
              </Text>
            ) : null}
          </>
        ) : null}
      </Hoja>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  lista: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  fecha: { fontSize: typography.destacado, fontFamily: fuentes.display, marginBottom: spacing.sm },
  fila: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 5 },
  etiqueta: { fontSize: typography.cuerpoChico, fontFamily: fuentes.regular },
  valor: { fontSize: typography.cuerpoChico, fontVariant: ['tabular-nums'] },
  observacion: { fontSize: typography.cuerpoChico, fontFamily: fuentes.regular, marginTop: spacing.md },
  sinDatos: { fontSize: typography.cuerpo, fontFamily: fuentes.regular, textAlign: 'center', paddingVertical: spacing.lg },
});
