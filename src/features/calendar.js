import { ChevronLeft, ChevronRight } from '../lib/icons.js';
import { h, icono } from '../lib/dom.js';
import {
  cuadriculaMes, nombreMes, formatoLargo, formatoMinutos, sumarMeses,
} from '../lib/dates.js';
import { MATERIAS, restriccionesDia, materiaPorId } from '../data/control.js';

const DIAS = [['L', 'lunes'], ['M', 'martes'], ['X', 'miércoles'], ['J', 'jueves'], ['V', 'viernes'], ['S', 'sábado'], ['D', 'domingo']];

export function descripcionDia(iso) {
  const r = restriccionesDia(iso);
  const partes = [formatoLargo(iso)];
  if (r.bloqueado) partes.push('día bloqueado, 0 horas');
  else if (r.maxMin != null) partes.push(`máximo ${formatoMinutos(r.maxMin)}`);
  for (const e of r.examenes) partes.push(`examen de ${materiaPorId(e.materiaId).corto} a las ${e.inicio}`);
  return partes.join(', ');
}

function celda(dia, { seleccionado, hoy }, onSelect) {
  const r = restriccionesDia(dia.iso);
  const clases = ['sf-day'];
  if (!dia.delMes) clases.push('sf-day--fuera');
  if (r.enPeriodo) clases.push('sf-day--periodo');
  if (r.bloqueado) clases.push('sf-day--bloqueado');
  if (dia.iso === seleccionado) clases.push('sf-day--sel');
  if (dia.iso === hoy) clases.push('sf-day--hoy');
  return h('td', {},
    h('button', {
      type: 'button', class: clases.join(' '), 'aria-label': descripcionDia(dia.iso),
      'aria-pressed': dia.iso === seleccionado ? 'true' : 'false',
      'aria-current': dia.iso === hoy ? 'date' : null,
      onClick: () => onSelect(dia.iso),
    },
      h('span', { class: 'sf-day__num' }, dia.dia),
      r.bloqueado && h('span', { class: 'sf-day__tag' }, 'Bloqueado'),
      !r.bloqueado && r.maxMin != null && h('span', { class: 'sf-day__tag' }, `máx. ${formatoMinutos(r.maxMin)}`),
      r.examenes.length > 0 && h('span', { class: 'sf-day__exams' },
        r.examenes.map((e) => h('span', { class: `sf-dot sf-subject-${e.materiaId}`, title: `Examen ${materiaPorId(e.materiaId).corto}` })),
        h('span', { class: 'sf-day__tag' }, 'Examen')),
    ));
}

function panelDia(iso) {
  const r = restriccionesDia(iso);
  return h('section', { class: 'card', 'aria-labelledby': 'cal-dia', 'aria-live': 'polite' },
    h('div', { class: 'card__header' }, h('h2', { id: 'cal-dia', class: 'card__title' }, formatoLargo(iso))),
    h('div', { class: 'card__content sf-stack' },
      r.bloqueado && h('p', {}, h('span', { class: 'chip chip--danger' }, h('span', { class: 'chip__label' }, 'Día bloqueado')), ' Descanso: 0 h de estudio.'),
      !r.bloqueado && r.maxMin != null && h('p', {}, h('span', { class: 'chip chip--warning' }, h('span', { class: 'chip__label' }, 'Límite')), ` Máximo ${formatoMinutos(r.maxMin)} efectivos.`),
      !r.enPeriodo && h('p', { class: 'sf-muted' }, 'Fuera del periodo de estudio (14/10 a 08/11/2026).'),
      r.examenes.length > 0 && h('div', { class: 'sf-stack-sm' },
        h('h3', {}, 'Exámenes'),
        h('ul', { class: 'sf-list' }, r.examenes.map((e) => {
          const m = materiaPorId(e.materiaId);
          return h('li', {}, h('span', { class: `sf-dot sf-subject-${m.id}`, 'aria-hidden': 'true' }), `${m.nombre}, ${e.inicio}–${e.fin}`);
        })),
        h('p', { class: 'sf-muted' }, 'Las horas de examen no se cuentan como tiempo estudiado.')),
      h('div', { class: 'sf-stack-sm' },
        h('h3', {}, 'Sesiones'),
        h('p', { class: 'sf-muted' }, 'Sin sesiones: el calendario maestro todavía no está importado (fase 2). No se inventan sesiones ni horas de comienzo.'))));
}

export function vistaCalendario({ mes, seleccionado, hoy, onSelect, onMes }) {
  const semanas = cuadriculaMes(mes.y, mes.m);
  const ant = sumarMeses(mes.y, mes.m, -1);
  const sig = sumarMeses(mes.y, mes.m, 1);
  return h('div', { class: 'sf-page' },
    h('header', { class: 'sf-page__head' }, h('h1', {}, 'Calendario')),
    h('div', { class: 'sf-cal-layout' },
      h('section', { class: 'card', 'aria-labelledby': 'cal-mes' },
        h('div', { class: 'sf-cal-nav' },
          h('button', { type: 'button', class: 'button button--ghost button--icon-only', 'aria-label': 'Mes anterior', onClick: () => onMes(ant) }, icono(ChevronLeft)),
          h('h2', { id: 'cal-mes', class: 'sf-cal-nav__title' }, nombreMes(mes.y, mes.m)),
          h('button', { type: 'button', class: 'button button--ghost button--icon-only', 'aria-label': 'Mes siguiente', onClick: () => onMes(sig) }, icono(ChevronRight))),
        h('table', { class: 'sf-cal' },
          h('thead', {}, h('tr', {}, DIAS.map(([c, n]) => h('th', { scope: 'col' }, h('abbr', { title: n }, c))))),
          h('tbody', {}, semanas.map((s) => h('tr', {}, s.map((d) => celda(d, { seleccionado, hoy }, onSelect)))))),
        h('ul', { class: 'sf-legend' },
          MATERIAS.map((m) => h('li', {}, h('span', { class: `sf-dot sf-subject-${m.id}`, 'aria-hidden': 'true' }), m.corto)),
          h('li', {}, h('span', { class: 'sf-swatch sf-swatch--bloqueado', 'aria-hidden': 'true' }), 'Bloqueado'),
          h('li', {}, h('span', { class: 'sf-swatch sf-swatch--periodo', 'aria-hidden': 'true' }), 'Periodo de estudio'))),
      panelDia(seleccionado)));
}
