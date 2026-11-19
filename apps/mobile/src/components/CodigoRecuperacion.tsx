import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useTema } from '../store/tema';
import { fuentes, gradientes, radius, spacing, typography } from '../theme';
import { Boton, Gradiente, Pantalla, Tarjeta } from './UI';

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
      <Text style={[styles.etiqueta, { color: colores.textoSuave }]}>
        {nombre ? `Cuenta de ${nombre}` : 'Tu cuenta'}
      </Text>
      <View
        style={[
          styles.codigoCaja,
          { backgroundColor: colores.superficieSuave, borderColor: colores.borde },
        ]}
      >
        <Text
          selectable
          style={[styles.codigo, { color: colores.texto }]}
          accessibilityLabel="Código de recuperación"
        >
          {codigo}
        </Text>
      </View>
      <View style={[styles.aviso, { backgroundColor: colores.advertenciaSuave }]}>
        <MaterialIcons name="warning-amber" size={19} color={colores.advertencia} />
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
      <ScrollView
        contentContainerStyle={styles.contenido}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Gradiente colores={gradientes.primario} estilo={styles.logo}>
            <MaterialIcons name="key" size={34} color="#FFFFFF" />
          </Gradiente>
          <Text style={[styles.titulo, { color: colores.texto }]}>{titulo}</Text>
          <Text style={[styles.subtitulo, { color: colores.textoSuave }]}>
            Este código es tu llave de repuesto. No vuelve a mostrarse.
          </Text>
        </View>

        <Tarjeta estilo={styles.tarjeta}>
          <ContenidoCodigoRecuperacion nombre={nombre} codigo={codigo} />
          <Boton
            titulo={textoBoton}
            icono="arrow-forward"
            tamanio="lg"
            onPress={onContinuar}
            estilo={{ marginTop: spacing.lg }}
          />
        </Tarjeta>
      </ScrollView>
    </Pantalla>
  );
}

const styles = StyleSheet.create({
  contenido: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titulo: {
    fontSize: typography.tituloGrande,
    fontFamily: fuentes.bold,
    marginTop: spacing.lg,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitulo: {
    fontSize: typography.cuerpoChico,
    fontFamily: fuentes.regular,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  tarjeta: {
    width: '100%',
  },
  etiqueta: {
    fontSize: typography.micro,
    fontFamily: fuentes.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  codigoCaja: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  codigo: {
    fontSize: 24,
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
    fontFamily: fuentes.medium,
  },
  ayuda: {
    fontSize: typography.micro,
    lineHeight: 17,
    fontFamily: fuentes.regular,
    marginTop: spacing.md,
  },
});
