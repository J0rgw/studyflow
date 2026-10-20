// Datos de control verificados (CONTEXT.md). NO son el calendario de sesiones:
// el reparto diario sale del plan maestro, que se importara en la fase 2.

export const PERIODO = Object.freeze({ inicio: '2026-10-14', fin: '2026-11-08' });

export const MATERIAS = Object.freeze([
  { id: 'algebra', nombre: 'Álgebra Lineal', corto: 'Álgebra', horas: 36, prioridad: 1 },
  { id: 'requisitos', nombre: 'Ingeniería de Requisitos', corto: 'Requisitos', horas: 25, prioridad: 2 },
  { id: 'tac', nombre: 'Tecnologías Avanzadas de Comunicación', corto: 'TAC', horas: 23, prioridad: 3 },
  { id: 'moviles', nombre: 'Aplicaciones para Dispositivos Móviles', corto: 'Móviles', horas: 20, prioridad: 4 },
]);

export const TOTAL_HORAS_PREVISTAS = 104;

export const DIAS_BLOQUEADOS = Object.freeze(['2026-10-20', '2026-10-21', '2026-10-22']);

// Maximo de minutos efectivos por dia.
export const LIMITES_DIA = Object.freeze({
  '2026-10-27': 120,
  '2026-11-03': 120,
  '2026-11-06': 240,
});

// Los examenes tienen hora real; nunca cuentan como tiempo estudiado.
export const EXAMENES = Object.freeze([
  { id: 'ex-requisitos', materiaId: 'requisitos', fecha: '2026-11-07', inicio: '09:00', fin: '11:00' },
  { id: 'ex-algebra', materiaId: 'algebra', fecha: '2026-11-07', inicio: '11:00', fin: '14:00' },
  { id: 'ex-moviles', materiaId: 'moviles', fecha: '2026-11-08', inicio: '09:00', fin: '11:00' },
  { id: 'ex-tac', materiaId: 'tac', fecha: '2026-11-08', inicio: '11:00', fin: '14:00' },
]);

export function materiaPorId(id) {
  return MATERIAS.find((m) => m.id === id);
}

/** Restricciones conocidas de un dia (YYYY-MM-DD). */
export function restriccionesDia(iso) {
  const bloqueado = DIAS_BLOQUEADOS.includes(iso);
  return {
    enPeriodo: iso >= PERIODO.inicio && iso <= PERIODO.fin,
    bloqueado,
    maxMin: bloqueado ? 0 : (LIMITES_DIA[iso] ?? null),
    examenes: EXAMENES.filter((e) => e.fecha === iso),
  };
}

// Carga habitual sin limite explicito: 5 h efectivas entre semana y 6 h en fin de semana.
export const CARGA_HABITUAL = Object.freeze({ laborable: 300, finde: 360 });

/**
 * Cupo de minutos de estudio de un dia: 0 fuera del periodo o bloqueado; el maximo explicito
 * (27/10, 03/11, 06/11) es un limite duro; el resto de dias, la carga habitual (orientativa).
 */
export function cupoDia(iso) {
  const r = restriccionesDia(iso);
  if (!r.enPeriodo) return { minutos: 0, tipo: 'fuera' };
  if (r.bloqueado) return { minutos: 0, tipo: 'bloqueado' };
  if (r.maxMin != null) return { minutos: r.maxMin, tipo: 'limite' };
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return { minutos: d === 0 || d === 6 ? CARGA_HABITUAL.finde : CARGA_HABITUAL.laborable, tipo: 'habitual' };
}

/** Examen de una materia (null si no tiene). */
export function examenDe(materiaId) {
  return EXAMENES.find((e) => e.materiaId === materiaId) ?? null;
}

/** Examenes aun no terminados respecto a fecha y hora de Madrid, en orden. */
export function examenesPendientes(fecha, hora) {
  return EXAMENES.filter((e) => e.fecha > fecha || (e.fecha === fecha && e.fin > hora));
}

/** Primer examen aun no terminado respecto a fecha y hora de Madrid. */
export function proximoExamen(fecha, hora) {
  return examenesPendientes(fecha, hora)[0] ?? null;
}

// Reparto diario verificado en CONTEXT.md (minutos por materia). Solo sirve para
// COMPROBAR un plan importado; nunca para generar sesiones.
export const REFERENCIAS_DIA = Object.freeze({
  '2026-10-23': { algebra: 150, requisitos: 120, tac: 30 },
  '2026-10-27': { tac: 120 },
  '2026-11-06': { algebra: 90, requisitos: 90, tac: 30, moviles: 30 },
});
