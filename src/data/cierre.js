// Cierre del dia (closings/{AAAA-MM-DD}): revision de objetivos, dificultades y trabajo pendiente.
// El id es la fecha: guardar dos veces el mismo dia actualiza el mismo documento. Las cifras del
// dia no se copian al cierre: se calculan siempre desde el plan y los registros confirmados.
import { PERIODO } from './control.js';
import { sesionesDelDia } from './sesiones.js';
import { minutos, RESULTADOS } from './progreso.js';
import { esFechaISO } from './validate.js';

export const SCHEMA_CIERRE = 1;
export const MAX_TEXTO_CIERRE = 2000;

/** Solo se cierran dias del periodo que ya han empezado. */
export function puedeCerrar(fecha, hoy) {
  return esFechaISO(fecha) && fecha >= PERIODO.inicio && fecha <= PERIODO.fin && fecha <= hoy;
}

/**
 * Resumen de un dia para el cierre. `sesiones` con fecha vigente; `registros` confirmados.
 * trabajadoSesiones = foco de las sesiones previstas ese dia (sea cuando sea);
 * trabajadoDia = todo el foco hecho ese dia real (tambien de otras sesiones o libre).
 */
export function resumenCierre({ fecha, sesiones, progreso = new Map(), registros = [] }) {
  const delDia = sesionesDelDia(sesiones, fecha);
  const ids = new Set(delDia.map((s) => s.id));
  const porSesion = new Map();
  for (const r of registros) if (ids.has(r.sesionId)) porSesion.set(r.sesionId, (porSesion.get(r.sesionId) ?? 0) + r.focoMs);
  return {
    sesiones: delDia,
    previsto: delDia.reduce((t, s) => t + s.minutos, 0),
    trabajadoSesiones: minutos([...porSesion.values()].reduce((t, v) => t + v, 0)),
    trabajadoDia: minutos(registros.filter((r) => r.fecha === fecha).reduce((t, r) => t + r.focoMs, 0)),
    completadas: delDia.filter((s) => progreso.get(s.id)?.estado === 'completada').length,
    revisadas: delDia.filter((s) => RESULTADOS.includes(progreso.get(s.id)?.resultado)).length,
    // Lo que no se ha marcado como completado, con lo que falta de su tiempo previsto.
    pendientes: delDia.filter((s) => progreso.get(s.id)?.estado !== 'completada')
      .map((s) => ({ sesion: s, faltan: Math.max(0, s.minutos - minutos(porSesion.get(s.id) ?? 0)) })),
  };
}

function limpiar(texto) {
  if (texto == null) return '';
  if (typeof texto !== 'string') return null;
  const t = texto.replace(/\r\n/g, '\n').trim();
  return t.length > MAX_TEXTO_CIERRE ? null : t;
}

/** Documento del cierre (sin la marca de tiempo del servidor) o { error }. */
export function documentoCierre(fecha, { dificultades, pendiente }) {
  if (!esFechaISO(fecha)) return { error: 'Fecha no válida.' };
  const d = limpiar(dificultades);
  const p = limpiar(pendiente);
  if (d === null || p === null) return { error: `Máximo ${MAX_TEXTO_CIERRE} caracteres por campo.` };
  return { doc: { schemaVersion: SCHEMA_CIERRE, fecha, dificultades: d, pendiente: p } };
}
