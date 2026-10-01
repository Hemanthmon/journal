import { useState } from 'react';

export type Theme = 'system' | 'light' | 'dark' | 'coffee';

export const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'coffee', label: 'Coffee' },
];

const KEY = 'theme';

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.some((t) => t.value === v) ? (v as Theme) : 'system';
  } catch {
    return 'system';
  }
}

/** "System" leaves data-theme unset so the stylesheet follows the OS setting. */
export function applyTheme(theme: Theme = read()) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function useThemePref(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState(read);
  return [
    theme,
    (t) => {
      setTheme(t);
      applyTheme(t);
      try {
        localStorage.setItem(KEY, t);
      } catch {
        // Storage unavailable (private mode): the choice lasts for this page only.
      }
    },
  ];
}
