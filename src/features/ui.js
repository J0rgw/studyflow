// Piezas visuales compartidas (docs/design.md §7): marcas, anillos, cargador y estados.
// Todo se construye con h()/s(): ningun dato del plan se interpreta como HTML.
import { h, s, icono } from '../lib/dom.js';
import {
  InfoCircle, Formula, ClipboardCheck, SignalStream, Mobile, PenWriting, TestTube, Hourglass, Ban, CalendarX,
  Check, Stopwatch, HalfCheck, TimeFwd, AlertTriangle,
} from '../lib/icons.js';
import { formatoLargo, formatoMinutos } from '../lib/dates.js';
import { restriccionesDia, materiaPorId } from '../data/control.js';
import { NOMBRE_ESTADO, NOMBRE_RESULTADO } from '../data/progreso.js';

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

// Dentro del tramo previsto de cada materia, la parte trabajada (hasta su previsto) en solido.
function tramosTrabajo(segmentos, trabajado, total) {
  const porMateria = new Map(trabajado.map((t) => [t.materiaId, t.minutos]));
  const pct = (v) => `${Math.min(100, (v / total) * 100).toFixed(2)}%`;
  let acc = 0;
  const partes = [];
  for (const sg of segmentos) {
    const w = Math.min(sg.minutos, porMateria.get(sg.materiaId) ?? 0);
    partes.push(`var(--sf-${sg.materiaId}) ${pct(acc)} ${pct(acc + w)}`, `transparent ${pct(acc + w)} ${pct(acc + sg.minutos)}`);
    acc += sg.minutos;
  }
  partes.push(`transparent ${pct(acc)}`);
  return `linear-gradient(90deg, ${partes.join(', ')})`;
}

/**
 * Barra de marcas verticales (referencias Subida y Todo 1). Cada tramo es una materia.
 * `previsto` pinta el relleno tenue y `trabajado` ([{ materiaId, minutos }]) lo pinta solido
 * encima, dentro del tramo de su materia (design.md §5: previsto tenue, trabajado solido).
 */
export function barraMarcas(segmentos, total, { previsto = true, clase = '', trabajado = null } = {}) {
  return h('span', { class: `sf-ticks ${clase}`, 'aria-hidden': 'true' },
    h('span', { class: `sf-ticks__fill${previsto ? ' is-plan' : ''}`, style: `background: ${tramos(segmentos, total)}` }),
    trabajado && trabajado.length > 0
      && h('span', { class: 'sf-ticks__fill is-work', style: `background: ${tramosTrabajo(segmentos, trabajado, total)}` }));
}

/**
 * Marca de estado de una sesion (referencia Todo list 2): anillo punteado = pendiente; arco
 * solido = tiempo trabajado sobre el previsto (parcial, en curso con punto central); circulo
 * relleno con ✓ = completada; punto tenue = pospuesta. Toma el color de `--m`.
 */
export function marcaEstado(estado, fraccion = 0) {
  if (estado === 'completada') return h('span', { class: 'sf-st sf-st--done', 'aria-hidden': 'true' }, icono(Check, { size: 12 }));
  if (estado === 'pospuesta') return h('span', { class: 'sf-st sf-st--later', 'aria-hidden': 'true' });
  if (estado === 'pendiente') return h('span', { class: 'sf-st sf-st--todo', 'aria-hidden': 'true' });
  const r = 7.25;
  const c = 2 * Math.PI * r;
  const largo = Math.min(1, Math.max(0, fraccion)) * c;
  return s('svg', { class: `sf-st sf-st--arc${estado === 'en-curso' ? ' is-live' : ''}`, viewBox: '0 0 18 18', 'aria-hidden': 'true' },
    s('circle', { class: 'sf-st__track', cx: 9, cy: 9, r }),
    largo > 0.5 && s('circle', { class: 'sf-st__arc', cx: 9, cy: 9, r, 'stroke-dasharray': `${largo.toFixed(2)} ${c.toFixed(2)}` }),
    estado === 'en-curso' && s('circle', { class: 'sf-st__dot', cx: 9, cy: 9, r: 2.6 }));
}

const ICONO_ESTADO = { 'en-curso': Stopwatch, parcial: HalfCheck, completada: Check, pospuesta: TimeFwd };
const TONO_ESTADO = { 'en-curso': 'accent', parcial: 'neutro', completada: 'ok', pospuesta: 'warn' };

/** Etiqueta del estado de una sesion (null si esta pendiente: es lo normal y no se rotula). */
export function etiquetaEstado(estado) {
  if (!ICONO_ESTADO[estado]) return null;
  return etiqueta(NOMBRE_ESTADO[estado], { tono: TONO_ESTADO[estado], icon: ICONO_ESTADO[estado] });
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
 * marcas alineadas en radios. Solido = trabajado (`trabajo`, fraccion del total); tenue = previsto
 * hasta hoy (`fraccion`); gris = resto del plan; la marca de tinta senala hoy.
 */
export function anillosPlan(filas, { marcas = 60, hoy = true } = {}) {
  const out = [];
  filas.forEach((f, k) => {
    const exterior = 97 - k * 12;
    const interior = exterior - 8;
    const hechas = Math.min(marcas, Math.round(f.fraccion * marcas));
    const trabajadas = Math.min(marcas, Math.round((f.trabajo ?? 0) * marcas));
    const conMarca = hoy && hechas < marcas;
    for (let i = 0; i < marcas; i += 1) {
      if (conMarca && i === hechas) continue;
      const clase = i < trabajadas ? 'is-work' : i < hechas ? 'is-plan' : 'is-rest';
      out.push(s('line', {
        class: `sf-arc__tick ${clase}`, x1: 100, y1: 100 - exterior, x2: 100, y2: 100 - interior,
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

/**
 * Boton de accion destructiva sin modales: la primera pulsacion cambia el texto a la pregunta
 * durante unos segundos y solo la segunda ejecuta. `pregunta` puede ser una funcion (se evalua
 * al pulsar, p. ej. para mostrar los minutos de ese momento).
 */
export function botonConfirmar({
  id = null, texto, pregunta, onConfirmar, clase = 'button--ghost button--sm', disabled = false, etiqueta = null,
}) {
  let armado = null;
  const b = h('button', {
    id, type: 'button', class: `button ${clase} sf-confirm`, disabled, 'aria-label': etiqueta,
    onClick: () => {
      if (armado) { clearTimeout(armado); armado = null; onConfirmar(); return; }
      b.textContent = typeof pregunta === 'function' ? pregunta() : pregunta;
      b.classList.add('is-armed');
      armado = setTimeout(() => { armado = null; b.textContent = texto; b.classList.remove('is-armed'); }, 4000);
    },
  }, texto);
  return b;
}

const RIESGO = {
  'al-dia': { tono: 'ok', icon: Check },
  deficit: { tono: 'warn', icon: Hourglass },
  'deficit-cerca': { tono: 'danger', icon: AlertTriangle },
  pasado: { tono: 'neutro', icon: PenWriting },
};

/**
 * Riesgo descriptivo de una materia (resumenMaterias): deficit de tiempo y cercania del examen.
 * Nunca dice si se esta preparado: solo describe tiempo previsto sin trabajar.
 */
export function etiquetaRiesgo(m) {
  const r = RIESGO[m.riesgo] ?? RIESGO['al-dia'];
  const examen = m.diasExamen === 0 ? 'examen hoy' : `examen en ${m.diasExamen} d`;
  const texto = {
    'al-dia': 'Al día',
    deficit: `Déficit ${formatoMinutos(m.deficit)}`,
    'deficit-cerca': `Déficit ${formatoMinutos(m.deficit)} · ${examen}`,
    pasado: 'Examen hecho',
  }[m.riesgo] ?? 'Al día';
  return etiqueta(texto, { tono: r.tono, icon: r.icon });
}

const ICONO_RESULTADO = { logrado: Check, 'con-ayuda': HalfCheck, 'no-logrado': TimeFwd };

/** Resultado del objetivo (null si sin revisar). «Sin ayuda» es la unica marca verde (design.md §5). */
export function etiquetaResultado(resultado) {
  if (!ICONO_RESULTADO[resultado]) return null;
  return etiqueta(NOMBRE_RESULTADO[resultado], { tono: resultado === 'logrado' ? 'ok' : 'neutro', icon: ICONO_RESULTADO[resultado] });
}

/** Estado de una escritura: solo dice «Guardado» cuando Firestore lo ha confirmado. */
export function estadoGuardado(g, { ok = 'Guardado' } = {}) {
  if (!g) return null;
  if (g.estado === 'guardando') {
    return h('span', { class: 'sf-save', role: 'status' }, cargador('Guardando'), g.lento ? 'Sin confirmar · sin conexión' : 'Guardando…');
  }
  if (g.estado === 'ok') return h('span', { class: 'sf-save is-ok', role: 'status' }, icono(Check, { size: 14 }), ok);
  return h('span', { class: 'sf-save is-error', role: 'alert' }, g.mensaje);
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
