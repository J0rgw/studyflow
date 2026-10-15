import { Calendar, InfoCircle } from '../lib/icons.js';
import { h, icono } from '../lib/dom.js';
import { formatoLargo, formatoMinutos, diasEntre } from '../lib/dates.js';
import {
  MATERIAS, TOTAL_HORAS_PREVISTAS, PERIODO, restriccionesDia, proximoExamen, materiaPorId,
} from '../data/control.js';

function estadoPlan(plans) {
  if (plans.status === 'loading' || plans.status === 'idle') {
    return h('p', { class: 'sf-muted', role: 'status' }, 'Consultando el plan en Firestore…');
  }
  if (plans.status === 'error') {
    return h('div', { class: 'alert alert--danger', role: 'alert' },
      h('div', { class: 'alert__content' },
        h('p', { class: 'alert__title' }, 'No se pudo leer el plan'),
        h('p', { class: 'alert__description' }, plans.error)));
  }
  if (plans.items.length === 0) {
    return h('div', { class: 'sf-empty' },
      h('span', { class: 'sf-empty__icon' }, icono(InfoCircle, { size: 24 })),
      h('p', { class: 'sf-empty__title' }, 'Aún no hay ningún plan importado'),
      h('p', { class: 'sf-muted' },
        'Las sesiones de cada día saldrán del calendario maestro cuando lo importes (fase 2). Hasta entonces no se muestran sesiones ni horas trabajadas.'));
  }
  return h('p', {}, `Hay ${plans.items.length} plan(es) importado(s). Las sesiones diarias se mostrarán en la fase 2.`);
}

function restriccionHoy(hoy) {
  const r = restriccionesDia(hoy);
  if (!r.enPeriodo) {
    return h('p', { class: 'sf-muted' }, 'Hoy queda fuera del periodo de estudio (14/10 a 08/11/2026).');
  }
  if (r.bloqueado) return h('p', {}, h('span', { class: 'chip chip--danger' }, h('span', { class: 'chip__label' }, 'Día bloqueado')), ' Descanso: 0 h de estudio.');
  if (r.maxMin != null) return h('p', {}, h('span', { class: 'chip chip--warning' }, h('span', { class: 'chip__label' }, 'Límite')), ` Máximo ${formatoMinutos(r.maxMin)} efectivos hoy.`);
  return h('p', { class: 'sf-muted' }, 'Sin límites especiales hoy según los datos de control.');
}

function bloqueExamen(ahora) {
  const ex = proximoExamen(ahora.fecha, ahora.hora);
  if (!ex) return h('p', { class: 'sf-muted' }, 'No quedan exámenes en el periodo.');
  const m = materiaPorId(ex.materiaId);
  const dias = diasEntre(ahora.fecha, ex.fecha);
  const cuando = dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`;
  return h('div', { class: 'sf-stack-sm' },
    h('p', { class: 'sf-exam' },
      h('span', { class: `sf-dot sf-subject-${m.id}`, 'aria-hidden': 'true' }), h('strong', {}, m.nombre)),
    h('p', {}, `${formatoLargo(ex.fecha)}, ${ex.inicio}–${ex.fin} (${cuando})`));
}

function bloqueHoras() {
  return h('div', { class: 'sf-stack-sm' },
    h('p', { class: 'sf-muted' },
      `Horas previstas por materia (referencia del plan maestro, ${TOTAL_HORAS_PREVISTAS} h en total). Son horas planificadas, no trabajadas.`),
    h('ul', { class: 'sf-bars' }, MATERIAS.map((m) =>
      h('li', {},
        h('span', { class: 'sf-bars__label' }, h('span', { class: `sf-dot sf-subject-${m.id}`, 'aria-hidden': 'true' }), m.corto),
        h('span', { class: 'sf-bars__track', 'aria-hidden': 'true' },
          h('span', { class: `sf-bars__fill sf-subject-${m.id}`, style: `width:${(m.horas / 36) * 100}%` })),
        h('span', { class: 'sf-bars__value' }, `${m.horas} h`)))),
    h('p', { class: 'sf-muted' }, 'El tiempo realmente trabajado se registrará con el Pomodoro (fase 3).'));
}

export function vistaHoy({ ahora, plans }) {
  const enPeriodo = restriccionesDia(ahora.fecha).enPeriodo;
  return h('div', { class: 'sf-page' },
    h('header', { class: 'sf-page__head' },
      h('div', {},
        h('h1', {}, 'Hoy'),
        h('p', { class: 'sf-date' }, formatoLargo(ahora.fecha))),
      h('a', { class: 'button button--secondary', href: '#/calendario' }, icono(Calendar), 'Ver calendario')),
    h('div', { class: 'sf-grid' },
      h('section', { class: 'card sf-span-2', 'aria-labelledby': 'h-sesiones' },
        h('div', { class: 'card__header' }, h('h2', { id: 'h-sesiones', class: 'card__title' }, 'Sesiones de hoy')),
        h('div', { class: 'card__content sf-stack' }, estadoPlan(plans), enPeriodo && restriccionHoy(ahora.fecha))),
      h('section', { class: 'card', 'aria-labelledby': 'h-examen' },
        h('div', { class: 'card__header' }, h('h2', { id: 'h-examen', class: 'card__title' }, 'Próximo examen')),
        h('div', { class: 'card__content' }, bloqueExamen(ahora))),
      h('section', { class: 'card sf-span-3', 'aria-labelledby': 'h-horas' },
        h('div', { class: 'card__header' }, h('h2', { id: 'h-horas', class: 'card__title' }, 'Reparto previsto')),
        h('div', { class: 'card__content' }, bloqueHoras()))));
}
