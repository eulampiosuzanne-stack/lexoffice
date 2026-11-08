import { useEffect } from 'react';

export type LexTheme = 'dark' | 'light';
export const THEME_STORAGE_KEY = 'lexoffice-theme';
const THEME_MIGRATION_KEY = 'lexoffice-sf-light-theme-v1';

export function readLexTheme(): LexTheme {
  try {
    if (localStorage.getItem(THEME_MIGRATION_KEY) !== 'done') {
      localStorage.setItem(THEME_STORAGE_KEY, 'light');
      localStorage.setItem(THEME_MIGRATION_KEY, 'done');
      return 'light';
    }
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch { return 'light'; }
}

export function applyLexTheme(theme: LexTheme) {
  document.documentElement.dataset.lexTheme = theme;
  document.documentElement.style.colorScheme = theme;
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch {}
  window.dispatchEvent(new CustomEvent('lexoffice-theme-change', { detail: theme }));
}

export default function ThemeController() {
  useEffect(() => { applyLexTheme(readLexTheme()); }, []);
  return null;
}
