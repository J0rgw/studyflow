// Detalle de sesion: objetivo y su resultado, tiempo trabajado frente a previsto, foco, estado,
// fecha (reprogramacion manual auditada), notas y dudas.
// El estado y el resultado los decide el usuario: el tiempo registrado nunca completa una sesion.
// Las notas se pintan como texto (h() nunca interpreta HTML).
import { Target, Play, Stopwatch, ArrowLeft, Refresh } from '../lib/icons.js';
import { h, icono } from '../lib/dom.js';
import { formatoCorto, formatoMinutos, ahoraMadrid } from '../lib/dates.js';
import { materiaPorId } from '../data/control.js';
import {
  ESTADOS_MANUALES, NOMBRE_ESTADO, MAX_NOTA, LIMITES_OBJETIVO, RESULTADOS, NOMBRE_RESULTADO,
  estadoEfectivo, registrosDeSesion, minutos,
} from '../data/progreso.js';
import { historialSesion } from '../data/reprogramacion.js';
import { selector, campoMinutos, controlesTemporizador } from './ajustes-foco.js';
import { tarjetaFecha } from './reprogramar.js';
import { tarjetaDudas } from './review.js';
import {
  barraMarcas, vacio, esqueleto, aviso, etiqueta, grupoEtiquetas, etiquetaPrueba, etiquetaEstado, cargador, botonConfirmar,
  estadoGuardado,
} from './ui.js';

export { estadoGuardado };

const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const hora = (ms) => ahoraMadrid(new Date(ms)).hora;

/**
 * Registros de la bandeja aun sin confirmar: se ven aparte y no suman como trabajados. Uno
 * rechazado por Firestore se puede reintentar (p. ej. tras publicar las reglas) o descartar.
 */
export function listaPendientes(pendientes, { onReintentar, onDescartar }) {
  if (pendientes.length === 0) return null;
  return h('ul', { class: 'sf-logs sf-logs--pending' }, pendientes.map((p) => h('li', { class: `is-${p.estado}` },
    h('span', { class: 'sf-logs__when' }, `${hora(p.datos.inicio)}–${hora(p.datos.fin)} · sin guardar`),
    h('span', { class: 'sf-logs__min' }, `${minutos(p.datos.focoMs)} min`),
    h('span', { class: 'sf-logs__state', role: p.estado === 'error' ? 'alert' : 'status' },
      p.estado === 'guardando' ? [cargador('Guardando'), 'Guardando…'] : h('span', {}, p.mensaje),
      p.estado !== 'guardando' && h('span', { class: 'sf-logs__actions' },
        h('button', { type: 'button', class: 'button button--ghost button--sm', onClick: onReintentar }, icono(Refresh, { size: 14 }), 'Reintentar'),
        p.estado === 'error' && botonConfirmar({
          texto: 'Descartar', pregunta: `¿Descartar ${minutos(p.datos.focoMs)} min sin guardar?`, onConfirmar: () => onDescartar(p.id),
        }))))));
}

/**
 * Resultado del objetivo verificable (Sin ayuda / Con ayuda / Aun no), aparte del estado y del
 * tiempo. Se puede quitar para volver a «sin revisar». Tambien lo usa el cierre del dia.
 */
export function selectorResultado(s, { resultado, guardado, onResultado, listo, nombre = `resultado-${s.id}` }) {
  return h('div', { class: 'sf-result' },
    h('div', { class: 'sf-result__head' },
      h('span', { class: 'sf-label', id: `${nombre}-l` }, 'Resultado'),
      estadoGuardado(guardado),
      RESULTADOS.includes(resultado) && h('button', {
        type: 'button', class: 'button button--ghost button--sm sf-result__clear', disabled: !listo || guardado?.estado === 'guardando',
        'aria-label': `Quitar resultado: ${s.titulo}`, onClick: () => onResultado(s, null),
      }, 'Quitar')),
    selector({
      nombre, leyenda: `Resultado del objetivo: ${s.titulo}`, actual: resultado, deshabilitado: !listo,
      opciones: RESULTADOS.map((r) => [r, NOMBRE_RESULTADO[r]]), onCambio: (v) => onResultado(s, v),
    }));
}

function tarjetaObjetivo(s, estado, resultado) {
  const m = materiaPorId(s.materiaId);
  return h('section', { class: 'sf-card sf-goalcard', style: `--m: var(--sf-${s.materiaId})`, 'aria-labelledby': 'h-objetivo' },
    h('div', { class: 'sf-card__head' },
      h('h2', { id: 'h-objetivo', class: 'sf-label' }, 'Objetivo'),
      grupoEtiquetas([etiqueta(m?.corto ?? s.materiaId, { materia: s.materiaId }), s.prueba && etiquetaPrueba(), etiquetaEstado(estado)], 'Sesión')),
    h('p', { class: 'sf-goal' }, icono(Target, { size: 18 }), h('span', {}, s.objetivo)),
    h('p', { class: 'sf-goal__topic' }, s.tema),
    resultado);
}

function tarjetaTiempo(s, {
  lista, listos, error, pendientes, onReintentar, onDescartar,
}) {
  const trabajado = minutos(lista.reduce((t, r) => t + r.focoMs, 0));
  return h('section', { class: 'sf-card sf-timecard', style: `--m: var(--sf-${s.materiaId})`, 'aria-labelledby': 'h-tiempo' },
    h('div', { class: 'sf-card__head' },
      h('h2', { id: 'h-tiempo', class: 'sf-label' }, 'Tiempo'),
      h('span', { class: 'sf-caption' }, 'trabajado / previsto')),
    !listos && !error ? h('p', { class: 'sf-hero sf-skel sf-skel--hero', 'aria-hidden': 'true' })
      : h('p', { class: 'sf-hero sf-hero--md' },
        // Sin registros: «—», nunca «0 min trabajados».
        trabajado > 0 ? [h('span', { class: 'sf-num' }, trabajado), h('span', { class: 'sf-unit' }, 'min')] : h('span', { class: 'sf-num' }, '—'),
        h('span', { class: 'sf-hero__of' }, `/ ${formatoMinutos(s.minutos)}`)),
    barraMarcas([{ materiaId: s.materiaId, minutos: s.minutos }], s.minutos, { trabajado: [{ materiaId: s.materiaId, minutos: trabajado }] }),
    error && aviso('No se pudo leer el tiempo', error),
    listaPendientes(pendientes, { onReintentar, onDescartar }),
    lista.length > 0 && h('ul', { class: 'sf-logs' }, lista.map((r) => h('li', {},
      h('span', { class: 'sf-logs__when' }, `${capitalizar(formatoCorto(r.fecha))} · ${hora(r.inicio)}–${hora(r.fin)}`),
      h('span', { class: 'sf-logs__min' }, `${minutos(r.focoMs)} min`),
      h('span', { class: 'sf-logs__state' }, r.tipo === 'parcial' ? 'Interrumpido' : '')))));
}

/**
 * Foco de la sesion: modo propio (o el general), objetivo de minutos (por defecto lo previsto) y
 * Empezar, que arranca al instante pomodoros hasta cubrir lo que falta del objetivo.
 */
function tarjetaFoco(s, {
  foco, ajustes, modo, objetivo, guardadoFoco, errorAjustes, onModoSesion, onObjetivo, onAjustes, onEmpezar,
}) {
  const ej = foco?.ejecucion;
  const aqui = ej?.sesionId === s.id;
  const ocupado = Boolean(ej && !aqui && ej.fase === 'foco');
  const resto = objetivo.restanteMs ? minutos(objetivo.restanteMs) : 0;
  return h('section', { class: 'sf-card sf-startcard', 'aria-labelledby': 'h-foco' },
    h('div', { class: 'sf-card__head' },
      h('h2', { id: 'h-foco', class: 'sf-label' }, 'Foco'),
      h('span', { class: 'sf-caption' }, resto > 0 ? `faltan ${resto} de ${objetivo.totalMin} min` : `objetivo de ${objetivo.totalMin} min cubierto`)),
    controlesTemporizador({
      nombre: 'modo-sesion', modo, onModo: (m) => onModoSesion(s, m), ajustes, onAjustes, deshabilitado: aqui,
    }),
    h('div', { class: 'sf-numfields' },
      campoMinutos(`objetivo-${s.id}`, 'Objetivo', objetivo.totalMin, LIMITES_OBJETIVO, (v) => onObjetivo(s, v)),
      !objetivo.previsto && h('span', { class: 'sf-caption' }, `previsto ${s.minutos}`)),
    estadoGuardado(guardadoFoco),
    errorAjustes && aviso('No se guardaron los ajustes', errorAjustes, 'warning'),
    aqui
      ? h('a', { id: 'sesion-empezar', class: 'button button--primary sf-start', href: '#/foco' }, icono(Stopwatch, { size: 18 }), 'Volver al foco')
      : h('button', {
        id: 'sesion-empezar', type: 'button', class: 'button button--primary sf-start', disabled: ocupado || !foco?.listo,
        onClick: () => onEmpezar(s),
      }, icono(Play, { size: 16, weight: 'Filled' }), resto > 0 ? `Empezar · ${resto} min` : 'Empezar'),
    ocupado && h('p', { class: 'sf-caption' }, 'Hay otro foco en marcha. ', h('a', { href: '#/foco' }, 'Ver foco')),
    foco?.error && aviso('Foco no disponible', foco.error));
}

function tarjetaEstado(s, { manual, trabajadoMs, guardado, onEstado, listo }) {
  const actual = estadoEfectivo({ manual, trabajadoMs });
  return h('section', { class: 'sf-card sf-statecard', 'aria-labelledby': 'h-estado' },
    h('div', { class: 'sf-card__head' },
      h('h2', { id: 'h-estado', class: 'sf-label' }, 'Estado'),
      estadoGuardado(guardado)),
    selector({
      nombre: `estado-${s.id}`, leyenda: 'Estado de la sesión', actual, deshabilitado: !listo,
      opciones: ESTADOS_MANUALES.map((e) => [e, NOMBRE_ESTADO[e]]), onCambio: (v) => onEstado(s, v),
    }));
}

function tarjetaNotas(s, { guardada, borrador, guardado, onBorrador, onNota, listo }) {
  const id = `nota-${s.id}`;
  const texto = borrador ?? guardada;
  const ocupado = guardado?.estado === 'guardando';
  const contador = h('span', { class: 'sf-caption sf-notes__count', id: `${id}-cuenta` }, `${texto.length}/${MAX_NOTA}`);
  const boton = h('button', {
    type: 'button', class: 'button button--secondary button--sm', disabled: texto === guardada || ocupado,
    onClick: () => onNota(s, campo.value),
  }, 'Guardar nota');
  const campo = h('textarea', {
    id, class: 'textarea textarea--full-width sf-notes__field', rows: 5, maxlength: MAX_NOTA, 'aria-describedby': `${id}-cuenta`,
    // Hasta leer la nota guardada no se puede editar (se pisaria).
    disabled: !listo,
    // Escribir no repinta la vista: solo se actualizan el contador y el boton.
    onInput: (e) => {
      const v = e.target.value;
      onBorrador(s, v);
      contador.textContent = `${v.length}/${MAX_NOTA}`;
      boton.disabled = v === guardada || ocupado;
    },
  }, texto);
  return h('section', { class: 'sf-card sf-notes' },
    h('div', { class: 'sf-card__head' }, h('label', { class: 'sf-label', for: id }, 'Notas'), contador),
    campo,
    h('div', { class: 'sf-actions sf-notes__actions' }, boton, estadoGuardado(guardado)));
}

export function vistaSesion(p) {
  const { datos, sesionId, volver } = p;
  const cabecera = (eyebrow, titulo) => h('header', { class: 'sf-head' },
    h('div', {}, h('p', { class: 'sf-eyebrow' }, eyebrow), h('h1', {}, titulo)),
    h('a', { class: 'button button--secondary button--sm', href: `#/${volver}` }, icono(ArrowLeft, { size: 16 }), 'Volver'));

  if (datos.status === 'idle' || datos.status === 'loading') {
    return h('div', { class: 'sf-page' }, cabecera('Sesión', 'Cargando…'), h('div', { class: 'sf-card', 'aria-busy': 'true' }, esqueleto(3)));
  }
  if (datos.status === 'error') return h('div', { class: 'sf-page' }, cabecera('Sesión', 'Sesión'), aviso('No se pudo cargar', datos.error));
  const s = datos.sesiones.find((x) => x.id === sesionId);
  if (!s) {
    return h('div', { class: 'sf-page' }, cabecera('Sesión', 'Sesión'),
      h('div', { class: 'sf-card' }, vacio('Sesión no encontrada', h('a', { class: 'button button--secondary button--sm', href: '#/hoy' }, 'Ir a Hoy'))));
  }

  const lista = registrosDeSesion(p.progreso.registros, s.id);
  const trabajadoMs = lista.reduce((t, r) => t + r.focoMs, 0);
  const prog = p.progreso.mapa.get(s.id);
  const enCurso = p.foco?.ejecucion?.sesionId === s.id;
  const estado = estadoEfectivo({ manual: prog?.estado, trabajadoMs, enCurso });
  const pendientes = (p.foco?.pendientes ?? []).filter((x) => x.datos.sesionId === s.id);
  const m = materiaPorId(s.materiaId);

  const resultado = selectorResultado(s, {
    resultado: prog?.resultado ?? null, guardado: p.guardado.get(`resultado:${s.id}`), onResultado: p.onResultado,
    listo: p.progreso.progresoListo,
  });

  return h('div', { class: 'sf-page' },
    cabecera(`${capitalizar(formatoCorto(s.fecha))} · ${m?.corto ?? s.materiaId}`, s.titulo),
    h('div', { class: 'sf-sesion' },
      h('div', { class: 'sf-col' },
        tarjetaObjetivo(s, estado, resultado),
        tarjetaTiempo(s, {
          lista, listos: p.progreso.registrosListos, error: p.progreso.errorRegistros, pendientes,
          onReintentar: p.onReintentar, onDescartar: p.onDescartarPendiente,
        }),
        tarjetaFecha(s, {
          sesiones: datos.sesiones, hoy: p.hoy, manual: prog?.estado ?? null,
          historial: historialSesion(p.eventos, s.id), borrador: p.borradorMover, guardado: p.guardado.get(`mover:${s.id}`),
          onBorrador: p.onBorradorMover, onMover: p.onMover,
        })),
      h('div', { class: 'sf-col' },
        tarjetaFoco(s, { ...p, ...p.focoSesion(s), guardadoFoco: p.guardado.get(`foco:${s.id}`) }),
        p.progreso.errorProgreso && aviso('No se pudo leer el progreso', p.progreso.errorProgreso),
        tarjetaEstado(s, {
          manual: prog?.estado, trabajadoMs, guardado: p.guardado.get(`estado:${s.id}`), onEstado: p.onEstado, listo: p.progreso.progresoListo,
        }),
        tarjetaNotas(s, {
          guardada: prog?.nota ?? '', borrador: p.borrador, guardado: p.guardado.get(`nota:${s.id}`),
          onBorrador: p.onBorrador, onNota: p.onNota, listo: p.progreso.progresoListo,
        }),
        tarjetaDudas({ ...p.dudasCtx, sesion: s, sesiones: datos.sesiones }))));
}
