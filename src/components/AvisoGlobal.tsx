import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAvisos } from '../store/avisos';
import { useTema } from '../store/tema';
import { fuentes, radius, spacing, typography } from '../theme';
import { Gradiente } from './UI';

export function AvisoGlobal() {
  const { colores, modo } = useTema();
  const avisos = useAvisos((s) => s.avisos);
  const cerrar = useAvisos((s) => s.cerrar);
  const aviso = avisos[avisos.length - 1];

  if (!aviso) {
    return null;
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => cerrar(aviso.id)}
    >
      <View style={[styles.fondo, { backgroundColor: colores.overlay }]}>
        <View style={[styles.tarjeta, { backgroundColor: colores.vidrio, borderColor: colores.borde }]}>
          <Text style={[styles.titulo, { color: colores.texto }]}>{aviso.titulo}</Text>
          {aviso.mensaje ? (
            <Text style={[styles.mensaje, { color: colores.textoSuave }]}>{aviso.mensaje}</Text>
          ) : null}
          <View style={styles.botones}>
            {aviso.botones.map((b, i) => {
              const peligro = b.estilo === 'peligro';
              const cancel = b.estilo === 'cancel';
              const colorTexto = cancel
                ? colores.texto
                : peligro
                  ? '#FFFFFF'
                  : modo === 'oscuro'
                    ? colores.fondoProfundo
                    : colores.textoInverso;
              return (
                <Pressable
                  key={i}
                  onPress={() => {
                    cerrar(aviso.id);
                    b.onPress?.();
                  }}
                  style={({ pressed }) => [
                    styles.boton,
                    cancel
                      ? { backgroundColor: colores.vidrioSuave, borderWidth: 1, borderColor: colores.borde }
                      : { backgroundColor: colores.primario, overflow: 'hidden' },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  {!cancel && !peligro ? (
                    <Gradiente
                      colores={['#A855F7', '#EC4899']}
                      estilo={StyleSheet.absoluteFill}
                    />
                  ) : null}
                  {!cancel && peligro ? (
                    <Gradiente
                      colores={['#FB7185', '#F43F5E']}
                      estilo={StyleSheet.absoluteFill}
                    />
                  ) : null}
                  <Text style={[styles.botonTexto, { color: colorTexto }]}>{b.texto}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  tarjeta: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
  },
  titulo: {
    fontSize: typography.subtitulo,
    fontFamily: fuentes.extrabold,
  },
  mensaje: {
    fontSize: typography.cuerpo,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    fontFamily: fuentes.regular,
  },
  botones: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  boton: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonTexto: {
    fontFamily: fuentes.bold,
    fontSize: typography.cuerpoChico,
  },
});
