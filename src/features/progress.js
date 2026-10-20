// Vista Progreso: previsto frente a trabajado (global y por materia), deficit y riesgo descriptivo,
// historico diario y semanal, y dudas. Previsto = plan con fechas vigentes; trabajado = solo foco
// confirmado por Firestore; «sin ayuda» = objetivos que el usuario marco como resueltos solo.
// Ninguna cifra de tiempo se presenta como dominio.
import { h } from '../lib/dom.js';
import { formatoCorto, formatoMinutos, horasDecimal, parseISO } from '../lib/dates.js';
import { materiaPorId, PERIODO } from '../data/control.js';
import { resumenMaterias, resumenGlobal, historicoDiario, historicoSemanal } from '../data/estadisticas.js';
import { puedeCerrar } from '../data/cierre.js';
import {
  barraMarcas, vacio, esqueleto, aviso, etiquetaRiesgo, iconoMateria,
} from './ui.js';
import { tarjetaDudas } from './review.js';

const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const cargando = (d) => d.status === 'idle' || d.status === 'loading';
const horas = (min) => `${horasDecimal(min)} h`;

// Dia elegido en el historico diario: sobrevive a los re-render (no se guarda).
let diaElegido = null;

function cifra(min) {
  if (min <= 0) return h('span', { class: 'sf-num' }, '—');
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return [
    hh > 0 && [h('span', { class: 'sf-num' }, hh), h('span', { class: 'sf-unit' }, 'h')],
    (mm > 0 || hh === 0) && [h('span', { class: 'sf-num' }, mm), h('span', { class: 'sf-unit' }, 'min')],
  ];
}

function tarjetaGlobal(g, materias) {
  const stat = (valor, texto) => h('li', {}, h('span', { class: 'sf-stat__num' }, valor), h('span', { class: 'sf-stat__label' }, texto));
  return h('section', { class: 'sf-card sf-sum', 'aria-labelledby': 'h-trabajado' },
    h('div', { class: 'sf-card__head' },
      h('h2', { id: 'h-trabajado', class: 'sf-label' }, 'Trabajado'),
      h('span', { class: 'sf-caption' }, 'trabajado / previsto')),
    h('p', { class: 'sf-hero sf-hero--md' }, cifra(g.trabajado), h('span', { class: 'sf-hero__of' }, `/ ${horas(g.total)}`)),
    h('p', { class: 'sf-sum__meta' },
      `Hasta ayer ${horas(g.vencido)} previstas · `,
      h('span', { class: 'sf-sum__work' }, g.deficit > 0 ? `déficit ${formatoMinutos(g.deficit)}` : 'al día')),
    g.total > 0 && barraMarcas(materias.filter((m) => m.total > 0).map((m) => ({ materiaId: m.materiaId, minutos: m.total })), g.total, {
      trabajado: materias.map((m) => ({ materiaId: m.materiaId, minutos: m.trabajado })),
    }),
    h('ul', { class: 'sf-stats' },
      stat(`${g.completadas}/${g.sesiones}`, 'sesiones hechas'),
      stat(g.logrados, 'objetivos sin ayuda'),
      stat(horas(materias.reduce((t, m) => t + m.pendiente, 0)), 'por trabajar')),
    g.sinMateria > 0 && h('p', { class: 'sf-caption' }, `Incluye ${formatoMinutos(g.sinMateria)} de foco libre sin materia.`));
}

function filaMateria(m) {
  const nombre = materiaPorId(m.materiaId);
  const r = m.resultados;
  const meta = [
    `${m.completadas}/${m.sesiones} hechas`,
    r.logrado > 0 && `${r.logrado} sin ayuda`,
    r['con-ayuda'] > 0 && `${r['con-ayuda']} con ayuda`,
    m.examen && `examen ${formatoCorto(m.examen.fecha)}`,
  ].filter(Boolean).join(' · ');
  return h('li', { class: 'sf-subject', style: `--m: var(--sf-${m.materiaId})` },
    h('div', { class: 'sf-subject__head' },
      h('span', { class: 'sf-subject__icon', 'aria-hidden': 'true' }, iconoMateria(m.materiaId, { size: 16 })),
      h('h3', { class: 'sf-subject__name' }, nombre.corto),
      m.total > 0 && etiquetaRiesgo(m)),
    m.total === 0
      ? h('p', { class: 'sf-subject__meta' }, 'Sin sesiones en el plan')
      : [
        h('p', { class: 'sf-subject__nums' },
          h('span', { class: 'sf-num' }, m.trabajado > 0 ? horasDecimal(m.trabajado) : '—'),
          h('span', { class: 'sf-subject__of' }, ` / ${horas(m.hastaHoy)} hasta hoy · ${horas(m.total)} en total`),
          h('span', { class: 'sf-sr' }, `: ${formatoMinutos(m.trabajado)} trabajados`)),
        // Solido = trabajado; tenue = previsto hasta hoy; pista = resto del plan de la materia.
        barraMarcas([{ materiaId: m.materiaId, minutos: Math.max(m.hastaHoy, m.trabajado) }], Math.max(m.total, m.trabajado), {
          trabajado: [{ materiaId: m.materiaId, minutos: m.trabajado }],
        }),
        h('p', { class: 'sf-subject__meta' }, meta),
      ]);
}

function tarjetaMaterias(materias) {
  return h('section', { class: 'sf-card', 'aria-labelledby': 'h-materias' },
    h('div', { class: 'sf-card__head' }, h('h2', { id: 'h-materias', class: 'sf-label' }, 'Por materia')),
    h('ul', { class: 'sf-subjects' }, materias.map(filaMateria)));
}

function textoDia(d, hoy, cerrado) {
  const partes = [capitalizar(formatoCorto(d.fecha))];
  if (d.cupo.tipo === 'bloqueado') partes.push('día bloqueado');
  else if (d.fecha > hoy) partes.push(d.previsto > 0 ? `${formatoMinutos(d.previsto)} previstas` : 'sin sesiones');
  else {
    partes.push(`${d.trabajado > 0 ? formatoMinutos(d.trabajado) : '—'} de ${formatoMinutos(d.previsto)} previstas`);
    if (cerrado) partes.push('cerrado');
  }
  return partes.join(' · ');
}

/**
 * Historico diario (columnas con objetivo): la columna ancha y tenue es lo previsto, la estrecha y
 * solida lo trabajado ese dia real. Una sola parada de tabulacion; flechas, Inicio y Fin recorren
 * los dias y la lectura de arriba cambia en sitio (sin repintar). La tabla oculta da los mismos datos.
 */
function tarjetaDias(dias, hoy, cierres) {
  const escala = Math.max(60, ...dias.map((d) => Math.max(d.previsto, d.trabajado, d.cupo.minutos)));
  const activo = dias.some((d) => d.fecha === diaElegido) ? diaElegido
    : (dias.some((d) => d.fecha === hoy) ? hoy : dias[dias.length - 1].fecha);
  const texto = h('span', {});
  const enlace = h('a', { class: 'sf-days__link' });
  const leer = (d) => {
    texto.textContent = textoDia(d, hoy, cierres.has(d.fecha));
    const cerrable = puedeCerrar(d.fecha, hoy) && d.previsto > 0;
    enlace.hidden = !cerrable;
    if (cerrable) {
      enlace.href = `#/cierre/${d.fecha}`;
      enlace.textContent = cierres.has(d.fecha) ? 'Ver cierre' : 'Cerrar día';
    }
  };
  const columnas = dias.map((d) => {
    const clases = ['sf-days__col'];
    if (d.fecha === hoy) clases.push('is-today');
    if (d.fecha > hoy) clases.push('is-future');
    if (d.cupo.tipo === 'bloqueado') clases.push('is-blocked');
    if (cierres.has(d.fecha)) clases.push('is-closed');
    if (d.fecha === activo) clases.push('is-sel');
    return h('button', {
      type: 'button', class: clases.join(' '), tabindex: d.fecha === activo ? 0 : -1,
      'data-fecha': d.fecha, 'aria-label': textoDia(d, hoy, cierres.has(d.fecha)),
      style: `--prev: ${(d.previsto / escala).toFixed(4)}; --trab: ${(Math.min(d.trabajado, escala) / escala).toFixed(4)}`,
      onPointerenter: () => leer(d), onFocus: () => leer(d),
      onClick: (e) => {
        diaElegido = d.fecha;
        for (const c of e.currentTarget.parentNode.children) c.classList.toggle('is-sel', c === e.currentTarget);
        leer(d);
      },
    },
    h('span', { class: 'sf-days__plan', 'aria-hidden': 'true' }),
    h('span', { class: 'sf-days__work', 'aria-hidden': 'true' }));
  });
  const grafico = h('div', {
    class: 'sf-days__plot', role: 'group', 'aria-label': 'Previsto y trabajado por día',
    onPointerleave: () => leer(dias.find((d) => d.fecha === (diaElegido ?? activo)) ?? dias[0]),
    onKeydown: (e) => {
      const i = columnas.findIndex((c) => c === document.activeElement);
      const destino = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: columnas.length - 1 }[e.key];
      if (i === -1 || destino == null || !columnas[destino]) return;
      e.preventDefault();
      columnas[i].tabIndex = -1;
      columnas[destino].tabIndex = 0;
      columnas[destino].focus();
    },
  }, columnas);
  // Etiquetas solo en los lunes y en los extremos del periodo, para que no se amontonen.
  const ejes = h('div', { class: 'sf-days__axis', 'aria-hidden': 'true' }, dias.map((d, i) => h('span', {},
    i === 0 || i === dias.length - 1 || new Date(`${d.fecha}T00:00:00Z`).getUTCDay() === 1 ? parseISO(d.fecha).d : '')));
  leer(dias.find((d) => d.fecha === activo));
  return h('section', { class: 'sf-card sf-days', 'aria-labelledby': 'h-dias' },
    h('div', { class: 'sf-card__head' },
      h('h2', { id: 'h-dias', class: 'sf-label' }, 'Días'),
      h('ul', { class: 'sf-legend' },
        h('li', {}, h('i', { class: 'sf-days__key is-plan', 'aria-hidden': 'true' }), 'Previsto'),
        h('li', {}, h('i', { class: 'sf-days__key is-work', 'aria-hidden': 'true' }), 'Trabajado'))),
    h('p', { class: 'sf-days__read' }, texto, enlace),
    h('div', { class: 'sf-days__chart' },
      h('span', { class: 'sf-days__max', 'aria-hidden': 'true' }, horas(escala)),
      grafico, ejes),
    h('table', { class: 'sf-sr' },
      h('caption', {}, 'Minutos previstos y trabajados por día'),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Día'), h('th', { scope: 'col' }, 'Previsto'), h('th', { scope: 'col' }, 'Trabajado'))),
      h('tbody', {}, dias.map((d) => h('tr', {},
        h('th', { scope: 'row' }, formatoCorto(d.fecha)),
        h('td', {}, d.cupo.tipo === 'bloqueado' ? 'bloqueado' : formatoMinutos(d.previsto)),
        h('td', {}, d.fecha > hoy ? '—' : formatoMinutos(d.trabajado)))))));
}

function tarjetaSemanas(semanas, hoy) {
  const rango = (w) => {
    const a = parseISO(w.desde);
    const b = parseISO(w.hasta);
    const mes = (iso) => formatoCorto(iso).split(' ').pop();
    return a.m === b.m ? `${a.d}–${b.d} ${mes(w.hasta)}` : `${a.d} ${mes(w.desde)}–${b.d} ${mes(w.hasta)}`;
  };
  return h('section', { class: 'sf-card', 'aria-labelledby': 'h-semanas' },
    h('div', { class: 'sf-card__head' }, h('h2', { id: 'h-semanas', class: 'sf-label' }, 'Semanas')),
    h('table', { class: 'sf-table' },
      h('caption', { class: 'sf-sr' }, 'Previsto, trabajado y sesiones hechas por semana'),
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, 'Semana'), h('th', { scope: 'col' }, 'Previsto'),
        h('th', { scope: 'col' }, 'Trabajado'), h('th', { scope: 'col' }, 'Hechas'))),
      h('tbody', {}, semanas.map((w) => h('tr', { class: w.desde <= hoy && hoy <= w.hasta ? 'is-now' : null },
        h('th', { scope: 'row' }, rango(w)),
        h('td', {}, horas(w.previsto)),
        h('td', {}, w.desde > hoy ? '—' : w.trabajado > 0 ? horas(w.trabajado) : '—'),
        h('td', {}, w.sesiones > 0 ? `${w.completadas}/${w.sesiones}` : '—'))))));
}

export function vistaProgreso({ datos, progreso, hoy, cierres, dudasCtx, filtroDudas, onFiltroDudas }) {
  const cabecera = h('header', { class: 'sf-head' },
    h('div', {}, h('p', { class: 'sf-eyebrow' }, `Hasta hoy · ${formatoCorto(hoy)}`), h('h1', {}, 'Progreso')));
  const dudas = tarjetaDudas({ ...dudasCtx, sesiones: datos.sesiones ?? [], filtro: filtroDudas, onFiltro: onFiltroDudas });
  if (cargando(datos) || (datos.status === 'ready' && !progreso.registrosListos && !progreso.errorRegistros)) {
    return h('div', { class: 'sf-page' }, cabecera,
      h('div', { class: 'sf-progreso' },
        h('div', { class: 'sf-col' }, h('div', { class: 'sf-card', 'aria-busy': 'true' }, esqueleto(3))),
        h('div', { class: 'sf-col' }, h('div', { class: 'sf-card', 'aria-busy': 'true' }, esqueleto(3)))));
  }
  if (datos.status === 'error') return h('div', { class: 'sf-page' }, cabecera, aviso('No se pudo cargar', datos.error), dudas);
  if (datos.sesiones.length === 0) {
    return h('div', { class: 'sf-page' }, cabecera,
      h('div', { class: 'sf-card' }, vacio('Sin plan importado', h('a', { class: 'button button--secondary button--sm', href: '#/datos' }, 'Importar plan'))),
      dudas);
  }
  // Sin poder leer los registros no se muestra trabajado alguno: seria inventarlo.
  if (progreso.errorRegistros) {
    return h('div', { class: 'sf-page' }, cabecera, aviso('No se pudo leer el tiempo trabajado', progreso.errorRegistros), dudas);
  }
  const registros = progreso.registros;
  const materias = resumenMaterias({ sesiones: datos.sesiones, registros, progreso: progreso.mapa, hoy });
  const global = resumenGlobal(materias, registros);
  const ref = hoy < PERIODO.inicio ? PERIODO.inicio : hoy;
  return h('div', { class: 'sf-page' }, cabecera,
    progreso.errorProgreso && aviso('No se pudo leer el estado de las sesiones', progreso.errorProgreso),
    h('div', { class: 'sf-progreso' },
      h('div', { class: 'sf-col' }, tarjetaGlobal(global, materias), tarjetaMaterias(materias)),
      h('div', { class: 'sf-col' },
        tarjetaDias(historicoDiario({ sesiones: datos.sesiones, registros }), ref, cierres),
        tarjetaSemanas(historicoSemanal({ sesiones: datos.sesiones, registros, progreso: progreso.mapa }), ref),
        dudas)));
}
