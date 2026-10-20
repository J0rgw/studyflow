// Modo foco (referencia temporizador StandBy, design.md §1): etiqueta pequeña y digitos enormes
// alineados a la derecha; el relleno barre la pantalla desde la izquierda segun avanza la fase y
// los digitos se invierten donde los alcanza. Los digitos cambian de golpe; solo se mueve el
// relleno. Botones circulares a la izquierda. Los digitos y el relleno se actualizan en sitio
// (pintarReloj), sin repintar la vista.
// Sin foco activo, esta vista es el inicio del foco libre (sin sesion, materia opcional).
import { Play, Pause, Stop, SkipNext, Target } from '../lib/icons.js';
import { h, icono } from '../lib/dom.js';
import { materiaPorId } from '../data/control.js';
import {
  restanteMs, fraccionFase, etiquetaConfig, focoEnCursoMs, objetivoCumplido, configDe,
} from '../data/pomodoro.js';
import { minutos } from '../data/progreso.js';
import { esqueleto, aviso, etiqueta, botonConfirmar } from './ui.js';
import { listaPendientes } from './sesion.js';
import { controlesTemporizador, selectorMateria } from './ajustes-foco.js';

const FASE = {
  foco: 'Foco', pausa: 'En pausa', descanso: 'Descanso', largo: 'Pausa larga', espera: 'Descanso terminado',
  cumplido: 'Objetivo cumplido',
};

/** Clave de la fase visible: el foco parado se muestra como pausa; la espera final, como cumplido. */
export function claveFase(ej) {
  if (ej.fase === 'foco' && !ej.corriendo) return 'pausa';
  if (ej.fase === 'espera' && objetivoCumplido(ej)) return 'cumplido';
  return ej.fase;
}

// Color de la materia; un foco libre sin materia usa el acento.
const colorDe = (materiaId) => (materiaId ? `var(--sf-${materiaId})` : 'var(--sf-accent)');

function mmss(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Digitos: lo que queda de la fase; en espera, el siguiente foco; con el objetivo cubierto, 0:00. */
function digitos(ej, ahora) {
  if (objetivoCumplido(ej) && ej.fase === 'espera') return '0:00';
  return ej.fase === 'espera' ? mmss(ej.config.foco * 60_000) : mmss(restanteMs(ej, ahora));
}

/** Actualiza en sitio los digitos, el relleno, el indicador de la barra y el titulo de la pestaña. */
export function pintarReloj(raiz, vista) {
  const ej = vista?.ejecucion;
  if (!ej) return;
  const texto = digitos(ej, vista.ahora);
  for (const el of raiz.querySelectorAll('[data-reloj]')) if (el.textContent !== texto) el.textContent = texto;
  const p = ej.fase === 'espera' ? 1 : fraccionFase(ej, vista.ahora);
  for (const el of raiz.querySelectorAll('.sf-timer')) el.style.setProperty('--p', p.toFixed(5));
  const titulo = `${texto} · ${FASE[claveFase(ej)]} · StudyFlow`;
  if (document.title !== titulo) document.title = titulo;
}

/** Acceso al foco activo desde cualquier vista (barra superior). */
export function chipFoco(vista) {
  const ej = vista?.ejecucion;
  if (!ej) return null;
  const fase = claveFase(ej);
  return h('a', { class: `sf-focuschip is-${fase}`, href: '#/foco', 'aria-label': `${FASE[fase]}: volver al foco` },
    h('span', { class: 'sf-focuschip__dot', 'aria-hidden': 'true' }),
    h('span', { class: 'sf-focuschip__num', 'data-reloj': '', 'aria-hidden': 'true' }, digitos(ej, vista.ahora)));
}

// Marcas del ciclo hasta la pausa larga: hechas, la actual y las que faltan.
function ciclo(ej) {
  const enCiclo = (ej.intervalo - 1) % ej.config.cada;
  const hechas = ej.fase === 'foco' ? enCiclo : enCiclo + 1;
  return h('span', { class: 'sf-cycle', role: 'img', 'aria-label': `Foco ${ej.intervalo}; ${hechas} de ${ej.config.cada} antes de la pausa larga` },
    Array.from({ length: ej.config.cada }, (_, i) => h('i', {
      class: i < hechas ? 'is-done' : i === enCiclo && ej.fase === 'foco' ? 'is-now' : null,
    })));
}

function subtitulo(ej, fase) {
  if (fase === 'cumplido') return `${minutos(ej.objetivoMs)} min de foco · seguir: ${ej.config.foco} min`;
  if (fase === 'espera') return `Siguiente foco · ${ej.config.foco} min`;
  const objetivo = ej.objetivoMs ? ` · objetivo ${minutos(ej.objetivoMs)} min` : '';
  return `Foco ${ej.intervalo} · ${etiquetaConfig(ej.config)}${objetivo}`;
}

function pantalla(ej, vista, s, onAccion) {
  const fase = claveFase(ej);
  const m = materiaPorId(ej.materiaId);
  const etiquetaFoco = ej.sesionId ? `Foco · ${m?.corto ?? ''}` : `Foco libre${m ? ` · ${m.corto}` : ''}`;
  const capa = (invertida) => h('div', { class: `sf-display__layer${invertida ? ' is-inv' : ''}`, 'aria-hidden': 'true' },
    h('p', { class: 'sf-display__label' }, fase === 'foco' ? etiquetaFoco : FASE[fase]),
    h('p', { class: 'sf-display__num sf-timer__num', 'data-reloj': '' }, digitos(ej, vista.ahora)),
    h('p', { class: 'sf-display__sub' }, h('span', {}, subtitulo(ej, fase))));
  const boton = (id, etiquetaAccion, icon, accion, clase = '') => h('button', {
    id, type: 'button', class: `sf-round ${clase}`, 'aria-label': etiquetaAccion, onClick: () => onAccion(accion),
  }, icono(icon, { size: 22, weight: 'Filled' }));
  const principal = {
    foco: boton('foco-principal', 'Pausar', Pause, 'pausar', 'is-main'),
    pausa: boton('foco-principal', 'Reanudar', Play, 'reanudar', 'is-main'),
    descanso: boton('foco-principal', 'Saltar descanso y empezar foco', SkipNext, 'siguiente', 'is-main'),
    largo: boton('foco-principal', 'Saltar pausa larga y empezar foco', SkipNext, 'siguiente', 'is-main'),
    espera: boton('foco-principal', 'Empezar foco', Play, 'siguiente', 'is-main'),
    cumplido: boton('foco-principal', 'Seguir con otro foco', Play, 'siguiente', 'is-main'),
  }[fase];
  const resto = Math.ceil(restanteMs(ej, vista.ahora) / 60_000);
  const raiz = h('div', {
    // Con 100 min o mas los digitos tienen 6 caracteres: se reduce el tamaño para que quepan.
    class: `sf-display sf-timer is-${fase}${Math.max(ej.config.foco, ej.config.largo) >= 100 ? ' is-long' : ''}`,
    role: 'group', 'aria-label': `${FASE[fase]}${ej.fase === 'espera' ? '' : `, quedan unos ${resto} min`}${s ? ` · ${s.titulo}` : ' · foco libre'}`,
    style: `--p: ${(ej.fase === 'espera' ? 1 : fraccionFase(ej, vista.ahora)).toFixed(5)}`,
  },
  capa(false), capa(true),
  h('div', { class: 'sf-timer__ctrl' }, principal, boton('foco-fin', 'Finalizar y guardar', Stop, 'finalizar')));
  return raiz;
}

// Descartar pide una segunda pulsacion (sin modales) con los minutos que se perderian.
function botonDescartar(ej, reloj, onAccion) {
  return botonConfirmar({
    id: 'foco-descartar', texto: 'Descartar foco', onConfirmar: () => onAccion('descartar'),
    pregunta: () => `¿Descartar ${minutos(focoEnCursoMs(ej, reloj())) || 'menos de 1'} min de este foco?`,
  });
}

// Inicio del foco libre: pantalla en reposo con su boton, materia opcional y modo general.
function inicioLibre({ foco, ajustes, materia, onMateria, onAjustes, onEmpezarLibre, errorAjustes }) {
  const config = configDe(ajustes);
  const m = materiaPorId(materia);
  const capa = (invertida) => h('div', { class: `sf-display__layer${invertida ? ' is-inv' : ''}`, 'aria-hidden': 'true' },
    h('p', { class: 'sf-display__label' }, `Foco libre${m ? ` · ${m.corto}` : ''}`),
    h('p', { class: 'sf-display__num sf-timer__num' }, `${config.foco}:00`),
    h('p', { class: 'sf-display__sub' }, h('span', {}, `${etiquetaConfig(config)} · pausa larga ${config.largo} min cada ${config.cada}`)));
  return [
    h('section', { class: 'sf-card sf-focus__card', style: `--m: ${colorDe(materia)}`, 'aria-label': 'Foco libre' },
      h('div', { class: `sf-display sf-timer is-idle${config.foco >= 100 ? ' is-long' : ''}`, style: '--p: 0' },
        capa(false), capa(true),
        h('div', { class: 'sf-timer__ctrl' },
          h('button', {
            id: 'foco-libre', type: 'button', class: 'sf-round is-main', 'aria-label': 'Empezar foco libre',
            disabled: !foco.listo, onClick: onEmpezarLibre,
          }, icono(Play, { size: 22, weight: 'Filled' }))))),
    h('section', { class: 'sf-card', 'aria-labelledby': 'h-libre' },
      h('div', { class: 'sf-card__head' }, h('h2', { id: 'h-libre', class: 'sf-label' }, 'Materia'), h('span', { class: 'sf-caption' }, 'opcional')),
      selectorMateria(materia, onMateria),
      h('h2', { class: 'sf-label' }, 'Modo'),
      controlesTemporizador({
        nombre: 'modo-general', modo: ajustes.modo, onModo: (modo) => onAjustes({ ...ajustes, modo }), ajustes, onAjustes,
      }),
      errorAjustes && aviso('No se guardaron los ajustes', errorAjustes, 'warning')),
  ];
}

// Tarjeta de lo que se esta estudiando: la sesion, o el foco libre con su materia.
function tarjetaTrabajo(ej, s, reloj, onAccion) {
  const m = materiaPorId(ej.materiaId);
  return h('section', { class: 'sf-card sf-focus__session', style: `--m: ${colorDe(ej.materiaId)}`, 'aria-label': ej.sesionId ? 'Sesión' : 'Foco libre' },
    m && h('div', { class: 'sf-focus__tag' }, etiqueta(m.corto, { materia: ej.materiaId })),
    ej.sesionId
      ? h('a', { class: 'sf-focus__title', href: `#/sesion/${ej.sesionId}` }, s?.titulo ?? ej.sesionId)
      : h('p', { class: 'sf-focus__title' }, m ? 'Foco libre' : 'Foco libre · sin materia'),
    s?.objetivo && h('p', { class: 'sf-row__goal' }, icono(Target, { size: 14 }), h('span', {}, s.objetivo)),
    ej.fase === 'foco' && h('div', { class: 'sf-actions' }, botonDescartar(ej, reloj, onAccion)));
}

// Cifra junto al ciclo: hacia el objetivo de esta tanda, o lo confirmado de la sesion, o el foco libre hecho.
function cifraTrabajo(ej, s, foco, progreso) {
  // Sin foco completado aun: «—», nunca «0 min».
  const hecho = minutos(ej.focoHechoMs ?? 0) || '—';
  if (ej.objetivoMs) return [`${hecho}/${minutos(ej.objetivoMs)} min`, h('span', { class: 'sf-sr' }, ' de foco hacia el objetivo')];
  if (!ej.sesionId) return [hecho === '—' ? '—' : `${hecho} min`, h('span', { class: 'sf-sr' }, ' de foco completados')];
  const confirmado = minutos(progreso.porSesion.get(ej.sesionId) ?? 0);
  const enCola = minutos(foco.pendientes.filter((p) => p.datos.sesionId === ej.sesionId).reduce((t, p) => t + p.datos.focoMs, 0));
  return [
    progreso.registrosListos && confirmado > 0 ? `${confirmado}/${s?.minutos ?? '—'} min` : `— / ${s?.minutos ?? '—'} min`,
    enCola > 0 && h('span', { class: 'sf-focus__queue' }, ` · +${enCola} sin confirmar`),
  ];
}

export function vistaFoco({
  foco, datos, progreso, ajustes, materiaLibre, errorAjustes,
  onAccion, onReintentar, onDescartar, onMateria, onAjustes, onEmpezarLibre, reloj = Date.now,
}) {
  const cabecera = (eyebrow, titulo, extra = null) => h('header', { class: 'sf-head' },
    h('div', {}, h('p', { class: 'sf-eyebrow' }, eyebrow), h('h1', {}, titulo)), extra);
  if (!foco || !foco.listo) {
    return h('div', { class: 'sf-page' }, cabecera('Pomodoro', 'Foco'),
      foco?.error ? aviso('Foco no disponible', foco.error) : h('div', { class: 'sf-card', 'aria-busy': 'true' }, esqueleto(2)));
  }
  const ej = foco.ejecucion;
  const pendientes = listaPendientes(foco.pendientes, { onReintentar, onDescartar });
  if (!ej) {
    return h('div', { class: 'sf-page sf-focus' }, cabecera('Pomodoro', 'Foco libre'),
      inicioLibre({ foco, ajustes, materia: materiaLibre, onMateria, onAjustes, onEmpezarLibre, errorAjustes }),
      pendientes && h('section', { class: 'sf-card', 'aria-label': 'Registros sin guardar' }, pendientes));
  }
  const s = ej.sesionId ? datos.sesiones.find((x) => x.id === ej.sesionId) : null;
  const fase = claveFase(ej);
  return h('div', { class: `sf-page sf-focus is-${fase}` },
    cabecera(`${ej.sesionId ? 'Pomodoro' : 'Foco libre'} · ${etiquetaConfig(ej.config)}`, FASE[fase],
      ej.sesionId && h('a', { class: 'button button--secondary button--sm', href: `#/sesion/${ej.sesionId}` }, 'Sesión')),
    h('section', { class: 'sf-card sf-focus__card', style: `--m: ${colorDe(ej.materiaId)}`, 'aria-label': 'Temporizador' },
      pantalla(ej, foco, s, onAccion),
      h('div', { class: 'sf-focus__row' }, ciclo(ej), h('p', { class: 'sf-focus__worked' }, cifraTrabajo(ej, s, foco, progreso))),
      foco.errorEscritura && aviso('El foco no se ha guardado', foco.errorEscritura),
      foco.sinConfirmar && !foco.errorEscritura && h('p', { class: 'sf-caption', role: 'status' }, 'Cambios del foco sin confirmar por Firestore'),
      pendientes),
    tarjetaTrabajo(ej, s, reloj, onAccion));
}

export const nombreFase = (ej) => FASE[claveFase(ej)];
