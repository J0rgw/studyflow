// Progreso de ejecucion, separado del plan: estado de cada sesion, notas y tiempo trabajado.
// Planificado != trabajado != aprendido: el tiempo nunca marca una sesion como completada.
import { MATERIAS } from './control.js';
import { MODOS, objetivoEnMinutos } from './pomodoro.js';

export const SCHEMA_PROGRESO = 1;
export const MAX_NOTA = 2000;

/** Estados que el usuario puede elegir. «En curso» solo existe mientras hay un foco activo. */
export const ESTADOS_MANUALES = Object.freeze(['pendiente', 'parcial', 'completada', 'pospuesta']);

export const NOMBRE_ESTADO = Object.freeze({
  pendiente: 'Pendiente', 'en-curso': 'En curso', parcial: 'Parcial', completada: 'Completada', pospuesta: 'Pospuesta',
});

/**
 * Resultado del objetivo verificable de una sesion, marcado por el usuario (null = sin revisar):
 * si ya lo resuelve solo, con ayuda o aun no. Es independiente del estado y del tiempo.
 */
export const RESULTADOS = Object.freeze(['logrado', 'con-ayuda', 'no-logrado']);
export const NOMBRE_RESULTADO = Object.freeze({ logrado: 'Sin ayuda', 'con-ayuda': 'Con ayuda', 'no-logrado': 'Aún no' });

export const resultadoValido = (r) => r === null || RESULTADOS.includes(r);

/**
 * Estado que se muestra: el foco activo manda; despues lo que el usuario marco; si no marco
 * nada, «parcial» cuando ya hay tiempo confirmado y «pendiente» si no. Nunca «completada» sola.
 */
export function estadoEfectivo({ manual = null, trabajadoMs = 0, enCurso = false }) {
  if (enCurso) return 'en-curso';
  if (ESTADOS_MANUALES.includes(manual)) return manual;
  return trabajadoMs > 0 ? 'parcial' : 'pendiente';
}

/** ms de foco CONFIRMADOS por sesion (solo registros guardados en Firestore). */
export function trabajadoPorSesion(registros) {
  const mapa = new Map();
  for (const r of registros) mapa.set(r.sesionId, (mapa.get(r.sesionId) ?? 0) + r.focoMs);
  return mapa;
}

/** Registros de una sesion, del mas reciente al mas antiguo. */
export function registrosDeSesion(registros, sesionId) {
  return registros.filter((r) => r.sesionId === sesionId).sort((a, b) => b.inicio - a.inicio);
}

/** Minutos enteros de foco (hacia abajo: nunca se redondea a favor). */
export function minutos(ms) { return Math.floor(ms / 60_000); }

/**
 * Trabajado por materia en las sesiones previstas para `fecha` (avance del plan de ese dia),
 * en el orden de MATERIAS; solo materias con tiempo.
 */
export function trabajadoDelDia(sesiones, porSesion, fecha) {
  const delDia = sesiones.filter((s) => s.fecha === fecha);
  return MATERIAS
    .map((m) => ({
      materiaId: m.id,
      minutos: minutos(delDia.filter((s) => s.materiaId === m.id).reduce((t, s) => t + (porSesion.get(s.id) ?? 0), 0)),
    }))
    .filter((x) => x.minutos > 0);
}

/** Nota libre: texto plano recortado; null si supera el maximo. */
export function limpiarNota(texto) {
  if (typeof texto !== 'string') return '';
  const t = texto.replace(/\r\n/g, '\n').trim();
  return t.length > MAX_NOTA ? null : t;
}

/** Minutos que se pueden querer para una sesion (objetivo de foco). */
export const LIMITES_OBJETIVO = Object.freeze([5, 480]);

/**
 * Objetivo de foco de una sesion: el total querido (por defecto, lo previsto en el plan) menos lo
 * ya trabajado (confirmado y pendiente de guardar). `restanteMs` en minutos enteros; null si ya
 * esta cubierto. Es tiempo, no dominio: cubrirlo no completa la sesion.
 */
export function objetivoSesion(sesion, { objetivoMin = null, trabajadoMs = 0 } = {}) {
  const [min, max] = LIMITES_OBJETIVO;
  const totalMin = Number.isInteger(objetivoMin) && objetivoMin >= min && objetivoMin <= max ? objetivoMin : sesion.minutos;
  return {
    totalMin,
    previsto: totalMin === sesion.minutos,
    restanteMs: objetivoEnMinutos(totalMin * 60_000 - trabajadoMs),
  };
}

/** Modo del temporizador elegido para una sesion, o el general si no eligio ninguno. */
export function modoSesion(progreso, modoGeneral) {
  const m = progreso?.focoModo;
  return m === 'libre' || MODOS[m] ? m : modoGeneral;
}
