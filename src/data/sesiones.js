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

/** Descarga de la copia JSON: nombre con fecha, sin datos en la URL. */
export function nombreBackup(fechaISO) { return `studyflow-backup-${fechaISO}.json`; }
