import { StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSync } from '../store/sync';
import { useTema } from '../store/tema';
import { fuentes, radius, spacing, typography } from '../theme';

/**
 * Banda de estado de la licencia para las pantallas operativas.
 * Solo aparece cuando hay algo que comunicar: vencida, inválida o en
 * periodo de gracia. El modo local sin licencia no muestra nada.
 */
export function AvisoLicencia() {
  const { colores } = useTema();
  const estado = useSync((s) => s.licencia?.estado);

  if (estado !== 'vencida' && estado !== 'invalida' && estado !== 'gracia') {
    return null;
  }

  const bloqueado = estado === 'vencida' || estado === 'invalida';
  const color = bloqueado ? colores.peligro : colores.advertencia;
  const fondo = bloqueado ? colores.peligroSuave : colores.advertenciaSuave;
  const texto =
    estado === 'vencida'
      ? 'Licencia vencida · no se pueden registrar ventas ni cerrar turnos'
      : estado === 'invalida'
        ? 'Licencia no válida · verifica la activación en Ajustes'
        : 'Licencia en periodo de gracia · renuévala pronto';

  return (
    <View style={[styles.banner, { backgroundColor: fondo }]}>
      <MaterialIcons name={bloqueado ? 'block' : 'schedule'} size={15} color={color} />
      <Text style={[styles.texto, { color }]} numberOfLines={2}>
        {texto}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.sm,
  },
  texto: {
    flex: 1,
    fontFamily: fuentes.medium,
    fontSize: typography.cuerpoChico,
  },
});
