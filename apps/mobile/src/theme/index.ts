import { StyleSheet, type ViewStyle } from 'react-native';

export type ModoTema = 'claro' | 'oscuro';

export interface PaletaColores {
  fondo: string;
  fondoProfundo: string;
  superficie: string;
  superficieSuave: string;
  vidrio: string;
  vidrioSuave: string;
  primario: string;
  primarioOscuro: string;
  primarioSuave: string;
  acento: string;
  acentoSuave: string;
  texto: string;
  textoSuave: string;
  textoInverso: string;
  borde: string;
  bordeLuminoso: string;
  peligro: string;
  peligroSuave: string;
  advertencia: string;
  advertenciaSuave: string;
  info: string;
  infoSuave: string;
  exito: string;
  exitoSuave: string;
  oscuro: string;
  overlay: string;
  barra: string;
  sombra: string;
}

export const paletas: Record<ModoTema, PaletaColores> = {
  claro: {
    fondo: '#FFFFFF',
    fondoProfundo: '#F4F5FB',
    superficie: '#FFFFFF',
    superficieSuave: '#F3F4FA',
    vidrio: 'rgba(255, 255, 255, 0.97)',
    vidrioSuave: 'rgba(244, 245, 251, 0.9)',
    primario: '#3F3FB0',
    primarioOscuro: '#34349C',
    primarioSuave: '#E9EAFB',
    acento: '#3F3FB0',
    acentoSuave: '#E9EAFB',
    texto: '#14172E',
    textoSuave: '#6E7288',
    textoInverso: '#FFFFFF',
    borde: '#E6E8F2',
    bordeLuminoso: 'rgba(63, 63, 176, 0.45)',
    peligro: '#E0455B',
    peligroSuave: '#FDECEF',
    advertencia: '#F39A16',
    advertenciaSuave: '#FEF3D6',
    info: '#2E6FE0',
    infoSuave: '#E8F0FD',
    exito: '#22A85A',
    exitoSuave: '#E6F6EC',
    oscuro: '#101229',
    overlay: 'rgba(16, 18, 41, 0.45)',
    barra: 'rgba(255, 255, 255, 0.98)',
    sombra: '#1B1E3C',
  },
  oscuro: {
    fondo: '#0E1024',
    fondoProfundo: '#090A18',
    superficie: '#171A33',
    superficieSuave: '#1E2140',
    vidrio: 'rgba(23, 26, 51, 0.94)',
    vidrioSuave: 'rgba(30, 33, 64, 0.7)',
    primario: '#7E81F2',
    primarioOscuro: '#3B3EBB',
    primarioSuave: 'rgba(126, 129, 242, 0.16)',
    acento: '#7E81F2',
    acentoSuave: 'rgba(126, 129, 242, 0.18)',
    texto: '#FFFFFF',
    textoSuave: '#A5A9C8',
    textoInverso: '#FFFFFF',
    borde: 'rgba(255, 255, 255, 0.09)',
    bordeLuminoso: 'rgba(126, 129, 242, 0.5)',
    peligro: '#FB7185',
    peligroSuave: 'rgba(251, 113, 133, 0.14)',
    advertencia: '#F5B44A',
    advertenciaSuave: 'rgba(245, 180, 74, 0.16)',
    info: '#6FA8FF',
    infoSuave: 'rgba(111, 168, 255, 0.16)',
    exito: '#3CCF7A',
    exitoSuave: 'rgba(60, 207, 122, 0.16)',
    oscuro: '#05071A',
    overlay: 'rgba(4, 6, 26, 0.62)',
    barra: 'rgba(15, 17, 38, 0.94)',
    sombra: '#000000',
  },
};

export const gradientes = {
  primario: ['#4B4BC8', '#3F3FB0'],
  cta: ['#4A4AC6', '#3F3FB0'],
  cobrar: ['#4A4AC6', '#3F3FB0'],
  banda: ['#4B4BC8', '#3F3FB0'],
  peligro: ['#E0455B', '#C93450'],
  exito: ['#2BB673', '#22A85A'],
  fondo: ['#0E1024', '#171A33'],
  fondoClaro: ['#FFFFFF', '#F4F5FB'],
} as const;

export const fuentes = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
  display: 'Poppins_700Bold',
} as const;

export const sombraSuave = (c: PaletaColores) =>
  StyleSheet.create({
    card: {
      shadowColor: c.sombra,
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
  }).card;

export const sombraMedia = (c: PaletaColores) =>
  StyleSheet.create({
    card: {
      shadowColor: c.sombra,
      shadowOpacity: 0.35,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 12 },
      elevation: 8,
    },
  }).card;

/**
 * Sombra única para tarjetas. Es deliberadamente suave: en Android una
 * elevación alta + un borde dibuja lo que parece un "doble borde".
 */
export const sombraTarjeta = (c: PaletaColores): ViewStyle => ({
  shadowColor: c.sombra,
  shadowOpacity: 0.04,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 0,
});

export const sombraFlotante = (c: PaletaColores): ViewStyle => ({
  shadowColor: c.sombra,
  shadowOpacity: 0.1,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
});

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 20,
  hoja: 26,
  tarjeta: 16,
  campo: 14,
  boton: 14,
  accion: 18,
  full: 999,
} as const;

export const typography = {
  micro: 11,
  cuerpoChico: 13,
  cuerpo: 15,
  destacado: 17,
  subtitulo: 19,
  tituloHoja: 22,
  titulo: 22,
  tituloGrande: 28,
  display: 34,
  total: 40,
  hero: 44,
} as const;

export const paletaProductos = [
  '#3F3FB0',
  '#2E6FE0',
  '#22A85A',
  '#E8A33D',
  '#E0455B',
  '#7C5CE0',
  '#14B8A6',
  '#EC6FA8',
  '#64748B',
  '#06B6D4',
  '#10B981',
  '#F97316',
];
