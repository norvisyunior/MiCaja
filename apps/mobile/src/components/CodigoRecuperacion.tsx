import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTema } from '../store/tema';
import { fuentes, radius, spacing, typography } from '../theme';
import { Boton, Encabezado, Exito, Pantalla, Superficie, Tarjeta } from './UI';

export function ContenidoCodigoRecuperacion({
  nombre,
  codigo,
}: {
  nombre?: string;
  codigo: string;
}) {
  const { colores } = useTema();

  return (
    <View>
      <Text
        style={[
          styles.etiqueta,
          { color: colores.textoSuave },
        ]}
      >
        {nombre ? `Cuenta de ${nombre}` : 'Tu cuenta'}
      </Text>
      <View
        style={[
          styles.codigoCaja,
          { backgroundColor: colores.primarioSuave },
        ]}
      >
        <Text
          selectable
          style={[styles.codigo, { color: colores.primario }]}
          accessibilityLabel="Código de recuperación"
        >
          {codigo}
        </Text>
      </View>
      <View style={[styles.aviso, { backgroundColor: colores.advertenciaSuave }]}>
        <MaterialIcons name="warning" size={20} color={'#F39A16'} />
        <Text style={[styles.avisoTexto, { color: colores.texto }]}>
          Anótalo en un lugar seguro. Solo se muestra esta vez y sirve para
          restablecer tu PIN si lo olvidas. Cada uso genera un código nuevo.
        </Text>
      </View>
      <Text style={[styles.ayuda, { color: colores.textoSuave }]}>
        No lo compartas: quien tenga este código puede cambiar el PIN de la cuenta.
        Si lo pierdes, un administrador puede generar otro desde Ajustes → Usuarios.
      </Text>
    </View>
  );
}

export function PantallaCodigoRecuperacion({
  nombre,
  codigo,
  onContinuar,
  textoBoton = 'Ya lo guardé',
  titulo = 'Guarda tu código de recuperación',
}: {
  nombre?: string;
  codigo: string;
  onContinuar: () => void;
  textoBoton?: string;
  titulo?: string;
}) {
  const { colores } = useTema();

  return (
    <Pantalla>
      <Encabezado />
      <Superficie>
        <ScrollView
          contentContainerStyle={styles.contenido}
          showsVerticalScrollIndicator={false}
        >
          <Exito
            titulo={titulo}
            mensaje="Este código es tu llave de repuesto. No vuelve a mostrarse."
          />
          <Tarjeta estilo={styles.tarjeta}>
            <ContenidoCodigoRecuperacion nombre={nombre} codigo={codigo} />
          </Tarjeta>

          <View style={{ flex: 1 }} />
          <Boton
            titulo={textoBoton}
            tamanio="lg"
            onPress={onContinuar}
            estilo={{ marginTop: spacing.lg }}
          />
          <Text style={[styles.pie, { color: colores.textoSuave }]}>
            Guarda este código fuera del teléfono.
          </Text>
        </ScrollView>
      </Superficie>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  contenido: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  tarjeta: {
    width: '100%',
    marginTop: spacing.lg,
  },
  etiqueta: {
    fontSize: typography.micro,
    fontFamily: fuentes.semibold,
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  codigoCaja: {
    borderRadius: radius.campo,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  codigo: {
    fontSize: 23,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  aviso: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  avisoTexto: {
    flex: 1,
    fontSize: typography.cuerpoChico,
    lineHeight: 19,
    fontFamily: fuentes.regular,
  },
  ayuda: {
    fontSize: typography.micro,
    lineHeight: 17,
    fontFamily: fuentes.regular,
    marginTop: spacing.md,
  },
  pie: {
    textAlign: 'center',
    fontSize: typography.micro,
    fontFamily: fuentes.regular,
    marginTop: spacing.md,
  },
});
