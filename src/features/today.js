// Vista Hoy: tira de dias, resumen del dia, sesiones, cuenta atras al examen y corona del plan.
import { Target } from '../lib/icons.js';
import { h, icono } from '../lib/dom.js';
import {
  formatoMinutos, formatoMedio, formatoCorto, diasEntre, diaSemana, rangoFechas, parseISO,
  instanteMadrid, fraccion, restante, horasDecimal,
} from '../lib/dates.js';
import { sesionesDelDia, minutosDelDia, minutosPorMateria, previstoHastaHoy } from '../data/sesiones.js';
import {
  MATERIAS, PERIODO, TOTAL_HORAS_PREVISTAS, restriccionesDia, examenesPendientes, materiaPorId,
} from '../data/control.js';
import {
  barraMarcas, anilloDia, anillosPlan, vacio, esqueleto, aviso, descripcionDia,
  etiqueta, grupoEtiquetas, etiquetaPrueba, etiquetaExamen, etiquetasEstado,
} from './ui.js';

const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const cargando = (datos) => datos.status === 'idle' || datos.status === 'loading';

function tituloDia(fecha, hoy) {
  const d = diasEntre(hoy, fecha);
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  if (d === -1) return 'Ayer';
  return capitalizar(formatoCorto(fecha).replace(/ \S+$/, ''));
}

// La tira devuelve el foco al dia elegido con teclado tras el re-render.
let enfocarTira = false;

function tira({ seleccionado, hoy, sesiones, onSelect }) {
  const dias = rangoFechas(PERIODO.inicio, PERIODO.fin);
  // Escala de los anillos: el dia con mas carga del plan importado (no un objetivo inventado).
  const escala = Math.max(60, ...dias.map((d) => minutosDelDia(sesiones, d)));
  const activo = dias.includes(seleccionado) ? seleccionado : (dias.includes(hoy) ? hoy : dias[0]);
  const ir = (iso) => { enfocarTira = true; onSelect(iso); };
  const lista = h('div', {
    class: 'sf-strip', role: 'group', 'aria-label': 'Días del periodo',
    onKeydown: (e) => {
      const i = dias.indexOf(activo);
      const destino = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: dias.length - 1 }[e.key];
      if (destino == null || !dias[destino]) return;
      e.preventDefault();
      ir(dias[destino]);
    },
  }, dias.map((iso) => {
    const r = restriccionesDia(iso);
    const clases = ['sf-strip__day'];
    if (iso === seleccionado) clases.push('is-sel');
    if (iso === hoy) clases.push('is-today');
    if (r.bloqueado) clases.push('is-blocked');
    return h('button', {
      type: 'button', class: clases.join(' '), tabindex: iso === activo ? 0 : -1,
      'aria-pressed': String(iso === seleccionado), 'aria-current': iso === hoy ? 'date' : null,
      'aria-label': descripcionDia(iso, minutosDelDia(sesiones, iso)),
      onClick: () => onSelect(iso),
    },
    h('span', { class: 'sf-strip__wd' }, LETRAS[diaSemana(iso)]),
    h('span', { class: 'sf-strip__num' }, parseISO(iso).d),
    anilloDia(minutosPorMateria(sesiones, iso), escala, { bloqueado: r.bloqueado, examen: r.examenes[0]?.materiaId }));
  }));
  queueMicrotask(() => {
    const sel = lista.querySelector('[tabindex="0"]');
    if (!sel || !lista.isConnected) return;
    lista.scrollLeft = sel.offsetLeft - (lista.clientWidth - sel.offsetWidth) / 2;
    if (enfocarTira) { enfocarTira = false; sel.focus({ preventScroll: true }); }
  });
  return lista;
}

// Cifra heroe: 2 h 30 -> «2» h «30» min, con unidades pequenas.
function cifraMinutos(min) {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return [
    (hh > 0 || mm === 0) && [h('span', { class: 'sf-num' }, hh), h('span', { class: 'sf-unit' }, 'h')],
    mm > 0 && [h('span', { class: 'sf-num' }, mm), h('span', { class: 'sf-unit' }, 'min')],
  ];
}

function resumenDia(fecha, datos) {
  const r = restriccionesDia(fecha);
  const delDia = sesionesDelDia(datos.sesiones, fecha);
  const min = minutosDelDia(datos.sesiones, fecha);
  const listo = datos.status === 'ready';
  return h('section', { class: 'sf-card sf-sum', 'aria-labelledby': 'h-previsto' },
    h('div', { class: 'sf-card__head' },
      h('h2', { id: 'h-previsto', class: 'sf-label' }, 'Previsto'),
      grupoEtiquetas([
        etiquetasEstado(r),
        r.examenes.map((e) => etiquetaExamen(e.materiaId, `Examen ${materiaPorId(e.materiaId).corto} · ${e.inicio}`)),
      ], 'Estado del día')),
    cargando(datos)
      ? h('p', { class: 'sf-hero sf-skel sf-skel--hero', 'aria-hidden': 'true' })
      : h('p', { class: 'sf-hero' }, listo && datos.sesiones.length > 0 ? cifraMinutos(min) : h('span', { class: 'sf-num' }, '—')),
    h('p', { class: 'sf-sum__meta' },
      cargando(datos) ? 'Cargando…'
        : !listo ? 'Sin datos'
          : datos.sesiones.length === 0 ? 'Sin plan importado'
            : `${delDia.length} ${delDia.length === 1 ? 'sesión' : 'sesiones'}`),
    listo && min > 0 && barraMarcas(minutosPorMateria(datos.sesiones, fecha), Math.max(min, r.maxMin ?? 0)));
}

export function filaSesion(s) {
  const m = materiaPorId(s.materiaId);
  return h('li', { class: 'sf-row', style: `--m: var(--sf-${s.materiaId})` },
    h('span', { class: 'sf-row__mark', 'aria-hidden': 'true' }),
    h('div', { class: 'sf-row__body' },
      h('p', { class: 'sf-row__title' }, s.titulo, s.prueba && etiquetaPrueba()),
      h('p', { class: 'sf-row__meta' }, m ? m.corto : s.materiaId, s.tema && ` · ${s.tema}`),
      s.objetivo && h('p', { class: 'sf-row__goal' }, icono(Target, { size: 14 }), h('span', {}, s.objetivo))),
    h('span', { class: 'sf-row__min' }, formatoMinutos(s.minutos)));
}

function listaSesiones(fecha, datos) {
  const delDia = datos.status === 'ready' ? sesionesDelDia(datos.sesiones, fecha) : [];
  let cuerpo;
  if (cargando(datos)) cuerpo = esqueleto(3);
  else if (datos.status === 'error') cuerpo = aviso('No se pudo cargar', datos.error);
  else if (datos.sesiones.length === 0) {
    cuerpo = vacio('Sin plan importado', h('a', { class: 'button button--secondary button--sm', href: '#/datos' }, 'Importar plan'));
  } else if (delDia.length === 0) cuerpo = vacio(restriccionesDia(fecha).bloqueado ? 'Día bloqueado' : 'Sin sesiones');
  else cuerpo = h('ul', { class: 'sf-rows' }, delDia.map(filaSesion));
  return h('section', { class: 'sf-card sf-list', 'aria-labelledby': 'h-sesiones', 'aria-busy': cargando(datos) ? 'true' : null },
    h('div', { class: 'sf-card__head' },
      h('h2', { id: 'h-sesiones', class: 'sf-label' }, 'Sesiones'),
      delDia.length > 0 && h('span', { class: 'sf-count' }, delDia.length)),
    cuerpo);
}

/**
 * Cuenta atras (referencia temporizador StandBy): el relleno barre la pantalla desde la izquierda
 * a medida que pasa el periodo y los digitos, alineados a la derecha, se invierten cuando los
 * alcanza. Dos capas iguales; la de arriba se recorta con clip-path a la fraccion transcurrida.
 * Como en la referencia, los digitos cambian sin animacion: lo unico que se mueve es el relleno.
 *
 * Se cuenta desde el dia elegido: si es hoy, en vivo hasta el segundo; si es otro, dias naturales
 * desde ese dia (y el relleno en su posicion de ese dia). Asi se recorre la tira viendo cuanto queda.
 */

// Fraccion pintada la ultima vez: al cambiar de dia el relleno se desplaza desde ella.
let pAnterior = null;

// Desde otro dia que no es hoy, el examen de esa misma fecha aun esta pendiente (desde las 00:00).
const horaDesde = (fecha, ahora) => (fecha === ahora.fecha ? ahora.hora : '00:00');

function cuentaAtras(ahora, fecha) {
  const enVivo = fecha === ahora.fecha;
  const [ex] = examenesPendientes(fecha, horaDesde(fecha, ahora));
  if (!ex) {
    pAnterior = null;
    return h('div', { class: 'sf-display is-empty' }, h('p', { class: 'sf-display__label' }, 'Sin exámenes pendientes'));
  }
  const m = materiaPorId(ex.materiaId);
  const inicio = instanteMadrid(PERIODO.inicio);
  const objetivo = instanteMadrid(ex.fecha, ex.inicio);
  const capa = (invertida) => h('div', { class: `sf-display__layer${invertida ? ' is-inv' : ''}`, 'aria-hidden': invertida ? 'true' : null },
    h('p', { class: 'sf-display__label' }, `Examen de ${m.corto}`),
    h('p', { class: 'sf-display__num' }, h('span', { 'data-k': 'num' }), h('span', { class: 'sf-display__unit', 'data-k': 'unit' })),
    h('p', { class: 'sf-display__sub' },
      enVivo && h('span', { 'data-k': 'sub' }),
      h('span', {}, `${capitalizar(formatoCorto(ex.fecha))} · ${ex.inicio}${enVivo ? '' : `–${ex.fin}`}`)));
  const raiz = h('div', {
    class: 'sf-display', role: enVivo ? 'timer' : null,
    'aria-label': enVivo ? `Cuenta atrás al examen de ${m.nombre}` : `Examen de ${m.nombre}, visto desde el ${formatoMedio(fecha)}`,
  }, capa(false), capa(true));
  const poner = (k, texto) => raiz.querySelectorAll(`[data-k="${k}"]`).forEach((el) => { if (el.textContent !== texto) el.textContent = texto; });
  const rellenar = (p) => { raiz.style.setProperty('--p', p.toFixed(5)); pAnterior = p; };
  const dos = (n) => String(n).padStart(2, '0');

  const previo = pAnterior;
  if (enVivo) {
    let id = null;
    const pintar = () => {
      if (id && !raiz.isConnected) { clearInterval(id); return; }
      const t = Date.now();
      const r = restante(objetivo - t);
      rellenar(fraccion(inicio, objetivo, t));
      if (r.d > 0) {
        poner('num', String(r.d)); poner('unit', r.d === 1 ? 'día' : 'días');
        poner('sub', `${r.h}:${dos(r.m)}:${dos(r.s)}`);
      } else {
        poner('num', `${r.h}:${dos(r.m)}`); poner('unit', 'h'); poner('sub', `${dos(r.s)} s`);
      }
    };
    pintar();
    id = setInterval(pintar, 1000);
  } else {
    // El mismo dia del examen la cifra es su hora de inicio.
    const dias = diasEntre(fecha, ex.fecha);
    rellenar(fraccion(inicio, objetivo, instanteMadrid(fecha)));
    poner('num', dias > 0 ? String(dias) : ex.inicio);
    poner('unit', dias > 1 ? 'días' : dias === 1 ? 'día' : '');
  }
  if (previo != null && Math.abs(previo - pAnterior) > 0.001) {
    raiz.style.setProperty('--p0', previo.toFixed(5));
    raiz.classList.add('is-moving');
  }
  return raiz;
}

// Lo que falta para un examen visto desde `fecha`. Hoy: el mismo calculo que la cuenta atras
// (tiempo exacto hasta el inicio) para que las cifras coincidan. Otro dia: dias naturales.
function faltan(e, fecha, ahora) {
  const naturales = diasEntre(fecha, e.fecha);
  if (fecha !== ahora.fecha) return naturales === 0 ? 'ese día' : `${naturales} d`;
  if (naturales === 0) return 'hoy';
  if (naturales === 1) return 'mañana';
  return `${restante(instanteMadrid(e.fecha, e.inicio) - Date.now()).d} d`;
}

function examenes(ahora, fecha) {
  const pendientes = examenesPendientes(fecha, horaDesde(fecha, ahora));
  return h('section', { class: 'sf-card sf-exams', 'aria-labelledby': 'h-examenes' },
    h('div', { class: 'sf-card__head' },
      h('h2', { id: 'h-examenes', class: 'sf-label' }, 'Exámenes'),
      fecha !== ahora.fecha && h('span', { class: 'sf-caption' }, `desde ${formatoCorto(fecha)}`)),
    cuentaAtras(ahora, fecha),
    pendientes.length > 0 && h('ul', { class: 'sf-exams__list' }, pendientes.map((e) => h('li', {},
      etiqueta(materiaPorId(e.materiaId).corto, { materia: e.materiaId }),
      h('span', { class: 'sf-exams__when' }, `${formatoCorto(e.fecha)} · `, h('span', {}, `${e.inicio}–${e.fin}`)),
      h('span', { class: 'sf-exams__left' }, faltan(e, fecha, ahora))))));
}

// Plan hasta hoy (referencia Dashboard): anillos por materia y leyenda «hasta hoy / total».
// Sin plan importado solo se muestran las horas de control (36/25/23/20).
function plan(datos, hoy) {
  const listo = datos.status === 'ready' && datos.sesiones.length > 0;
  const filas = listo
    ? previstoHastaHoy(datos.sesiones, hoy)
    : MATERIAS.map((m) => ({ materiaId: m.id, total: m.horas * 60, hasta: 0 }));
  const total = filas.reduce((t, f) => t + f.total, 0);
  const hasta = filas.reduce((t, f) => t + f.hasta, 0);
  return h('section', { class: 'sf-card sf-plan', 'aria-labelledby': 'h-plan' },
    h('div', { class: 'sf-card__head' },
      h('h2', { id: 'h-plan', class: 'sf-label' }, listo ? 'Plan hasta hoy' : 'Plan'),
      listo && h('span', { class: 'sf-caption' }, 'previsto, no trabajado')),
    h('div', { class: 'sf-plan__body' },
      h('div', { class: 'sf-plan__chart' },
        anillosPlan(filas.map((f) => ({ materiaId: f.materiaId, fraccion: f.total ? f.hasta / f.total : 0 })), { hoy: listo }),
        h('p', { class: 'sf-plan__total' },
          h('span', { class: 'sf-num' }, listo ? horasDecimal(hasta) : TOTAL_HORAS_PREVISTAS), h('span', { class: 'sf-unit' }, 'h'),
          h('span', { class: 'sf-plan__cap' }, listo ? `de ${horasDecimal(total)} h` : 'previstas'))),
      h('ul', { class: 'sf-legend-list' }, filas.map((f) => h('li', { style: `--m: var(--sf-${f.materiaId})` },
        h('span', { class: 'sf-legend-list__bar', 'aria-hidden': 'true' }),
        h('span', { class: 'sf-legend-list__text' },
          h('span', { class: 'sf-legend-list__name' }, materiaPorId(f.materiaId).corto),
          h('span', { class: 'sf-legend-list__sub' }, listo ? `${horasDecimal(f.hasta)} / ${horasDecimal(f.total)} h` : 'previstas')),
        h('span', { class: 'sf-legend-list__value' },
          listo ? `${f.total ? Math.round((f.hasta / f.total) * 100) : 0} %` : `${horasDecimal(f.total)} h`))))));
}

export function vistaHoy({ ahora, datos, seleccionado, onSelect }) {
  const fecha = seleccionado;
  return h('div', { class: 'sf-page' },
    h('header', { class: 'sf-head' },
      h('div', {},
        h('p', { class: 'sf-eyebrow' }, capitalizar(formatoMedio(fecha))),
        h('h1', {}, tituloDia(fecha, ahora.fecha))),
      fecha !== ahora.fecha && h('button', { type: 'button', class: 'button button--secondary button--sm', onClick: () => onSelect(ahora.fecha) }, 'Volver a hoy')),
    tira({ seleccionado: fecha, hoy: ahora.fecha, sesiones: datos.sesiones, onSelect }),
    // Dos columnas en escritorio; en movil se apilan en este mismo orden.
    h('div', { class: 'sf-hoy' },
      h('div', { class: 'sf-col' }, resumenDia(fecha, datos), listaSesiones(fecha, datos)),
      h('div', { class: 'sf-col' }, examenes(ahora, fecha), plan(datos, ahora.fecha))));
}
