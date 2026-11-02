import { useColorScheme } from 'react-native';

/** Parent area palette: follows the system light/dark theme, ≥4.5:1 text contrast (NFR-5, §10). */
const light = {
  bg: '#F6F5F2',
  surface: '#FFFFFF',
  text: '#1B1B1F',
  muted: '#55585E',
  border: '#DEDBD4',
  primary: '#B5021A',
  onPrimary: '#FFFFFF',
  danger: '#A4241A',
  success: '#1D6E38',
  warning: '#8A5300',
  warningBg: '#FFF4DC',
};

const dark: typeof light = {
  bg: '#121214',
  surface: '#1E1E22',
  text: '#F1F1F3',
  muted: '#B2B2BA',
  border: '#34343B',
  primary: '#FF6B7D',
  onPrimary: '#1B0004',
  danger: '#FF8A80',
  success: '#7BD88F',
  warning: '#FFC56B',
  warningBg: '#3A2A10',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Child-facing screens are always light and friendly. */
export const child = {
  bg: '#FFF8EC',
  card: '#FFFFFF',
  text: '#2B2B2B',
  accent: '#D0021B',
  done: '#2E8B57',
  todo: '#C9C3B6',
};
