// Consultas puras sobre la lista de sesiones cargada de Firestore.
import { MATERIAS } from './control.js';

const prioridad = Object.fromEntries(MATERIAS.map((m) => [m.id, m.prioridad]));

/** Sesiones de una fecha, en el orden del plan (orden, luego prioridad de materia). */
export function sesionesDelDia(sesiones, iso) {
  return sesiones.filter((s) => s.fecha === iso)
    .sort((a, b) => a.orden - b.orden || (prioridad[a.materiaId] ?? 9) - (prioridad[b.materiaId] ?? 9) || a.id.localeCompare(b.id));
}

export function minutosDelDia(sesiones, iso) {
  return sesionesDelDia(sesiones, iso).reduce((t, s) => t + s.minutos, 0);
}

/** Minutos previstos de un dia por materia, en el orden de MATERIAS; solo materias con carga. */
export function minutosPorMateria(sesiones, iso) {
  const delDia = sesiones.filter((s) => s.fecha === iso);
  return MATERIAS
    .map((m) => ({ materiaId: m.id, minutos: delDia.filter((s) => s.materiaId === m.id).reduce((t, s) => t + s.minutos, 0) }))
    .filter((x) => x.minutos > 0);
}

/**
 * Minutos PREVISTOS por materia: total del plan y parte programada hasta `hoy` (incluido).
 * Es calendario del plan, no tiempo trabajado.
 */
export function previstoHastaHoy(sesiones, hoy) {
  return MATERIAS.map((m) => {
    const propias = sesiones.filter((s) => s.materiaId === m.id);
    return {
      materiaId: m.id,
      total: propias.reduce((t, s) => t + s.minutos, 0),
      hasta: propias.filter((s) => s.fecha <= hoy).reduce((t, s) => t + s.minutos, 0),
    };
  });
}

/**
 * Jerarquia materia > tema > sesion para la vista Plan. Materias en orden de prioridad,
 * temas por su primera fecha y sesiones por fecha y orden. Solo agrupa: no inventa nada.
 */
export function arbolPlan(sesiones) {
  const porFecha = [...sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden || a.id.localeCompare(b.id));
  return MATERIAS.map((m) => {
    const propias = porFecha.filter((s) => s.materiaId === m.id);
    const temas = new Map();
    for (const s of propias) {
      if (!temas.has(s.tema)) temas.set(s.tema, []);
      temas.get(s.tema).push(s);
    }
    return {
      materia: m,
      minutos: propias.reduce((t, s) => t + s.minutos, 0),
      total: propias.length,
      temas: [...temas].map(([tema, lista]) => ({ tema, minutos: lista.reduce((t, s) => t + s.minutos, 0), sesiones: lista })),
    };
  }).filter((g) => g.total > 0);
}

/** Descarga de la copia JSON: nombre con fecha, sin datos en la URL. */
export function nombreBackup(fechaISO) { return `studyflow-backup-${fechaISO}.json`; }
