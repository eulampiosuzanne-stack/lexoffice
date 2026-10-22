export const VISIBILITY_KEY = 'lexoffice-visibility-v1';
export function readVisibility(): boolean {
  try { return localStorage.getItem(VISIBILITY_KEY) === 'enhanced'; } catch { return false; }
}
export function applyVisibility(enabled: boolean) {
  document.documentElement.dataset.lexVision = enabled ? 'enhanced' : 'standard';
  try { localStorage.setItem(VISIBILITY_KEY, enabled ? 'enhanced' : 'standard'); } catch { /* Available for this session when storage is blocked. */ }
}
