// Cierre del dia (#/cierre/AAAA-MM-DD): tiempo del dia, revision de cada objetivo (su resultado se
// guarda al momento en la sesion), lo que queda pendiente con acceso a reprogramarlo y notas de
// dificultades y pendiente. Nada se reprograma ni se completa desde aqui sin que el usuario lo haga.
import { ArrowLeft, Target, CalendarCheck, CalendarEdit } from '../lib/icons.js';
import { h, icono } from '../lib/dom.js';
import { formatoMedio, formatoCorto, formatoMinutos, ahoraMadrid } from '../lib/dates.js';
import { materiaPorId, cupoDia } from '../data/control.js';
import { minutosPorMateria } from '../data/sesiones.js';
import { trabajadoDelDia, trabajadoPorSesion, estadoEfectivo } from '../data/progreso.js';
import { puedeCerrar, resumenCierre, MAX_TEXTO_CIERRE } from '../data/cierre.js';
import {
  barraMarcas, vacio, esqueleto, aviso, etiqueta, etiquetaEstado, estadoGuardado,
} from './ui.js';
import { selectorResultado } from './sesion.js';

const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const hora = (t) => (t && typeof t.toDate === 'function' ? ahoraMadrid(t.toDate()) : null);

/** Tarjeta de Hoy: estado del cierre del dia elegido y acceso a el. null si no procede. */
export function tarjetaCierreHoy({ fecha, hoy, datos, progreso, cierres }) {
  if (datos.status !== 'ready' || !puedeCerrar(fecha, hoy)) return null;
  const r = resumenCierre({ fecha, sesiones: datos.sesiones, progreso: progreso.mapa, registros: progreso.registros });
  if (r.sesiones.length === 0) return null;
  const cerrado = cierres.get(fecha);
  const n = r.sesiones.length;
  return h('section', { class: 'sf-card sf-closecard', 'aria-labelledby': 'h-cierre' },
    h('div', { class: 'sf-card__head' },
      h('h2', { id: 'h-cierre', class: 'sf-label' }, 'Cierre del día'),
      cerrado && etiqueta('Cerrado', { tono: 'ok', icon: CalendarCheck })),
    h('p', { class: 'sf-closecard__meta' },
      `${r.revisadas}/${n} objetivos revisados`,
      r.pendientes.length > 0 && ` · ${r.pendientes.length} sin completar`),
    h('a', { class: 'button button--secondary button--sm sf-closecard__go', href: `#/cierre/${fecha}` }, cerrado ? 'Revisar cierre' : 'Cerrar el día'));
}

function tarjetaTiempo(fecha, r, datos, progreso) {
  const trabajado = progreso.registrosListos ? trabajadoDelDia(datos.sesiones, trabajadoPorSesion(progreso.registros), fecha) : [];
  const cupo = cupoDia(fecha);
  const n = r.sesiones.length;
  return h('section', { class: 'sf-card sf-sum', 'aria-labelledby': 'h-ctiempo' },
    h('div', { class: 'sf-card__head' },
      h('h2', { id: 'h-ctiempo', class: 'sf-label' }, 'Tiempo'),
      h('span', { class: 'sf-caption' }, 'trabajado / previsto')),
    h('p', { class: 'sf-hero sf-hero--md' },
      r.trabajadoSesiones > 0 ? [h('span', { class: 'sf-num' }, r.trabajadoSesiones), h('span', { class: 'sf-unit' }, 'min')] : h('span', { class: 'sf-num' }, '—'),
      h('span', { class: 'sf-hero__of' }, `/ ${formatoMinutos(r.previsto)}`)),
    r.previsto > 0 && barraMarcas(minutosPorMateria(datos.sesiones, fecha), Math.max(r.previsto, cupo.minutos), { trabajado }),
    h('p', { class: 'sf-sum__meta' },
      `${r.completadas}/${n} completadas · ${r.revisadas}/${n} objetivos revisados`,
      r.trabajadoDia !== r.trabajadoSesiones && ` · ${formatoMinutos(r.trabajadoDia)} de foco ese día`));
}

function tarjetaObjetivos(r, { progreso, guardado, onResultado, foco }) {
  return h('section', { class: 'sf-card', 'aria-labelledby': 'h-cobjetivos' },
    h('div', { class: 'sf-card__head' }, h('h2', { id: 'h-cobjetivos', class: 'sf-label' }, 'Objetivos')),
    h('ul', { class: 'sf-closelist' }, r.sesiones.map((s) => {
      const prog = progreso.mapa.get(s.id);
      const estado = estadoEfectivo({
        manual: prog?.estado, trabajadoMs: progreso.porSesion.get(s.id) ?? 0, enCurso: foco?.ejecucion?.sesionId === s.id,
      });
      return h('li', { class: 'sf-closeitem', style: `--m: var(--sf-${s.materiaId})` },
        h('div', { class: 'sf-closeitem__head' },
          h('a', { class: 'sf-closeitem__title', href: `#/sesion/${s.id}` }, s.titulo),
          etiquetaEstado(estado)),
        h('p', { class: 'sf-row__goal' }, icono(Target, { size: 14 }), h('span', {}, s.objetivo)),
        selectorResultado(s, {
          nombre: `cierre-res-${s.id}`, resultado: prog?.resultado ?? null, guardado: guardado.get(`resultado:${s.id}`),
          onResultado, listo: progreso.progresoListo,
        }));
    })));
}

function tarjetaPendiente(r) {
  return h('section', { class: 'sf-card', 'aria-labelledby': 'h-cpendiente' },
    h('div', { class: 'sf-card__head' },
      h('h2', { id: 'h-cpendiente', class: 'sf-label' }, 'Sin completar'),
      r.pendientes.length > 0 && h('span', { class: 'sf-count' }, r.pendientes.length)),
    r.pendientes.length === 0 ? vacio('Todo completado')
      : h('ul', { class: 'sf-events' }, r.pendientes.map(({ sesion: s, faltan }) => h('li', { class: 'sf-event', style: `--m: var(--sf-${s.materiaId})` },
        h('p', { class: 'sf-event__title' }, h('a', { class: 'sf-event__link', href: `#/sesion/${s.id}` }, s.titulo)),
        h('p', { class: 'sf-event__meta sf-closepend__meta' },
          `${materiaPorId(s.materiaId)?.corto ?? s.materiaId} · ${faltan > 0 ? `faltan ${formatoMinutos(faltan)}` : 'tiempo cubierto'}`,
          h('a', { class: 'sf-closepend__move', href: `#/sesion/${s.id}`, 'aria-label': `Reprogramar: ${s.titulo}` },
            icono(CalendarEdit, { size: 14 }), 'Reprogramar'))))));
}

function campoTexto(id, texto, valor, onInput) {
  const contador = h('span', { class: 'sf-caption sf-notes__count', id: `${id}-cuenta` }, `${valor.length}/${MAX_TEXTO_CIERRE}`);
  return h('div', { class: 'sf-field' },
    h('div', { class: 'sf-card__head' }, h('label', { class: 'sf-label', for: id }, texto), contador),
    h('textarea', {
      id, class: 'textarea textarea--full-width sf-notes__field', rows: 4, maxlength: MAX_TEXTO_CIERRE, 'aria-describedby': `${id}-cuenta`,
      onInput: (e) => { onInput(e.target.value); contador.textContent = `${e.target.value.length}/${MAX_TEXTO_CIERRE}`; },
    }, valor));
}

function tarjetaNotas(fecha, { cierre, borrador, guardado, dudasPendientes, onBorrador, onGuardar, listo }) {
  const actual = {
    dificultades: borrador?.dificultades ?? cierre?.dificultades ?? '',
    pendiente: borrador?.pendiente ?? cierre?.pendiente ?? '',
  };
  const cambiar = (campo) => (v) => { actual[campo] = v; onBorrador(fecha, { ...actual }); };
  const cuando = hora(cierre?.cerradoEn);
  return h('section', { class: 'sf-card', 'aria-labelledby': 'h-cnotas' },
    h('div', { class: 'sf-card__head' },
      h('h2', { id: 'h-cnotas', class: 'sf-label' }, 'Notas del día'),
      dudasPendientes > 0 && h('a', { class: 'sf-caption', href: '#/progreso' }, `${dudasPendientes} ${dudasPendientes === 1 ? 'duda pendiente' : 'dudas pendientes'}`)),
    campoTexto(`cierre-dif-${fecha}`, 'Dificultades', actual.dificultades, cambiar('dificultades')),
    campoTexto(`cierre-pen-${fecha}`, 'Pendiente', actual.pendiente, cambiar('pendiente')),
    h('div', { class: 'sf-actions sf-notes__actions' },
      h('button', {
        id: `cierre-guardar-${fecha}`, type: 'button', class: 'button button--primary', disabled: !listo || guardado?.estado === 'guardando',
        onClick: () => onGuardar(fecha, { ...actual }),
      }, icono(CalendarCheck, { size: 16 }), cierre ? 'Actualizar cierre' : 'Cerrar el día'),
      estadoGuardado(guardado, { ok: 'Cerrado' }),
      !guardado && cuando && h('span', { class: 'sf-caption' }, `Cerrado ${cuando.fecha === fecha ? '' : `el ${formatoCorto(cuando.fecha)} `}a las ${cuando.hora}`)));
}

export function vistaCierre(p) {
  const { fecha, hoy, datos } = p;
  const cabecera = h('header', { class: 'sf-head' },
    h('div', {}, h('p', { class: 'sf-eyebrow' }, capitalizar(formatoMedio(fecha))), h('h1', {}, 'Cierre del día')),
    h('a', { class: 'button button--secondary button--sm', href: '#/hoy' }, icono(ArrowLeft, { size: 16 }), 'Volver'));
  if (datos.status === 'idle' || datos.status === 'loading' || p.cierres.status === 'loading') {
    return h('div', { class: 'sf-page' }, cabecera, h('div', { class: 'sf-card', 'aria-busy': 'true' }, esqueleto(3)));
  }
  if (datos.status === 'error') return h('div', { class: 'sf-page' }, cabecera, aviso('No se pudo cargar', datos.error));
  if (!puedeCerrar(fecha, hoy)) return h('div', { class: 'sf-page' }, cabecera, h('div', { class: 'sf-card' }, vacio('Este día aún no se puede cerrar')));
  const r = resumenCierre({ fecha, sesiones: datos.sesiones, progreso: p.progreso.mapa, registros: p.progreso.registros });
  if (r.sesiones.length === 0) return h('div', { class: 'sf-page' }, cabecera, h('div', { class: 'sf-card' }, vacio('Sin sesiones ese día')));
  return h('div', { class: 'sf-page' }, cabecera,
    p.cierres.error && aviso('No se pudo leer el cierre', p.cierres.error),
    p.progreso.errorRegistros && aviso('No se pudo leer el tiempo', p.progreso.errorRegistros),
    h('div', { class: 'sf-sesion' },
      h('div', { class: 'sf-col' },
        tarjetaTiempo(fecha, r, datos, p.progreso),
        tarjetaObjetivos(r, p)),
      h('div', { class: 'sf-col' },
        tarjetaPendiente(r),
        tarjetaNotas(fecha, {
          cierre: p.cierres.mapa.get(fecha), borrador: p.borrador, guardado: p.guardado.get(`cierre:${fecha}`),
          dudasPendientes: p.dudasPendientes, onBorrador: p.onBorrador, onGuardar: p.onGuardar,
          listo: p.cierres.status === 'ready',
        }))));
}
