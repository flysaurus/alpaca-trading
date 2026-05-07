const THEME_KEY = 'alpaca-trading-theme';

type Theme = 'dark' | 'light';

export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return (localStorage.getItem(THEME_KEY) as Theme) || 'dark';
}

export function setTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.setAttribute('data-theme', theme);
}

export function initTheme() {
  if (typeof window === 'undefined') return;
  const theme = getTheme();
  document.documentElement.setAttribute('data-theme', theme);
}
