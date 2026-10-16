// Tema claro/oscuro. Sin eleccion guardada se sigue al sistema (prefers-color-scheme).
// La eleccion vive solo en este navegador; localStorage puede fallar (modo privado), por eso va en try/catch.
const CLAVE = 'sf-theme';

export function temaGuardado() {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === 'light' || v === 'dark' ? v : null;
  } catch { return null; }
}

export function temaEfectivo() {
  return temaGuardado() ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

export function aplicarTema(tema) {
  if (tema) document.documentElement.dataset.theme = tema;
  else delete document.documentElement.dataset.theme;
}

export function alternarTema() {
  const siguiente = temaEfectivo() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(CLAVE, siguiente); } catch { /* sin persistencia: solo esta sesion */ }
  aplicarTema(siguiente);
  return siguiente;
}
