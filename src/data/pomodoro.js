// Temporizador Pomodoro puro: sin DOM, sin Firebase y sin reloj propio (recibe `ahora` en ms).
// El estado guarda instantes absolutos y ms acumulados; el tiempo transcurrido se calcula
// siempre a partir de ellos, nunca contando ticks. Asi una recarga, una pestaña en segundo
// plano o varias pestañas llegan al mismo resultado.
// Solo los tramos de FOCO con el reloj en marcha generan registros: pausas y descansos no.
// Acabar un foco no completa la sesion: eso solo lo decide el usuario.
// Una ejecucion puede ir ligada a una sesion (con un objetivo de minutos: los focos se encadenan
// hasta cubrirlo y el ultimo se acorta) o ser un foco libre (sin sesion, materia opcional).
import { ahoraMadrid } from '../lib/dates.js';

export const SCHEMA_EJECUCION = 1;

/** Un foco interrumpido con menos de esto no se registra (doble clic, arranque por error). */
export const MIN_REGISTRO_MS = 60_000;

/**
 * Con objetivo pendiente, al acabar el descanso empieza solo el siguiente foco, pero unicamente si
 * ese final se observa en vivo (una pestaña abierta lo reconcilia con menos de este retraso). Si
 * la app estaba cerrada se queda en espera: no se acredita foco que nadie vio empezar.
 */
export const ENCADENAR_MAX_RETRASO_MS = 90_000;

export const MODOS = Object.freeze({
  '25-5': Object.freeze({ foco: 25, descanso: 5 }),
  '50-10': Object.freeze({ foco: 50, descanso: 10 }),
});

export const LIMITES = Object.freeze({ foco: [5, 120], descanso: [1, 30], largo: [5, 60], cada: [2, 8] });

export const AJUSTES_INICIALES = Object.freeze({
  modo: '25-5', libre: Object.freeze({ foco: 40, descanso: 8 }), largo: 15, cada: 4,
});

const entero = (v, [min, max], defecto) => {
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : defecto;
};

/** Ajustes guardados (o lo que llegue de un formulario) -> ajustes validos y acotados. */
export function normalizarAjustes(a = {}) {
  const base = AJUSTES_INICIALES;
  const modo = a.modo === 'libre' || MODOS[a.modo] ? a.modo : base.modo;
  return {
    modo,
    libre: {
      foco: entero(a.libre?.foco, LIMITES.foco, base.libre.foco),
      descanso: entero(a.libre?.descanso, LIMITES.descanso, base.libre.descanso),
    },
    largo: entero(a.largo, LIMITES.largo, base.largo),
    cada: entero(a.cada, LIMITES.cada, base.cada),
  };
}

/** Duraciones en minutos de una ejecucion segun los ajustes. */
export function configDe(ajustes) {
  const a = normalizarAjustes(ajustes);
  const { foco, descanso } = a.modo === 'libre' ? a.libre : MODOS[a.modo];
  return { foco, descanso, largo: a.largo, cada: a.cada };
}

export const etiquetaConfig = (c) => `${c.foco}/${c.descanso}`;

export function idRegistro(ejecucionId, intervalo) { return `${ejecucionId}-${intervalo}`; }

/** ms de foco que faltan para el objetivo de la ejecucion (null si no tiene objetivo). */
export function restanteObjetivoMs(st) {
  return st.objetivoMs == null ? null : Math.max(0, st.objetivoMs - (st.focoHechoMs ?? 0));
}

export function objetivoCumplido(st) { return st.objetivoMs != null && restanteObjetivoMs(st) === 0; }

export function duracionFaseMs(st) {
  if (st.fase === 'foco') {
    // Con objetivo pendiente, el foco no pasa de lo que falta; cumplido, vuelve a su duracion normal.
    const foco = st.config.foco * 60_000;
    const resto = restanteObjetivoMs(st);
    return resto ? Math.min(foco, resto) : foco;
  }
  const min = { descanso: st.config.descanso, largo: st.config.largo }[st.fase];
  return (min ?? 0) * 60_000;
}

/** ms transcurridos en la fase actual, sin superar su duracion. Un reloj que retrocede no resta. */
export function transcurridoMs(st, ahora) {
  if (st.fase === 'espera') return 0;
  const tramo = st.corriendo && st.desde != null ? Math.max(0, ahora - st.desde) : 0;
  return Math.min(duracionFaseMs(st), st.acumuladoMs + tramo);
}

export function restanteMs(st, ahora) { return Math.max(0, duracionFaseMs(st) - transcurridoMs(st, ahora)); }

export function fraccionFase(st, ahora) {
  const d = duracionFaseMs(st);
  return d > 0 ? transcurridoMs(st, ahora) / d : 0;
}

/** Foco ya acumulado en el intervalo en curso (0 fuera de un foco). */
export function focoEnCursoMs(st, ahora) { return st && st.fase === 'foco' ? transcurridoMs(st, ahora) : 0; }

/** Instante en que termina la fase en marcha (null si esta parada). */
export function finFase(st) {
  if (!st.corriendo || st.desde == null || st.fase === 'espera') return null;
  return st.desde + (duracionFaseMs(st) - st.acumuladoMs);
}

function registro(st, fin, focoMs, tipo) {
  const ms = Math.round(focoMs);
  return {
    id: idRegistro(st.id, st.intervalo),
    datos: {
      schemaVersion: SCHEMA_EJECUCION,
      ejecucionId: st.id,
      intervalo: st.intervalo,
      // Foco libre: sin sesion y, si no se eligio, sin materia.
      sesionId: st.sesionId ?? null,
      materiaId: st.materiaId ?? null,
      // Dia real (Madrid) en que se trabajo, no el dia previsto de la sesion.
      fecha: ahoraMadrid(new Date(st.inicioIntervalo)).fecha,
      inicio: st.inicioIntervalo,
      // El tiempo activo nunca supera el lapso real entre inicio y fin.
      fin: Math.max(Math.round(fin), st.inicioIntervalo + ms),
      focoMs: ms,
      tipo,
    },
  };
}

/** Objetivo en minutos enteros (asi ningun foco queda por debajo de 1 min); null si no llega a 1. */
export function objetivoEnMinutos(ms) {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  return min >= 1 ? min * 60_000 : null;
}

/**
 * `sesion` (con objetivo opcional en ms) o foco libre con `materiaId` opcional. Todos los campos
 * van explicitos (null en vez de undefined: Firestore no admite undefined).
 */
export function crearEjecucion({ id, sesion = null, materiaId = null, objetivoMs = null, config, ahora }) {
  return {
    schemaVersion: SCHEMA_EJECUCION,
    id,
    sesionId: sesion ? sesion.id : null,
    materiaId: sesion ? sesion.materiaId : materiaId,
    objetivoMs: objetivoMs == null ? null : objetivoEnMinutos(objetivoMs),
    focoHechoMs: 0,
    config: { foco: config.foco, descanso: config.descanso, largo: config.largo, cada: config.cada },
    fase: 'foco',
    intervalo: 1,
    corriendo: true,
    desde: ahora,
    acumuladoMs: 0,
    inicioIntervalo: ahora,
    pausadoEn: null,
  };
}

/**
 * Reconcilia el estado con `ahora`: cierra las fases que ya han terminado en su instante exacto
 * (aunque nadie lo viera: pestaña cerrada o dormida). Sin objetivo: foco -> descanso -> espera, y
 * tras un descanso nunca arranca otro foco sin que el usuario lo pida. Con objetivo pendiente, el
 * descanso encadena el siguiente foco solo si se observa en vivo (ENCADENAR_MAX_RETRASO_MS). Si un
 * foco cubre el objetivo, pasa directo a la espera («objetivo cumplido»), sin descanso.
 */
export function avanzar(st, ahora) {
  const registros = [];
  let s = st;
  while (s.corriendo && s.fase !== 'espera') {
    const fin = finFase(s);
    if (ahora < fin) break;
    if (s.fase === 'foco') {
      const dur = duracionFaseMs(s);
      registros.push(registro(s, fin, dur, 'completo'));
      const hecho = { ...s, focoHechoMs: (s.focoHechoMs ?? 0) + dur };
      if (objetivoCumplido(hecho)) {
        s = { ...hecho, fase: 'espera', corriendo: false, desde: null, acumuladoMs: 0, pausadoEn: null };
      } else {
        const largo = s.intervalo % s.config.cada === 0;
        s = { ...hecho, fase: largo ? 'largo' : 'descanso', desde: fin, acumuladoMs: 0, pausadoEn: null };
      }
    } else if (restanteObjetivoMs(s) && ahora - fin <= ENCADENAR_MAX_RETRASO_MS) {
      s = {
        ...s, fase: 'foco', intervalo: s.intervalo + 1, corriendo: true, desde: fin, acumuladoMs: 0, inicioIntervalo: fin, pausadoEn: null,
      };
    } else {
      s = { ...s, fase: 'espera', corriendo: false, desde: null, acumuladoMs: 0, pausadoEn: null };
    }
  }
  return { estado: s, registros };
}

export function pausar(st, ahora) {
  const { estado: s, registros } = avanzar(st, ahora);
  if (!s.corriendo || s.fase !== 'foco') return { estado: s, registros };
  return {
    estado: { ...s, corriendo: false, acumuladoMs: Math.round(transcurridoMs(s, ahora)), desde: null, pausadoEn: Math.max(ahora, s.desde) },
    registros,
  };
}

export function reanudar(st, ahora) {
  if (st.corriendo || st.fase !== 'foco') return { estado: st, registros: [] };
  return { estado: { ...st, corriendo: true, desde: ahora, pausadoEn: null }, registros: [] };
}

/** Empieza el siguiente foco desde un descanso (lo salta) o desde la espera. */
export function siguienteFoco(st, ahora) {
  const { estado: s, registros } = avanzar(st, ahora);
  if (s.fase === 'foco') return { estado: s, registros };
  return {
    estado: {
      ...s, fase: 'foco', intervalo: s.intervalo + 1, corriendo: true, desde: ahora, acumuladoMs: 0, inicioIntervalo: ahora, pausadoEn: null,
    },
    registros,
  };
}

/** Termina la ejecucion guardando el foco interrumpido (si llega al minimo). */
export function finalizar(st, ahora) {
  const { estado: s, registros } = avanzar(st, ahora);
  if (s.fase === 'foco') {
    const ms = transcurridoMs(s, ahora);
    if (ms >= MIN_REGISTRO_MS) registros.push(registro(s, s.corriendo ? Math.max(ahora, s.desde) : s.pausadoEn, ms, 'parcial'));
  }
  return { estado: null, registros };
}

/** Termina sin guardar el foco interrumpido. Los intervalos ya completos se conservan. */
export function descartar(st, ahora) {
  return { estado: null, registros: avanzar(st, ahora).registros };
}

export const ACCIONES = Object.freeze({ pausar, reanudar, siguiente: siguienteFoco, finalizar, descartar });

const FASES = ['foco', 'descanso', 'largo', 'espera'];
const esEntero = (v) => Number.isInteger(v);
const esInstante = (v) => esEntero(v) && v > 0;

const textoONulo = (v) => v == null || (typeof v === 'string' && v.length > 0);

/** Un estado leido de Firestore solo se usa si es coherente (si no, se ignora). */
export function esEjecucionValida(st) {
  if (!st || typeof st !== 'object') return false;
  const c = st.config;
  return st.schemaVersion === SCHEMA_EJECUCION
    && typeof st.id === 'string' && /^[A-Za-z0-9]{8,40}$/.test(st.id)
    && textoONulo(st.sesionId) && textoONulo(st.materiaId)
    && (st.objetivoMs == null || (esEntero(st.objetivoMs) && st.objetivoMs >= MIN_REGISTRO_MS))
    && (st.focoHechoMs == null || (esEntero(st.focoHechoMs) && st.focoHechoMs >= 0))
    && c && Object.entries(LIMITES).every(([k, [min, max]]) => esEntero(c[k]) && c[k] >= min && c[k] <= max)
    && FASES.includes(st.fase) && esEntero(st.intervalo) && st.intervalo >= 1
    && typeof st.corriendo === 'boolean' && esEntero(st.acumuladoMs) && st.acumuladoMs >= 0
    && esInstante(st.inicioIntervalo)
    && (st.corriendo ? esInstante(st.desde) : st.desde == null)
    && (st.pausadoEn == null || esInstante(st.pausadoEn))
    && !(st.fase === 'espera' && st.corriendo);
}

/** Rellena los campos que no tenian las ejecuciones guardadas antes del objetivo y el foco libre. */
export function normalizarEjecucion(st) {
  return { sesionId: null, materiaId: null, objetivoMs: null, focoHechoMs: 0, ...st };
}
