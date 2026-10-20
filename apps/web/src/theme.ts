export type Theme = 'light' | 'dark';

const KEY = 'calm-wallet-theme';

/** Saved choice if any (per-viewer convenience), otherwise the OS preference. */
export function initialTheme(): Theme {
  // ?theme=light|dark overrides (handy for screenshots and manual checks).
  const fromUrl = new URLSearchParams(window.location.search).get('theme');
  if (fromUrl === 'light' || fromUrl === 'dark') return fromUrl;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage unavailable */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme, remember: boolean): void {
  document.documentElement.dataset['theme'] = theme;
  if (!remember) return;
  try { localStorage.setItem(KEY, theme); } catch { /* storage unavailable */ }
}

/** Follows live OS theme changes until the viewer picks a theme themselves. Returns an unsubscribe function. */
export function followSystemTheme(onChange: (theme: Theme) => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = (event: MediaQueryListEvent) => {
    if (new URLSearchParams(window.location.search).has('theme')) return;
    try { if (localStorage.getItem(KEY)) return; } catch { /* storage unavailable */ }
    onChange(event.matches ? 'dark' : 'light');
  };
  query.addEventListener('change', listener);
  return () => { query.removeEventListener('change', listener); };
}
