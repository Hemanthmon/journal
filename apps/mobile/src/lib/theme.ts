import { useColorScheme } from 'react-native';
import { usePrefs } from '../state/prefs';

/** Calm, low-contrast-but-accessible palette. Text colors meet WCAG AA on their backgrounds. */
const light = {
  bg: '#F5F6FA',
  card: '#FFFFFF',
  cardAlt: '#EEF1F8',
  text: '#1E2330',
  muted: '#5D6575',
  border: '#E1E5EE',
  primary: '#4E6FCB',
  primaryText: '#FFFFFF',
  primarySoft: '#E3E9F9',
  success: '#2F8F6B',
  successSoft: '#DDF1E8',
  warning: '#9A6B12',
  danger: '#C2413B',
  dangerSoft: '#F8E1E0',
  track: '#E6E9F0',
};

const dark: typeof light = {
  bg: '#101217',
  card: '#1A1D24',
  cardAlt: '#222631',
  text: '#ECEEF3',
  muted: '#A0A7B4',
  border: '#2B303C',
  primary: '#8AA5F0',
  primaryText: '#0E1320',
  primarySoft: '#26314D',
  success: '#6CCBA5',
  successSoft: '#1E3B31',
  warning: '#E0B45C',
  danger: '#F08A84',
  dangerSoft: '#44211F',
  track: '#2B303C',
};

export type Palette = typeof light;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };
export const font = { small: 13, body: 16, large: 18, title: 22, hero: 28 };

export function useTheme(): { c: Palette; dark: boolean } {
  const pref = usePrefs((s) => s.theme);
  const system = useColorScheme();
  const isDark = pref === 'system' ? system === 'dark' : pref === 'dark';
  return { c: isDark ? dark : light, dark: isDark };
}
