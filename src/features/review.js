// Dudas y errores por materia: alta rapida (materia + texto), filtro por estado y una accion por
// duda para avanzar su estado (pendiente -> en repaso -> resuelta -> reabrir). Texto plano siempre.
import { Plus, MessageQuestion } from '../lib/icons.js';
import { h, icono } from '../lib/dom.js';
import { formatoCorto } from '../lib/dates.js';
import { MATERIAS, materiaPorId } from '../data/control.js';
import {
  MAX_DUDA, ESTADOS_DUDA, NOMBRE_ESTADO_DUDA, SIGUIENTE_ESTADO, ordenarDudas, contarDudas,
} from '../data/dudas.js';
import { selector } from './ajustes-foco.js';
import {
  iconoMateria, botonConfirmar, vacio, esqueleto, aviso, etiqueta, estadoGuardado,
} from './ui.js';

const ACCION = { pendiente: 'Repasar', 'en-repaso': 'Resolver', resuelta: 'Reabrir' };
const PLURAL = { pendiente: 'Pendientes', 'en-repaso': 'En repaso', resuelta: 'Resueltas' };

/**
 * Alta de una duda. Con `materiaFija` (desde una sesion) no se elige materia. Escribir no repinta:
 * solo se actualiza el boton. `clave` distingue el borrador (progreso o sesion).
 */
function formDuda({ clave, borrador, materiaFija, guardado, onBorrador, onAnadir }) {
  const materia = materiaFija ?? borrador.materiaId ?? null;
  const ocupado = guardado?.estado === 'guardando';
  const listo = (texto) => Boolean(materia) && texto.trim().length > 0 && !ocupado;
  const boton = h('button', {
    type: 'submit', class: 'button button--secondary button--sm', disabled: !listo(borrador.texto ?? ''),
  }, icono(Plus, { size: 16 }), 'Añadir');
  const campo = h('input', {
    id: `duda-${clave}`, class: 'input sf-doubtform__field', type: 'text', maxlength: MAX_DUDA, autocomplete: 'off',
    placeholder: 'Duda o error', 'aria-label': materiaFija ? 'Nueva duda de esta sesión' : 'Nueva duda',
    value: borrador.texto ?? '',
    onInput: (e) => { onBorrador({ ...borrador, texto: e.target.value }, { repintar: false }); boton.disabled = !listo(e.target.value); },
  });
  return h('form', {
    class: 'sf-doubtform',
    onSubmit: (e) => { e.preventDefault(); if (listo(campo.value)) onAnadir({ materiaId: materia, texto: campo.value }); },
  },
  !materiaFija && h('div', { class: 'tag-group sf-tags' },
    h('div', { class: 'tag-group__list', role: 'group', 'aria-label': 'Materia de la duda' },
      MATERIAS.map((m) => {
        const on = materia === m.id;
        return h('button', {
          id: `duda-${clave}-${m.id}`, type: 'button', class: 'tag tag--md sf-tag sf-tag--materia sf-tag--toggle',
          style: `--t: var(--sf-${m.id})`, 'aria-pressed': String(on),
          onClick: () => onBorrador({ ...borrador, texto: campo.value, materiaId: on ? null : m.id }),
        }, iconoMateria(m.id, { weight: on ? 'Filled' : 'Outline' }), m.corto);
      }))),
  h('div', { class: 'sf-doubtform__row' }, campo, boton),
  estadoGuardado(guardado));
}

function itemDuda(d, { sesiones, conEstado, guardado, onEstado, onBorrar }) {
  const m = materiaPorId(d.materiaId);
  const s = d.sesionId ? sesiones.find((x) => x.id === d.sesionId) : null;
  const siguiente = SIGUIENTE_ESTADO[d.estado] ?? 'en-repaso';
  const g = guardado.get(`duda:${d.id}`);
  return h('li', { class: `sf-doubt is-${d.estado}`, style: `--m: var(--sf-${d.materiaId})` },
    h('p', { class: 'sf-doubt__text' }, d.texto),
    h('p', { class: 'sf-doubt__meta' },
      conEstado && h('span', { class: 'sf-doubt__state' }, NOMBRE_ESTADO_DUDA[d.estado] ?? NOMBRE_ESTADO_DUDA.pendiente),
      h('span', {}, m?.corto ?? d.materiaId),
      d.fecha && h('span', {}, formatoCorto(d.fecha)),
      s && h('a', { href: `#/sesion/${s.id}` }, s.titulo)),
    h('div', { class: 'sf-doubt__actions' },
      h('button', {
        id: `duda-estado-${d.id}`, type: 'button', class: 'button button--ghost button--sm', disabled: g?.estado === 'guardando',
        'aria-label': `${ACCION[d.estado] ?? 'Repasar'}: ${d.texto}`, onClick: () => onEstado(d, siguiente),
      }, ACCION[d.estado] ?? 'Repasar'),
      botonConfirmar({ texto: 'Borrar', pregunta: '¿Borrar la duda?', onConfirmar: () => onBorrar(d), etiqueta: `Borrar: ${d.texto}` }),
      g?.estado === 'error' && estadoGuardado(g)));
}

/**
 * Tarjeta de dudas. En Progreso: todas, con filtro por estado y eleccion de materia. En una
 * sesion: solo las suyas, sin filtro (cada una con su estado) y con la materia de la sesion.
 */
export function tarjetaDudas({
  dudas, sesiones, filtro = 'pendiente', onFiltro = null, sesion = null, borradores = new Map(), guardado,
  onBorrador, onAnadir, onEstado, onBorrar,
}) {
  const clave = sesion ? `s-${sesion.id}` : 'todas';
  const borrador = borradores.get(clave) ?? {};
  const propias = sesion ? dudas.lista.filter((d) => d.sesionId === sesion.id) : dudas.lista;
  const cuenta = contarDudas(propias);
  const visibles = ordenarDudas(onFiltro ? propias.filter((d) => (ESTADOS_DUDA.includes(d.estado) ? d.estado : 'pendiente') === filtro) : propias);
  let cuerpo;
  if (dudas.status === 'idle' || dudas.status === 'loading') cuerpo = esqueleto(2);
  else if (dudas.status === 'error') cuerpo = aviso('No se pudieron leer las dudas', dudas.error);
  else if (visibles.length === 0) cuerpo = sesion && propias.length === 0 ? null : vacio(onFiltro ? `Sin dudas ${PLURAL[filtro].toLowerCase()}` : 'Sin dudas');
  else {
    cuerpo = h('ul', { class: 'sf-doubts' }, visibles.map((d) => itemDuda(d, {
      sesiones, conEstado: !onFiltro, guardado, onEstado, onBorrar,
    })));
  }
  return h('section', { class: 'sf-card sf-doubtcard', 'aria-labelledby': `h-dudas-${clave}` },
    h('div', { class: 'sf-card__head' },
      h('h2', { id: `h-dudas-${clave}`, class: 'sf-label' }, 'Dudas'),
      cuenta.pendiente > 0 && etiqueta(`${cuenta.pendiente} ${cuenta.pendiente === 1 ? 'pendiente' : 'pendientes'}`, { icon: MessageQuestion })),
    formDuda({
      clave, borrador, materiaFija: sesion?.materiaId ?? null, guardado: guardado.get(`duda-nueva:${clave}`),
      onBorrador: (b, opciones) => onBorrador(clave, b, opciones), onAnadir: (d) => onAnadir(clave, { ...d, sesionId: sesion?.id ?? null }),
    }),
    onFiltro && dudas.status === 'ready' && selector({
      nombre: 'filtro-dudas', leyenda: 'Estado de las dudas', actual: filtro, onCambio: onFiltro,
      opciones: ESTADOS_DUDA.map((e) => [e, `${PLURAL[e]} ${cuenta[e]}`]),
    }),
    cuerpo);
}
