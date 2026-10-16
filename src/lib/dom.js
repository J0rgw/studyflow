// Creacion de DOM segura: el texto siempre va como nodo de texto (nunca se interpreta como HTML),
// asi las notas u otros datos arbitrarios no pueden inyectar HTML.

export function h(tag, props = {}, ...children) {
  return montar(document.createElement(tag), props, children);
}

/** Igual que h() pero en el espacio de nombres SVG (graficos de carga y plan). */
export function s(tag, props = {}, ...children) {
  return montar(document.createElementNS('http://www.w3.org/2000/svg', tag), props, children);
}

function montar(el, props, children) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function icono(fn, opciones = {}) {
  const svg = fn({ size: 20, ...opciones });
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return svg;
}
