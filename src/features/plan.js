// Vista Plan: arbol materia > tema > sesion (referencia «Nested navigation»), plegable con <details>.
import { h } from '../lib/dom.js';
import { formatoMinutos, formatoCorto } from '../lib/dates.js';
import { arbolPlan } from '../data/sesiones.js';
import { vacio, esqueleto, aviso, etiquetaPrueba, iconoMateria } from './ui.js';

// Ramas abiertas: sobreviven a los re-render mientras la pestaña siga abierta (no se guardan).
const abiertos = new Set();
let inicializado = false;

function rama(clave, clase, resumen, contenido) {
  return h('details', {
    class: clase, open: abiertos.has(clave),
    onToggle: (e) => { if (e.currentTarget.open) abiertos.add(clave); else abiertos.delete(clave); },
  }, resumen, contenido);
}

function hoja(s, hoy, i) {
  return h('li', { class: `sf-leaf${s.fecha === hoy ? ' is-today' : ''}${s.fecha < hoy ? ' is-past' : ''}`, style: `--i: ${i}` },
    h('span', { class: 'sf-leaf__dot', 'aria-hidden': 'true' }),
    h('span', { class: 'sf-leaf__date' }, formatoCorto(s.fecha)),
    h('span', { class: 'sf-leaf__title' }, h('a', { class: 'sf-leaf__link', href: `#/sesion/${s.id}` }, s.titulo), s.prueba && etiquetaPrueba()),
    h('span', { class: 'sf-leaf__min' }, formatoMinutos(s.minutos)));
}

function arbol(grupos, hoy) {
  if (!inicializado) {
    // Primera vez: materias abiertas y, dentro, solo los temas con sesion hoy.
    inicializado = true;
    for (const g of grupos) {
      abiertos.add(g.materia.id);
      for (const t of g.temas) if (t.sesiones.some((s) => s.fecha === hoy)) abiertos.add(`${g.materia.id}/${t.tema}`);
    }
  }
  // Una sola lista, como la barra lateral de la referencia.
  return h('div', { class: 'sf-card sf-tree' }, grupos.map((g) => materia(g, hoy)));
}

// Tema actual segun el plan: el que tiene sesion hoy o, si no, el ultimo empezado.
// La pista vertical llega hasta el (en la referencia va del primer hijo al seleccionado).
function temaActual(temas, hoy) {
  const conHoy = temas.findIndex((t) => t.sesiones.some((s) => s.fecha === hoy));
  if (conHoy !== -1) return conHoy;
  let ultimo = -1;
  temas.forEach((t, i) => { if (t.sesiones[0].fecha <= hoy) ultimo = i; });
  return ultimo;
}

function materia(g, hoy) {
  const id = g.materia.id;
  const actual = temaActual(g.temas, hoy);
  const resumen = h('summary', { class: 'sf-tree__sum', style: `--m: var(--sf-${id})` },
    h('span', { class: 'sf-tree__icon', 'aria-hidden': 'true' }, iconoMateria(id, { size: 18 })),
    h('span', { class: 'sf-tree__name' }, g.materia.nombre),
    h('span', { class: 'sf-tree__meta' }, `${g.total} · ${formatoMinutos(g.minutos)}`),
    h('span', { class: 'sf-chev', 'aria-hidden': 'true' }));
  const temas = h('div', { class: 'sf-tree__topics', style: `--m: var(--sf-${id})` },
    g.temas.map((t, i) => tema(id, t, hoy, i, actual)));
  return rama(id, 'sf-tree__subject', resumen, temas);
}

function tema(materiaId, t, hoy, i, actual) {
  const clases = ['sf-tree__topic'];
  if (i <= actual) clases.push('is-rail');
  if (i === 0) clases.push('is-first');
  if (i === actual) clases.push('is-current');
  const resumen = h('summary', { class: 'sf-tree__tsum' },
    h('span', { class: 'sf-tree__tdot', 'aria-hidden': 'true' }),
    h('span', { class: 'sf-tree__tname' }, t.tema || 'Sin tema'),
    h('span', { class: 'sf-tree__meta' }, `${t.sesiones.length} · ${formatoMinutos(t.minutos)}`),
    h('span', { class: 'sf-chev', 'aria-hidden': 'true' }));
  const hojas = h('ul', { class: 'sf-tree__leaves' }, t.sesiones.map((s, k) => hoja(s, hoy, k)));
  const nodo = rama(`${materiaId}/${t.tema}`, clases.join(' '), resumen, hojas);
  nodo.style.setProperty('--i', i);
  return nodo;
}

export function vistaPlan({ datos, hoy }) {
  const listo = datos.status === 'ready';
  const grupos = listo ? arbolPlan(datos.sesiones) : [];
  const total = grupos.reduce((t, g) => t + g.minutos, 0);
  let cuerpo;
  if (datos.status === 'idle' || datos.status === 'loading') cuerpo = h('div', { class: 'sf-card', 'aria-busy': 'true' }, esqueleto(4));
  else if (datos.status === 'error') cuerpo = aviso('No se pudo cargar', datos.error);
  else if (grupos.length === 0) {
    cuerpo = h('div', { class: 'sf-card' }, vacio('Sin plan importado', h('a', { class: 'button button--secondary button--sm', href: '#/datos' }, 'Importar plan')));
  } else cuerpo = arbol(grupos, hoy);
  return h('div', { class: 'sf-page' },
    h('header', { class: 'sf-head' },
      h('div', {},
        h('p', { class: 'sf-eyebrow' }, listo && grupos.length > 0
          ? `${grupos.reduce((n, g) => n + g.total, 0)} sesiones · ${formatoMinutos(total)}` : 'Asignaturas'),
        h('h1', {}, 'Plan'))),
    cuerpo);
}
