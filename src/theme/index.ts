import { StyleSheet } from 'react-native';

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
    fondo: '#EDEFFB',
    fondoProfundo: '#E3E6F8',
    superficie: '#FFFFFF',
    superficieSuave: '#F4F5FC',
    vidrio: 'rgba(255, 255, 255, 0.72)',
    vidrioSuave: 'rgba(255, 255, 255, 0.5)',
    primario: '#12143A',
    primarioOscuro: '#0A0C26',
    primarioSuave: '#E9EAF9',
    acento: '#7C3AED',
    acentoSuave: 'rgba(124, 58, 237, 0.12)',
    texto: '#12143A',
    textoSuave: '#5B5F85',
    textoInverso: '#FFFFFF',
    borde: 'rgba(18, 20, 58, 0.1)',
    bordeLuminoso: 'rgba(168, 85, 247, 0.35)',
    peligro: '#E11D48',
    peligroSuave: 'rgba(225, 29, 72, 0.1)',
    advertencia: '#EA580C',
    advertenciaSuave: 'rgba(234, 88, 12, 0.12)',
    info: '#2563EB',
    infoSuave: 'rgba(37, 99, 235, 0.1)',
    exito: '#16A34A',
    exitoSuave: 'rgba(22, 163, 74, 0.12)',
    oscuro: '#0A0C26',
    overlay: 'rgba(10, 12, 38, 0.5)',
    barra: 'rgba(255, 255, 255, 0.85)',
    sombra: '#0A0C26',
  },
  oscuro: {
    fondo: '#080A24',
    fondoProfundo: '#05071A',
    superficie: 'rgba(21, 24, 61, 0.78)',
    superficieSuave: 'rgba(28, 32, 72, 0.6)',
    vidrio: 'rgba(21, 24, 61, 0.72)',
    vidrioSuave: 'rgba(28, 32, 72, 0.6)',
    primario: '#FFFFFF',
    primarioOscuro: '#D7D9F2',
    primarioSuave: 'rgba(255, 255, 255, 0.1)',
    acento: '#A855F7',
    acentoSuave: 'rgba(168, 85, 247, 0.16)',
    texto: '#FFFFFF',
    textoSuave: '#A5A7C5',
    textoInverso: '#FFFFFF',
    borde: 'rgba(255, 255, 255, 0.08)',
    bordeLuminoso: 'rgba(168, 85, 247, 0.45)',
    peligro: '#FB7185',
    peligroSuave: 'rgba(251, 113, 133, 0.14)',
    advertencia: '#FF6B35',
    advertenciaSuave: 'rgba(255, 107, 53, 0.14)',
    info: '#3B82F6',
    infoSuave: 'rgba(59, 130, 246, 0.14)',
    exito: '#22C55E',
    exitoSuave: 'rgba(34, 197, 94, 0.14)',
    oscuro: '#05071A',
    overlay: 'rgba(4, 6, 26, 0.62)',
    barra: 'rgba(11, 14, 46, 0.86)',
    sombra: '#000000',
  },
};

export const gradientes = {
  primario: ['#7C3AED', '#A855F7'],
  cta: ['#A855F7', '#EC4899'],
  cobrar: ['#EC4899', '#FF6B35'],
  peligro: ['#FB7185', '#F43F5E'],
  exito: ['#34D399', '#22C55E'],
  fondo: ['#080A24', '#15183D'],
  fondoClaro: ['#EDEFFB', '#E3E6F8'],
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

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  full: 999,
} as const;

export const typography = {
  micro: 11,
  cuerpoChico: 13,
  cuerpo: 15,
  destacado: 17,
  subtitulo: 19,
  titulo: 22,
  tituloGrande: 28,
  display: 34,
  total: 40,
  hero: 44,
} as const;

export const paletaProductos = [
  '#A855F7',
  '#3B82F6',
  '#FF6B35',
  '#EC4899',
  '#22C55E',
  '#14B8A6',
  '#8B5CF6',
  '#06B6D4',
  '#FACC15',
  '#EF4444',
  '#10B981',
  '#F97316',
];
