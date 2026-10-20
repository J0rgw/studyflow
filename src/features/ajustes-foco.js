// Controles del temporizador compartidos por el detalle de sesion y el foco libre: selector
// segmentado (radios nativos sobre ToggleButtonGroup de HeroUI), campos de minutos, pausa larga
// plegable y materia opcional del foco libre.
import { h } from '../lib/dom.js';
import { MATERIAS } from '../data/control.js';
import { LIMITES } from '../data/pomodoro.js';
import { iconoMateria } from './ui.js';

// «Pausa larga» abierta o cerrada: sobrevive a los re-render mientras la pestaña siga abierta.
let pausaLargaAbierta = false;

export const OPCIONES_MODO = Object.freeze([['25-5', '25/5'], ['50-10', '50/10'], ['libre', 'Libre']]);

export function selector({ nombre, leyenda, opciones, actual, onCambio, deshabilitado = false }) {
  return h('fieldset', { class: 'sf-seg', disabled: deshabilitado },
    h('legend', { class: 'sf-sr' }, leyenda),
    h('div', { class: 'toggle-button-group toggle-button-group--horizontal sf-seg__group' },
      opciones.map(([valor, texto]) => h('label', { class: 'toggle-button toggle-button--sm sf-seg__opt' },
        h('input', {
          id: `${nombre}-${valor}`, type: 'radio', name: nombre, value: valor, class: 'sf-seg__input',
          checked: actual === valor, onChange: () => onCambio(valor),
        }),
        texto))));
}

export function campoMinutos(id, texto, valor, [min, max], aplicar, sufijo = 'min') {
  return h('label', { class: 'sf-numfield', for: id },
    h('span', { class: 'sf-numfield__label' }, texto),
    h('input', {
      id, class: 'input sf-numfield__input', type: 'number', inputmode: 'numeric', min, max, step: 1, value: valor,
      onChange: (e) => aplicar(Number(e.target.value)),
    }),
    h('span', { class: 'sf-numfield__unit' }, sufijo));
}

/**
 * Modo (25/5, 50/10, Libre), duraciones del modo libre y pausa larga. `modo` puede ser el de una
 * sesion (onModo lo guarda en ella); las duraciones y la pausa larga son siempre las generales.
 */
export function controlesTemporizador({ nombre, modo, onModo, ajustes, onAjustes, deshabilitado = false }) {
  const cambiar = (parcial) => onAjustes({ ...ajustes, ...parcial });
  return [
    selector({ nombre, leyenda: 'Modo del temporizador', actual: modo, deshabilitado, opciones: OPCIONES_MODO, onCambio: onModo }),
    modo === 'libre' && h('div', { class: 'sf-numfields' },
      campoMinutos(`${nombre}-libre-foco`, 'Foco', ajustes.libre.foco, LIMITES.foco, (v) => cambiar({ libre: { ...ajustes.libre, foco: v } })),
      campoMinutos(`${nombre}-libre-descanso`, 'Descanso', ajustes.libre.descanso, LIMITES.descanso,
        (v) => cambiar({ libre: { ...ajustes.libre, descanso: v } }))),
    h('details', { class: 'sf-more', open: pausaLargaAbierta, onToggle: (e) => { pausaLargaAbierta = e.currentTarget.open; } },
      h('summary', {}, `Pausa larga · ${ajustes.largo} min cada ${ajustes.cada}`, h('span', { class: 'sf-chev', 'aria-hidden': 'true' })),
      h('div', { class: 'sf-numfields' },
        campoMinutos(`${nombre}-largo-min`, 'Duración', ajustes.largo, LIMITES.largo, (v) => cambiar({ largo: v })),
        campoMinutos(`${nombre}-largo-cada`, 'Cada', ajustes.cada, LIMITES.cada, (v) => cambiar({ cada: v }), 'focos'))),
  ];
}

/** Materia opcional del foco libre: etiquetas seleccionables; pulsar la elegida la quita. */
export function selectorMateria(actual, onMateria) {
  return h('div', { class: 'tag-group sf-tags' },
    h('div', { class: 'tag-group__list', role: 'group', 'aria-label': 'Materia del foco libre (opcional)' },
      MATERIAS.map((m) => {
        const on = actual === m.id;
        return h('button', {
          id: `libre-materia-${m.id}`, type: 'button', class: 'tag tag--lg sf-tag sf-tag--materia sf-tag--toggle',
          style: `--t: var(--sf-${m.id})`, 'aria-pressed': String(on), onClick: () => onMateria(on ? null : m.id),
        }, iconoMateria(m.id, { weight: on ? 'Filled' : 'Outline' }), m.corto);
      })));
}
