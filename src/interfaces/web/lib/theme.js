import { useEffect, useState } from 'react';

const KEY = 'agroflow-theme';
const media = () => globalThis.matchMedia?.('(prefers-color-scheme: dark)');

function leer() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* almacenamiento bloqueado */ }
  return media()?.matches ? 'dark' : 'light';
}

/** Tema claro/oscuro: respeta el sistema hasta que el usuario elige uno. */
export function useTheme() {
  const [theme, setTheme] = useState(leer);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0c1410' : '#f6f8f4');
  }, [theme]);

  useEffect(() => {
    const query = media();
    if (!query) return undefined;
    const sync = (event) => {
      try { if (localStorage.getItem(KEY)) return; } catch { /* sin almacenamiento */ }
      setTheme(event.matches ? 'dark' : 'light');
    };
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  function toggle() {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch { /* sin almacenamiento */ }
      return next;
    });
  }

  return [theme, toggle];
}
