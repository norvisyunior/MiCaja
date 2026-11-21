import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAvisos } from '../store/avisos';
import { useTema } from '../store/tema';
import { fuentes, radius, spacing, typography } from '../theme';

export function AvisoGlobal() {
  const { colores } = useTema();
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
        <View
          style={[
            styles.tarjeta,
            { backgroundColor: colores.superficie, borderColor: colores.borde },
          ]}
        >
          <View style={[styles.icono, { backgroundColor: colores.primarioSuave }]}>
            <MaterialIcons name="notifications-none" size={26} color={colores.primario} />
          </View>
          <Text style={[styles.titulo, { color: colores.texto }]}>{aviso.titulo}</Text>
          {aviso.mensaje ? (
            <Text style={[styles.mensaje, { color: colores.textoSuave }]}>{aviso.mensaje}</Text>
          ) : null}
          <View style={styles.botones}>
            {aviso.botones.map((b, i) => {
              const peligro = b.estilo === 'peligro';
              const cancel = b.estilo === 'cancel';
              return (
                <Pressable
                  key={i}
                  onPress={() => {
                    cerrar(aviso.id);
                    b.onPress?.();
                  }}
                  style={({ pressed }) => [
                    styles.boton,
                    {
                      backgroundColor: cancel ? colores.superficie : peligro ? colores.peligro : colores.primario,
                      borderWidth: cancel ? 1 : 0,
                      borderColor: colores.borde,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    style={[
                      styles.botonTexto,
                      { color: cancel ? colores.primario : '#FFFFFF' },
                    ]}
                  >
                    {b.texto}
                  </Text>
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
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
  },
  icono: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  titulo: {
    fontSize: typography.titulo,
    fontFamily: fuentes.display,
    letterSpacing: -0.4,
  },
  mensaje: {
    fontSize: typography.cuerpo,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    fontFamily: fuentes.regular,
    lineHeight: 22,
  },
  botones: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  boton: {
    flex: 1,
    height: 48,
    borderRadius: radius.boton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonTexto: {
    fontFamily: fuentes.semibold,
    fontSize: typography.cuerpoChico,
  },
});
