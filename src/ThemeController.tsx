import { useEffect } from 'react';

export type LexTheme = 'dark' | 'light';
export const THEME_STORAGE_KEY = 'lexoffice-theme';
export function readLexTheme(): LexTheme {
  try { return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}
export function applyLexTheme(theme: LexTheme) {
  document.documentElement.dataset.lexTheme = theme;
  document.documentElement.style.colorScheme = theme;
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch {}
  window.dispatchEvent(new CustomEvent('lexoffice-theme-change', { detail: theme }));
}
export default function ThemeController(){
  useEffect(() => {
    applyLexTheme(readLexTheme());
  }, []);
  return null;
}
