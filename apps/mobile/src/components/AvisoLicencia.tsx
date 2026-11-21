import { StyleSheet, View } from 'react-native';
import { useSync } from '../store/sync';
import { spacing } from '../theme';
import { TarjetaAviso } from './UI';

/**
 * Tarjeta de estado de la licencia para las pantallas operativas.
 * Aparece cuando hay algo que comunicar: sin activar, vencida, inválida o en
 * periodo de gracia.
 */
export function AvisoLicencia() {
  const estado = useSync((s) => s.licencia?.estado);

  if (
    estado !== 'sin_licencia' &&
    estado !== 'vencida' &&
    estado !== 'invalida' &&
    estado !== 'gracia'
  ) {
    return null;
  }

  const bloqueado =
    estado === 'sin_licencia' || estado === 'vencida' || estado === 'invalida';

  const contenido =
    estado === 'sin_licencia'
      ? {
          destacado: 'Pendiente',
          mensaje: 'Activa tu licencia para registrar ventas.',
        }
      : estado === 'vencida'
        ? {
            destacado: 'Vencida',
            mensaje: 'No se pueden registrar ventas ni cerrar turnos.',
          }
        : estado === 'invalida'
          ? {
              destacado: 'No válida',
              mensaje: 'Verifica la activación desde Ajustes.',
            }
          : {
              destacado: 'Por vencer',
              mensaje: 'Renuévala pronto para seguir vendiendo.',
            };

  return (
    <View style={styles.contenedor}>
      <TarjetaAviso
        icono={bloqueado ? 'warning' : 'schedule'}
        titulo="Licencia"
        destacado={contenido.destacado}
        mensaje={contenido.mensaje}
        tono={bloqueado ? 'advertencia' : 'info'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    paddingTop: spacing.sm,
  },
});
