// Tarjeta «Fecha» del detalle de sesion: reprogramacion siempre manual. Se elige un dia (o uno de
// los sugeridos, que solo rellenan el campo), se ven sus conflictos y se confirma con una segunda
// pulsacion. Los bloqueos (dia bloqueado, maximo del dia, examen, pasado) impiden mover; los
// avisos (carga habitual, otro examen ese dia) se muestran en la pregunta de confirmacion.
// Debajo, la auditoria de cambios de esa sesion.
import { CalendarEdit } from '../lib/icons.js';
import { h } from '../lib/dom.js';
import { formatoCorto, formatoMinutos, ahoraMadrid } from '../lib/dates.js';
import { cupoDia } from '../data/control.js';
import {
  comprobarMovimiento, diasSugeridos, primerDiaMovible, ultimoDiaMateria, cargaDia, MAX_MOTIVO,
} from '../data/reprogramacion.js';
import { botonConfirmar, estadoGuardado, etiqueta } from './ui.js';

const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);
// Dia de Madrid de una marca de tiempo del servidor (null mientras no llega).
const diaDe = (t) => (t && typeof t.toDate === 'function' ? ahoraMadrid(t.toDate()).fecha : null);

function conflictos(c) {
  if (!c || (c.bloqueos.length === 0 && c.avisos.length === 0)) return null;
  return h('ul', { class: 'sf-issues__list sf-move__issues' },
    c.bloqueos.map((b) => h('li', { class: 'is-error' }, b.mensaje)),
    c.avisos.map((a) => h('li', { class: 'is-warn' }, a.mensaje)));
}

function historial(eventos) {
  if (eventos.length === 0) return null;
  return h('div', { class: 'sf-move__history' },
    h('h3', { class: 'sf-label' }, 'Cambios'),
    h('ul', { class: 'sf-logs' }, eventos.map((e) => h('li', {},
      h('span', { class: 'sf-logs__when' }, `${formatoCorto(e.desde)} → ${formatoCorto(e.hasta)}`, e.motivo && ` · ${e.motivo}`),
      h('span', { class: 'sf-logs__state' }, e.avisos?.includes('CARGA') ? 'sobre la carga habitual' : ''),
      h('span', { class: 'sf-logs__state' }, diaDe(e.creadoEn) ? formatoCorto(diaDe(e.creadoEn)) : '')))));
}

export function tarjetaFecha(s, {
  sesiones, hoy, manual, historial: eventos, borrador = {}, guardado, onBorrador, onMover,
}) {
  const destino = borrador.destino ?? '';
  const ocupado = guardado?.estado === 'guardando';
  const c = destino ? comprobarMovimiento({ sesion: s, destino, sesiones, hoy, estado: manual }) : null;
  const original = s.fechaPlan ?? s.fecha;
  const volver = s.movida ? comprobarMovimiento({ sesion: s, destino: original, sesiones, hoy, estado: manual }) : null;
  const completada = manual === 'completada';
  const sugeridos = completada ? [] : diasSugeridos({ sesion: s, sesiones, hoy });
  const cupo = cupoDia(s.fecha);
  const carga = cargaDia(sesiones, s.fecha);
  const min = primerDiaMovible(hoy);
  const max = ultimoDiaMateria(s.materiaId);
  const motivo = h('input', {
    id: `motivo-${s.id}`, class: 'input sf-move__reason', type: 'text', maxlength: MAX_MOTIVO, autocomplete: 'off',
    placeholder: 'Motivo (opcional)', 'aria-label': 'Motivo del cambio (opcional)', value: borrador.motivo ?? '', disabled: completada,
    onInput: (e) => onBorrador(s, { ...borrador, motivo: e.target.value }, { repintar: false }),
  });
  const mover = (fecha, avisos) => onMover(s, { destino: fecha, motivo: motivo.value, avisos: avisos.map((a) => a.codigo) });

  return h('section', { class: 'sf-card sf-movecard', 'aria-labelledby': 'h-fecha' },
    h('div', { class: 'sf-card__head' },
      h('h2', { id: 'h-fecha', class: 'sf-label' }, 'Fecha'),
      s.movida && etiqueta(`Plan: ${formatoCorto(original)}`, { icon: CalendarEdit }),
      estadoGuardado(guardado, { ok: 'Movida' })),
    h('p', { class: 'sf-move__now' },
      h('span', { class: 'sf-move__date' }, capitalizar(formatoCorto(s.fecha))),
      cupo.tipo !== 'fuera' && cupo.tipo !== 'bloqueado' && h('span', { class: 'sf-caption' }, `${formatoMinutos(carga)} de ${formatoMinutos(cupo.minutos)} ese día`)),
    completada
      ? h('p', { class: 'sf-caption' }, 'Completada: no se reprograma.')
      : [
        h('div', { class: 'sf-move__pick' },
          h('label', { class: 'sf-numfield', for: `mover-${s.id}` },
            h('span', { class: 'sf-numfield__label' }, 'Mover a'),
            h('input', {
              id: `mover-${s.id}`, class: 'input sf-move__input', type: 'date', min, max: max >= min ? max : min, value: destino,
              disabled: ocupado, onChange: (e) => onBorrador(s, { ...borrador, destino: e.target.value, motivo: motivo.value }),
            })),
          sugeridos.length > 0 && h('div', { class: 'tag-group sf-tags' },
            h('div', { class: 'tag-group__list', role: 'group', 'aria-label': 'Días con hueco' },
              sugeridos.map((d) => h('button', {
                id: `sugerido-${s.id}-${d.fecha}`, type: 'button', class: 'tag tag--md sf-tag sf-tag--toggle',
                'aria-pressed': String(destino === d.fecha), 'aria-label': `${formatoCorto(d.fecha)}, ${formatoMinutos(d.libre)} libres`,
                onClick: () => onBorrador(s, { ...borrador, destino: d.fecha, motivo: motivo.value }),
              }, formatoCorto(d.fecha)))))),
        c && c.cupo && h('p', { class: `sf-move__load${c.carga > c.cupo.minutos ? ' is-over' : ''}` },
          `Quedaría en ${formatoMinutos(c.carga)} de ${formatoMinutos(c.cupo.minutos)}`),
        conflictos(c),
        motivo,
        h('div', { class: 'sf-actions' },
          botonConfirmar({
            id: `mover-ok-${s.id}`, clase: 'button--primary button--sm', disabled: !c?.ok || ocupado,
            texto: destino && c?.ok ? `Mover a ${formatoCorto(destino)}` : 'Mover',
            pregunta: () => (c.avisos.length > 0
              ? `¿Mover igualmente? ${c.avisos.map((a) => a.mensaje).join(' ')}`
              : `¿Mover ${formatoMinutos(s.minutos)} al ${formatoCorto(destino)}?`),
            onConfirmar: () => mover(destino, c.avisos),
          }),
          s.movida && h('span', { class: 'sf-move__undo' },
            botonConfirmar({
              id: `volver-${s.id}`, disabled: !volver.ok || ocupado, texto: `Volver al ${formatoCorto(original)}`,
              pregunta: '¿Devolverla a su fecha del plan?', onConfirmar: () => mover(original, volver.avisos),
            }),
            !volver.ok && h('span', { class: 'sf-caption' }, volver.bloqueos[0]?.mensaje))),
      ],
    historial(eventos));
}
