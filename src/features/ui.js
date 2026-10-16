// Piezas visuales compartidas (docs/design.md §7): marcas, anillos, cargador y estados.
// Todo se construye con h()/s(): ningun dato del plan se interpreta como HTML.
import { h, s, icono } from '../lib/dom.js';
import {
  InfoCircle, Formula, ClipboardCheck, SignalStream, Mobile, PenWriting, TestTube, Hourglass, Ban, CalendarX,
} from '../lib/icons.js';
import { formatoLargo, formatoMinutos } from '../lib/dates.js';
import { restriccionesDia, materiaPorId } from '../data/control.js';

const ICONO_MATERIA = { algebra: Formula, requisitos: ClipboardCheck, tac: SignalStream, moviles: Mobile };

/** Descripcion completa de un dia para lectores de pantalla (bloqueos, limites, examenes, carga). */
export function descripcionDia(iso, minutos = 0) {
  const r = restriccionesDia(iso);
  const partes = [formatoLargo(iso)];
  if (r.bloqueado) partes.push('día bloqueado, 0 horas');
  else if (r.maxMin != null) partes.push(`máximo ${formatoMinutos(r.maxMin)}`);
  for (const e of r.examenes) partes.push(`examen de ${materiaPorId(e.materiaId).corto} a las ${e.inicio}`);
  if (minutos > 0) partes.push(`${formatoMinutos(minutos)} previstos`);
  return partes.join(', ');
}

/** Cargador 3x3 (referencia Carga, patron «ripple»). Solo anima opacidad. */
export function cargador(etiqueta = 'Cargando') {
  return h('span', { class: 'sf-loader', role: 'status', 'aria-label': etiqueta },
    Array.from({ length: 9 }, () => h('i', {})));
}

/** Logotipo: la misma rejilla 3x3, estatica. */
export function logo() {
  return h('span', { class: 'sf-logo', 'aria-hidden': 'true' }, Array.from({ length: 9 }, () => h('i', {})));
}

/** Icono identificador de una materia; toma el color de quien lo contiene (currentColor). */
export function iconoMateria(materiaId, opciones = {}) {
  return icono(ICONO_MATERIA[materiaId] ?? InfoCircle, { size: 14, weight: 'Filled', ...opciones });
}

/**
 * Etiqueta HeroUI (Tag) tintada con su color `--t` (materia o tono de estado). En lugar de un
 * punto generico lleva un icono Reicon del color pleno como identificador.
 */
export function etiqueta(texto, { materia = null, tono = materia ? 'materia' : 'neutro', icon = null } = {}) {
  return h('span', { class: `tag tag--md sf-tag sf-tag--${tono}`, style: materia ? `--t: var(--sf-${materia})` : null },
    materia && !icon ? iconoMateria(materia) : icono(icon ?? InfoCircle, { size: 14, weight: 'Filled' }),
    h('span', {}, texto));
}

/** Grupo de etiquetas HeroUI (TagGroup) como lista estatica; null si no queda ninguna. */
export function grupoEtiquetas(items, nombre = null) {
  const lista = items.flat(Infinity).filter(Boolean);
  if (lista.length === 0) return null;
  for (const t of lista) t.setAttribute('role', 'listitem');
  return h('div', { class: 'tag-group sf-tags' },
    h('div', { class: 'tag-group__list', role: 'list', 'aria-label': nombre }, lista));
}

export const etiquetaPrueba = () => etiqueta('Prueba', { tono: 'warn', icon: TestTube });

export const etiquetaExamen = (materiaId, texto) => etiqueta(texto, { materia: materiaId, icon: PenWriting });

/** Etiquetas de estado de un dia: fuera del periodo, bloqueado o con maximo de horas. */
export function etiquetasEstado(r) {
  return [
    !r.enPeriodo && etiqueta('Fuera del periodo', { icon: CalendarX }),
    r.bloqueado && etiqueta('Día bloqueado', { tono: 'danger', icon: Ban }),
    !r.bloqueado && r.maxMin != null && etiqueta(`Máx. ${formatoMinutos(r.maxMin)}`, { tono: 'warn', icon: Hourglass }),
  ];
}

/** Punto de color de una materia. */
export function punto(materiaId) {
  return h('span', { class: 'sf-dot', style: `--m: var(--sf-${materiaId})`, 'aria-hidden': 'true' });
}

// Paradas de un degradado duro con un tramo por materia, sobre `total` minutos.
function tramos(segmentos, total) {
  let acc = 0;
  const partes = segmentos.map((sg) => {
    const a = (acc / total) * 100;
    acc += sg.minutos;
    return `var(--sf-${sg.materiaId}) ${a.toFixed(2)}% ${Math.min(100, (acc / total) * 100).toFixed(2)}%`;
  });
  partes.push(`transparent ${Math.min(100, (acc / total) * 100).toFixed(2)}%`);
  return `linear-gradient(90deg, ${partes.join(', ')})`;
}

/**
 * Barra de marcas verticales (referencias Subida y Todo 1). Cada tramo es una materia.
 * `previsto` pinta el relleno tenue (design.md §5: previsto = pista tenue, trabajado = solido).
 */
export function barraMarcas(segmentos, total, { previsto = true, clase = '' } = {}) {
  return h('span', { class: `sf-ticks ${clase}`, 'aria-hidden': 'true' },
    h('span', { class: `sf-ticks__fill${previsto ? ' is-plan' : ''}`, style: `background: ${tramos(segmentos, total)}` }));
}

/** Barra de progreso de una operacion (guardado por lotes): marcas con relleno de acento. */
export function barraProgreso(fraccion, etiqueta) {
  return h('span', {
    class: 'sf-ticks sf-ticks--progress', role: 'progressbar', 'aria-label': etiqueta,
    'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(fraccion * 100),
    style: `--p: ${fraccion}`,
  }, h('span', { class: 'sf-ticks__fill' }));
}

/**
 * Anillo mini de un dia (referencia Dashboard, fila de dias): tramos por materia sobre `total` minutos.
 * Bloqueado: pista discontinua. Examen: punto central del color de la materia.
 */
export function anilloDia(segmentos, total, { bloqueado = false, examen = null } = {}) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const hueco = segmentos.length > 1 ? 1.4 : 0;
  let acc = 0;
  return s('svg', { class: `sf-ring${bloqueado ? ' is-blocked' : ''}`, viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    s('circle', { class: 'sf-ring__track', cx: 12, cy: 12, r }),
    segmentos.map((sg) => {
      const largo = Math.min(c - acc, (sg.minutos / total) * c);
      const el = s('circle', {
        class: 'sf-ring__seg', cx: 12, cy: 12, r, style: `stroke: var(--sf-${sg.materiaId})`,
        'stroke-dasharray': `${Math.max(0, largo - hueco).toFixed(2)} ${c.toFixed(2)}`, 'stroke-dashoffset': (-acc).toFixed(2),
      });
      acc += largo;
      return el;
    }),
    examen && s('circle', { class: 'sf-ring__exam', cx: 12, cy: 12, r: 3.2, style: `fill: var(--sf-${examen})` }));
}

/**
 * Anillos concentricos (referencia Dashboard «Arc»): uno por materia, de fuera adentro, con las
 * marcas alineadas en radios. Color tenue = previsto hasta hoy; gris = resto del plan; la marca de
 * tinta senala hoy. Cuando exista registro de tiempo, lo trabajado se pintara solido encima (fase 3).
 */
export function anillosPlan(filas, { marcas = 60, hoy = true } = {}) {
  const out = [];
  filas.forEach((f, k) => {
    const exterior = 97 - k * 12;
    const interior = exterior - 8;
    const hechas = Math.min(marcas, Math.round(f.fraccion * marcas));
    const conMarca = hoy && hechas < marcas;
    for (let i = 0; i < marcas; i += 1) {
      if (conMarca && i === hechas) continue;
      out.push(s('line', {
        class: `sf-arc__tick ${i < hechas ? 'is-plan' : 'is-rest'}`, x1: 100, y1: 100 - exterior, x2: 100, y2: 100 - interior,
        transform: `rotate(${((i / marcas) * 360).toFixed(2)} 100 100)`, style: `--m: var(--sf-${f.materiaId}); --i: ${i}`,
      }));
    }
    if (conMarca) {
      out.push(s('line', {
        class: 'sf-arc__now', x1: 100, y1: 100 - exterior - 2, x2: 100, y2: 100 - interior + 1,
        transform: `rotate(${((hechas / marcas) * 360).toFixed(2)} 100 100)`,
      }));
    }
  });
  return s('svg', { class: 'sf-arc', viewBox: '0 0 200 200', 'aria-hidden': 'true' }, out);
}

/** Estado vacio de una linea, con accion opcional. */
export function vacio(titulo, accion = null) {
  return h('div', { class: 'sf-empty' },
    h('span', { class: 'sf-empty__icon' }, icono(InfoCircle, { size: 20 })),
    h('p', { class: 'sf-empty__title' }, titulo),
    accion);
}

/** Filas esqueleto con brillo suave mientras Firestore responde. */
export function esqueleto(filas = 3) {
  return h('ul', { class: 'sf-skeleton', 'aria-hidden': 'true' },
    Array.from({ length: filas }, () => h('li', {},
      h('span', { class: 'sf-skel sf-skel--dot' }),
      h('span', { class: 'sf-skel-lines' }, h('span', { class: 'sf-skel sf-skel--l' }), h('span', { class: 'sf-skel sf-skel--s' })))));
}

/** Aviso de error (HeroUI alert) con texto honesto de una linea. */
export function aviso(titulo, descripcion, tono = 'danger') {
  return h('div', { class: `alert alert--${tono} sf-alert`, role: tono === 'danger' ? 'alert' : 'status' },
    h('div', { class: 'alert__content' },
      h('p', { class: 'alert__title' }, titulo),
      descripcion && h('p', { class: 'alert__description' }, descripcion)));
}
