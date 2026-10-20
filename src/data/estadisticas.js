// Estadisticas de seguimiento, puras: previsto (plan con fechas vigentes) frente a trabajado
// (solo registros de foco CONFIRMADOS) frente a resultado (lo que el usuario marca de cada objetivo).
// Son tres medidas distintas y ninguna se deduce de otra: el tiempo no completa sesiones ni
// mide dominio, y el riesgo describe deficit de tiempo y cercania del examen, no preparacion.
import { MATERIAS, PERIODO, cupoDia, examenDe } from './control.js';
import { diasEntre, rangoFechas, diaSemana, sumarDias } from '../lib/dates.js';
import { minutos, RESULTADOS } from './progreso.js';

/** Deficit (minutos) por debajo del cual una materia se considera al dia. */
export const UMBRAL_DEFICIT_MIN = 30;
/** Con deficit y el examen a esta distancia o menos (dias naturales), se señala «examen cerca». */
export const DIAS_EXAMEN_CERCA = 7;

const sumaMin = (lista) => lista.reduce((t, s) => t + s.minutos, 0);

/** ms de foco confirmados por materia; los focos libres sin materia van en la clave null. */
export function trabajadoPorMateria(registros) {
  const mapa = new Map();
  for (const r of registros) mapa.set(r.materiaId ?? null, (mapa.get(r.materiaId ?? null) ?? 0) + r.focoMs);
  return mapa;
}

/** Riesgo descriptivo: 'pasado' (examen hecho), 'al-dia', 'deficit' o 'deficit-cerca'. */
export function riesgo({ deficit, diasExamen }) {
  if (diasExamen != null && diasExamen < 0) return 'pasado';
  if (deficit < UMBRAL_DEFICIT_MIN) return 'al-dia';
  return diasExamen != null && diasExamen <= DIAS_EXAMEN_CERCA ? 'deficit-cerca' : 'deficit';
}

function contarResultados(sesiones, progreso) {
  const out = { logrado: 0, 'con-ayuda': 0, 'no-logrado': 0 };
  for (const s of sesiones) {
    const r = progreso.get(s.id)?.resultado;
    if (RESULTADOS.includes(r)) out[r] += 1;
  }
  return out;
}

/**
 * Por materia y en el orden de MATERIAS:
 * - total, vencido (dias anteriores a hoy) y hastaHoy (incluido): minutos PREVISTOS.
 * - trabajado: minutos de foco confirmados de esa materia (sesiones y focos libres con materia).
 * - deficit = vencido - trabajado (nunca negativo): lo previsto en dias ya pasados sin trabajar.
 * - pendiente = total - trabajado: lo que queda del plan.
 * - completadas: solo las marcadas a mano. resultados: objetivos revisados por el usuario.
 */
export function resumenMaterias({ sesiones, registros, progreso = new Map(), hoy }) {
  const trabajadas = trabajadoPorMateria(registros);
  return MATERIAS.map((m) => {
    const propias = sesiones.filter((s) => s.materiaId === m.id);
    const total = sumaMin(propias);
    const vencido = sumaMin(propias.filter((s) => s.fecha < hoy));
    const trabajado = minutos(trabajadas.get(m.id) ?? 0);
    const deficit = Math.max(0, vencido - trabajado);
    const examen = examenDe(m.id);
    const diasExamen = examen ? diasEntre(hoy, examen.fecha) : null;
    return {
      materiaId: m.id,
      total,
      vencido,
      hastaHoy: sumaMin(propias.filter((s) => s.fecha <= hoy)),
      trabajado,
      deficit,
      pendiente: Math.max(0, total - trabajado),
      sesiones: propias.length,
      completadas: propias.filter((s) => progreso.get(s.id)?.estado === 'completada').length,
      resultados: contarResultados(propias, progreso),
      examen,
      diasExamen,
      riesgo: riesgo({ deficit, diasExamen }),
    };
  });
}

/** Totales del plan y del trabajo; `sinMateria` = foco libre sin materia (solo suma al total). */
export function resumenGlobal(materias, registros) {
  const suma = (k) => materias.reduce((t, m) => t + m[k], 0);
  const sinMateria = minutos(trabajadoPorMateria(registros).get(null) ?? 0);
  return {
    total: suma('total'),
    vencido: suma('vencido'),
    hastaHoy: suma('hastaHoy'),
    trabajadoMaterias: suma('trabajado'),
    trabajado: minutos(registros.reduce((t, r) => t + r.focoMs, 0)),
    sinMateria,
    deficit: suma('deficit'),
    sesiones: suma('sesiones'),
    completadas: suma('completadas'),
    logrados: materias.reduce((t, m) => t + m.resultados.logrado, 0),
  };
}

/**
 * Un elemento por dia del periodo: previsto (sesiones con fecha vigente), trabajado (registros
 * confirmados por el dia REAL en que se trabajo, tambien foco libre) y cupo del dia.
 */
export function historicoDiario({ sesiones, registros }) {
  const previsto = new Map();
  for (const s of sesiones) previsto.set(s.fecha, (previsto.get(s.fecha) ?? 0) + s.minutos);
  const trabajadoMs = new Map();
  for (const r of registros) trabajadoMs.set(r.fecha, (trabajadoMs.get(r.fecha) ?? 0) + r.focoMs);
  return rangoFechas(PERIODO.inicio, PERIODO.fin).map((fecha) => ({
    fecha,
    previsto: previsto.get(fecha) ?? 0,
    trabajado: minutos(trabajadoMs.get(fecha) ?? 0),
    cupo: cupoDia(fecha),
  }));
}

/** Semanas de lunes a domingo recortadas al periodo, con los totales de sus dias. */
export function historicoSemanal({ sesiones, registros, progreso = new Map() }) {
  const dias = historicoDiario({ sesiones, registros });
  const semanas = [];
  for (const d of dias) {
    const lunes = sumarDias(d.fecha, -diaSemana(d.fecha));
    let sem = semanas[semanas.length - 1];
    if (!sem || sem.lunes !== lunes) {
      sem = { lunes, desde: d.fecha, hasta: d.fecha, previsto: 0, trabajado: 0, sesiones: 0, completadas: 0 };
      semanas.push(sem);
    }
    sem.hasta = d.fecha;
    sem.previsto += d.previsto;
    sem.trabajado += d.trabajado;
  }
  for (const s of sesiones) {
    const sem = semanas.find((w) => s.fecha >= w.desde && s.fecha <= w.hasta);
    if (!sem) continue;
    sem.sesiones += 1;
    if (progreso.get(s.id)?.estado === 'completada') sem.completadas += 1;
  }
  return semanas.map(({ lunes, ...w }) => w);
}
