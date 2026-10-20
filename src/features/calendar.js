// Vista Calendario (referencia «Calendar Task Manager»): mes con marcas por materia, filtros,
// lista del dia con barra de color y vista agenda con baldosas de fecha.
import { ChevronLeft, ChevronRight, Calendar, List, Close } from '../lib/icons.js';
import { h, icono } from '../lib/dom.js';
import {
  cuadriculaMes, nombreMes, formatoMedio, formatoCorto, formatoMinutos, sumarMeses, rangoFechas, diasEntre,
} from '../lib/dates.js';
import {
  MATERIAS, PERIODO, restriccionesDia, materiaPorId, examenesPendientes, cupoDia,
} from '../data/control.js';
import { sesionesDelDia, minutosDelDia, minutosPorMateria } from '../data/sesiones.js';
import {
  vacio, esqueleto, aviso, descripcionDia, etiqueta, grupoEtiquetas, etiquetaPrueba, etiquetaExamen, etiquetasEstado, iconoMateria,
} from './ui.js';

const DIAS = [['L', 'lunes'], ['M', 'martes'], ['X', 'miércoles'], ['J', 'jueves'], ['V', 'viernes'], ['S', 'sábado'], ['D', 'domingo']];
const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const cargando = (datos) => datos.status === 'idle' || datos.status === 'loading';

// Filtros por materia (chips de la referencia) como TagGroup de HeroUI con seleccion multiple:
// activos tintados con el icono relleno y ✕; inactivos solo contorno.
function filtros(filtro, onFiltro) {
  return h('div', { class: 'tag-group sf-tags' },
    h('div', { class: 'tag-group__list', role: 'group', 'aria-label': 'Materias visibles' },
      MATERIAS.map((m) => {
        const on = filtro.has(m.id);
        return h('button', {
          type: 'button', class: 'tag tag--lg sf-tag sf-tag--materia sf-tag--toggle', style: `--t: var(--sf-${m.id})`,
          'aria-pressed': String(on), onClick: () => onFiltro(m.id),
        }, iconoMateria(m.id, { weight: on ? 'Filled' : 'Outline' }), m.corto,
        on && icono(Close, { size: 14, className: 'sf-tag__x' }));
      })));
}

function celda(dia, { seleccionado, hoy, sesiones, filtro }, onSelect) {
  const r = restriccionesDia(dia.iso);
  const materias = minutosPorMateria(sesiones, dia.iso);
  const examenes = r.examenes.filter((e) => filtro.has(e.materiaId));
  const clases = ['sf-day'];
  if (!dia.delMes) clases.push('sf-day--fuera');
  else if (!r.enPeriodo) clases.push('sf-day--off');
  if (r.bloqueado) clases.push('sf-day--bloqueado');
  if (dia.iso === seleccionado) clases.push('sf-day--sel');
  if (dia.iso === hoy) clases.push('sf-day--hoy');
  return h('td', {},
    h('button', {
      type: 'button', class: clases.join(' '), 'aria-label': descripcionDia(dia.iso, minutosDelDia(sesiones, dia.iso)),
      'aria-pressed': dia.iso === seleccionado ? 'true' : 'false',
      'aria-current': dia.iso === hoy ? 'date' : null,
      onClick: () => onSelect(dia.iso),
    },
    // Como en la referencia, numero y rayas comparten circulo (relleno en el dia elegido).
    h('span', { class: 'sf-day__in' },
      h('span', { class: 'sf-day__num' }, dia.dia),
      // Una raya por materia con sesiones; un punto por examen (forma distinta = evento con hora).
      h('span', { class: 'sf-day__marks', 'aria-hidden': 'true' },
        materias.map((x) => h('i', { class: 'sf-mark', style: `--m: var(--sf-${x.materiaId})` })),
        examenes.map((e) => h('i', { class: 'sf-mark sf-mark--exam', style: `--m: var(--sf-${e.materiaId})` }))))));
}

// Evento de la lista: barra lateral + etiqueta del color de la materia + titulo (referencia).
function evento({ materiaId, marca, titulo, meta, prueba, examen, href = null }) {
  return h('li', { class: `sf-event${examen ? ' is-exam' : ''}`, style: `--m: var(--sf-${materiaId})` },
    h('div', { class: 'sf-event__label' }, marca),
    h('p', { class: 'sf-event__title' }, href ? h('a', { class: 'sf-event__link', href }, titulo) : titulo, prueba && etiquetaPrueba()),
    meta && h('p', { class: 'sf-event__meta' }, meta));
}

function eventosDia(iso, sesiones, filtro) {
  return [
    ...restriccionesDia(iso).examenes.filter((e) => filtro.has(e.materiaId)).map((e) => evento({
      materiaId: e.materiaId, examen: true, marca: etiquetaExamen(e.materiaId, `Examen · ${e.inicio}–${e.fin}`),
      titulo: materiaPorId(e.materiaId).nombre,
    })),
    ...sesionesDelDia(sesiones, iso).map((s) => evento({
      materiaId: s.materiaId,
      marca: etiqueta(`${materiaPorId(s.materiaId)?.corto ?? s.materiaId} · ${formatoMinutos(s.minutos)}`, { materia: s.materiaId }),
      titulo: s.titulo, meta: s.movida ? `${s.tema} · desde ${formatoCorto(s.fechaPlan)}` : s.tema, prueba: s.prueba, href: `#/sesion/${s.id}`,
    })),
  ];
}

// Dias que faltan para cada examen vistos desde el dia elegido (los de ese mismo dia ya son eventos).
function faltanExamenes(iso, filtro) {
  const proximos = examenesPendientes(iso, '00:00').filter((e) => filtro.has(e.materiaId) && e.fecha > iso);
  if (proximos.length === 0) return null;
  return h('div', { class: 'sf-daypanel__exams' },
    h('h3', { class: 'sf-label' }, 'Exámenes'),
    grupoEtiquetas(proximos.map((e) => {
      const d = diasEntre(iso, e.fecha);
      return etiquetaExamen(e.materiaId, `${materiaPorId(e.materiaId).corto} · ${d} d`);
    }), `Días hasta cada examen desde el ${formatoMedio(iso)}`));
}

function estadoDatos(datos, filas = 2) {
  if (cargando(datos)) return esqueleto(filas);
  if (datos.status === 'error') return aviso('No se pudo cargar', datos.error);
  if (datos.sesiones.length === 0) return vacio('Sin plan importado', h('a', { class: 'button button--secondary button--sm', href: '#/datos' }, 'Importar plan'));
  return null;
}

function panelDia(iso, datos, sesiones, filtro) {
  const r = restriccionesDia(iso);
  const eventos = datos.status === 'ready' ? eventosDia(iso, sesiones, filtro) : [];
  const total = minutosDelDia(sesiones, iso);
  const cupo = cupoDia(iso);
  const cuerpo = estadoDatos(datos)
    ?? (eventos.length > 0 ? h('ul', { class: 'sf-events' }, eventos) : vacio(r.bloqueado ? 'Día bloqueado' : 'Sin sesiones'));
  return h('section', { class: 'sf-card sf-daypanel', 'aria-labelledby': 'cal-dia', 'aria-live': 'polite' },
    h('div', { class: 'sf-card__head' },
      h('h2', { id: 'cal-dia', class: 'sf-daypanel__title' }, capitalizar(formatoMedio(iso))),
      // Carga del dia frente a su cupo (maximo o carga habitual): ayuda al reprogramar.
      total > 0 && h('span', { class: `sf-daypanel__total${cupo.minutos > 0 && total > cupo.minutos ? ' is-over' : ''}` },
        formatoMinutos(total), cupo.minutos > 0 && h('span', { class: 'sf-daypanel__cap' }, ` / ${formatoMinutos(cupo.minutos)}`))),
    grupoEtiquetas(etiquetasEstado(r), 'Estado del día'),
    cuerpo,
    faltanExamenes(iso, filtro));
}

function mes({ mes: m, seleccionado, hoy, datos, sesiones, filtro, onSelect, onMes, onFiltro }) {
  const ant = sumarMeses(m.y, m.m, -1);
  const sig = sumarMeses(m.y, m.m, 1);
  return h('div', { class: 'sf-cal-layout' },
    h('section', { class: 'sf-card sf-month', 'aria-labelledby': 'cal-mes' },
      filtros(filtro, onFiltro),
      h('div', { class: 'sf-monthnav' },
        h('button', { type: 'button', class: 'sf-square', 'aria-label': 'Mes anterior', onClick: () => onMes(ant) }, icono(ChevronLeft, { size: 18 })),
        h('h2', { id: 'cal-mes', class: 'sf-monthnav__title' }, nombreMes(m.y, m.m)),
        h('button', { type: 'button', class: 'sf-square', 'aria-label': 'Mes siguiente', onClick: () => onMes(sig) }, icono(ChevronRight, { size: 18 }))),
      h('table', { class: 'sf-cal' },
        h('thead', {}, h('tr', {}, DIAS.map(([c, n]) => h('th', { scope: 'col' }, h('abbr', { title: n }, c))))),
        h('tbody', {}, cuadriculaMes(m.y, m.m).map((s) => h('tr', {},
          s.map((d) => celda(d, { seleccionado, hoy, sesiones, filtro }, onSelect)))))),
      h('ul', { class: 'sf-legend' },
        h('li', {}, h('i', { class: 'sf-mark sf-mark--legend', 'aria-hidden': 'true' }), 'Sesiones'),
        h('li', {}, h('i', { class: 'sf-mark sf-mark--exam sf-mark--legend', 'aria-hidden': 'true' }), 'Examen'),
        h('li', {}, h('span', { class: 'sf-swatch sf-swatch--bloqueado', 'aria-hidden': 'true' }), 'Bloqueado'))),
    panelDia(seleccionado, datos, sesiones, filtro));
}

// Vista agenda (tercera pantalla de la referencia): baldosa de fecha + eventos del dia.
function agenda({ seleccionado, hoy, datos, sesiones, filtro, onSelect, onFiltro }) {
  const desde = hoy >= PERIODO.inicio && hoy <= PERIODO.fin ? hoy : PERIODO.inicio;
  const estado = estadoDatos(datos, 4);
  return h('section', { class: 'sf-card sf-agenda-card', 'aria-label': 'Agenda del periodo' },
    filtros(filtro, onFiltro),
    estado ?? h('ul', { class: 'sf-agenda' }, rangoFechas(desde, PERIODO.fin).map((iso) => {
      const r = restriccionesDia(iso);
      const eventos = eventosDia(iso, sesiones, filtro);
      const clases = ['sf-agenda__day'];
      if (iso === seleccionado) clases.push('is-sel');
      if (r.bloqueado) clases.push('is-blocked');
      return h('li', { class: clases.join(' ') },
        h('button', {
          type: 'button', class: 'sf-agenda__date', 'aria-pressed': String(iso === seleccionado),
          'aria-label': descripcionDia(iso, minutosDelDia(sesiones, iso)), onClick: () => onSelect(iso),
        },
        h('span', { class: 'sf-agenda__d' }, iso === hoy ? 'Hoy' : formatoCorto(iso).replace(/^\S+ /, '')),
        h('span', { class: 'sf-agenda__wd' }, iso === hoy ? formatoCorto(iso).replace(/^\S+ /, '') : formatoMedio(iso).split(' ')[0])),
        h('div', { class: 'sf-agenda__events' }, eventos.length > 0
          ? h('ul', { class: 'sf-events' }, eventos)
          : h('p', { class: 'sf-agenda__none' }, r.bloqueado ? 'Día bloqueado' : 'Sin sesiones')));
    })));
}

export function vistaCalendario({ mes: m, seleccionado, hoy, datos, vista, filtro, onSelect, onMes, onVista, onFiltro }) {
  const sesiones = datos.sesiones.filter((s) => filtro.has(s.materiaId));
  const props = { mes: m, seleccionado, hoy, datos, sesiones, filtro, onSelect, onMes, onFiltro };
  const boton = (v, etiqueta, icon) => h('button', {
    type: 'button', class: 'sf-square', 'aria-label': etiqueta, 'aria-pressed': String(vista === v), onClick: () => onVista(v),
  }, icono(icon, { size: 18, weight: vista === v ? 'Filled' : 'Outline' }));
  return h('div', { class: 'sf-page' },
    h('header', { class: 'sf-head' },
      h('div', {},
        h('p', { class: 'sf-eyebrow' }, `${formatoCorto(PERIODO.inicio).replace(/^\S+ /, '')} – ${formatoCorto(PERIODO.fin).replace(/^\S+ /, '')}`),
        h('h1', {}, vista === 'agenda' ? 'Agenda' : 'Calendario')),
      h('div', { class: 'sf-viewtoggle', role: 'group', 'aria-label': 'Vista del calendario' },
        boton('mes', 'Mes', Calendar), boton('agenda', 'Agenda', List))),
    vista === 'agenda' ? agenda(props) : mes(props));
}
