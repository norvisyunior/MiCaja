/**
 * Sustituto de `react-native` para ejecutar en Node la lógica pura de la app
 * con Vitest. Solo expone lo que esos módulos usan: `Platform`.
 */
export const Platform = {
  OS: 'ios' as 'ios' | 'android' | 'web' | 'windows' | 'macos',
  select: <T,>(opciones: { ios?: T; android?: T; default: T }): T =>
    opciones[Platform.OS as 'ios' | 'android'] ?? opciones.default,
};

export const StyleSheet = {
  create: <T,>(estilos: T): T => estilos,
};

export const View = 'View';
export const Text = 'Text';
