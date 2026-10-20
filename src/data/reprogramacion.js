// Reprogramacion manual de sesiones, pura y sin Firebase.
// El plan importado (sessions) nunca se modifica: la fecha vigente de una sesion movida vive en
// reschedules/{sesionId} con un contador `rev`, y cada cambio deja un evento de auditoria en
// events/{sesionId-rev} que no se puede modificar ni borrar. Nada se mueve sin que el usuario lo
// confirme: aqui solo se comprueba y se prepara la escritura.
import { PERIODO, cupoDia, examenDe, restriccionesDia, materiaPorId } from './control.js';
import { esFechaISO } from './validate.js';
import { sumarDias, rangoFechas, formatoMinutos, formatoCorto } from '../lib/dates.js';

export const SCHEMA_REPROGRAMACION = 1;
export const MAX_MOTIVO = 200;

export const idEvento = (sesionId, rev) => `${sesionId}-${rev}`;

/**
 * Sesiones con su fecha vigente: la reprogramada si existe (y es distinta de la del plan). La
 * fecha del plan se conserva en `fechaPlan`. Devuelve la misma lista si no hay nada movido.
 */
export function aplicarReprogramaciones(sesiones, mapa) {
  if (!mapa || mapa.size === 0) return sesiones;
  return sesiones.map((s) => {
    const r = mapa.get(s.id);
    if (!r || !esFechaISO(r.fecha) || r.fecha === s.fecha) return s;
    return { ...s, fecha: r.fecha, fechaPlan: s.fecha, movida: true };
  });
}

/** Ultimo dia en que tiene sentido estudiar una materia: la vispera de su examen. */
export function ultimoDiaMateria(materiaId) {
  const ex = examenDe(materiaId);
  return ex ? sumarDias(ex.fecha, -1) : PERIODO.fin;
}

/** Primer dia al que se puede mover: hoy (o el inicio del periodo si aun no ha empezado). */
export const primerDiaMovible = (hoy) => (hoy > PERIODO.inicio ? hoy : PERIODO.inicio);

/** Minutos previstos de un dia sin contar `excluirId`. `sesiones` con fecha vigente. */
export function cargaDia(sesiones, iso, excluirId = null) {
  return sesiones.reduce((t, s) => (s.fecha === iso && s.id !== excluirId ? t + s.minutos : t), 0);
}

/**
 * Comprueba mover `sesion` (con su fecha vigente) a `destino`.
 * - `bloqueos` impiden moverla: misma fecha, fecha no valida o fuera del periodo, dia pasado,
 *   dia bloqueado, dia del examen o posterior, maximo explicito superado o sesion completada.
 * - `avisos` no la impiden pero el usuario los confirma de forma explicita: superar la carga
 *   habitual de ese dia o estudiar un dia con otro examen.
 * `sesiones` son las de toda la planificacion con su fecha vigente.
 */
export function comprobarMovimiento({ sesion, destino, sesiones, hoy, estado = null }) {
  const bloqueos = [];
  const avisos = [];
  const bloquea = (codigo, mensaje) => bloqueos.push({ codigo, mensaje });
  const avisa = (codigo, mensaje) => avisos.push({ codigo, mensaje });
  const base = { bloqueos, avisos, carga: null, cupo: null };

  if (estado === 'completada') bloquea('COMPLETADA', 'Está completada: márcala de nuevo como pendiente o parcial para moverla.');
  if (!esFechaISO(destino)) { bloquea('FECHA', 'Elige una fecha válida.'); return { ok: false, ...base }; }
  if (destino === sesion.fecha) { bloquea('MISMA_FECHA', 'Ya está en ese día.'); return { ok: false, ...base }; }
  if (destino < PERIODO.inicio || destino > PERIODO.fin) bloquea('PERIODO', 'Fuera del periodo de estudio.');
  else if (destino < primerDiaMovible(hoy)) bloquea('PASADA', 'No se puede mover a un día pasado.');

  const cupo = cupoDia(destino);
  const carga = cargaDia(sesiones, destino, sesion.id) + sesion.minutos;
  if (cupo.tipo === 'bloqueado') bloquea('BLOQUEADO', 'Día bloqueado: 0 h de estudio.');
  const ultimo = ultimoDiaMateria(sesion.materiaId);
  if (destino > ultimo && cupo.tipo !== 'fuera') {
    bloquea('EXAMEN', `El examen de ${materiaPorId(sesion.materiaId)?.corto ?? sesion.materiaId} es el ${formatoCorto(sumarDias(ultimo, 1))}: muévela antes.`);
  }
  if (cupo.tipo === 'limite' && carga > cupo.minutos) {
    bloquea('LIMITE', `Supera el máximo de ${formatoMinutos(cupo.minutos)} de ese día (quedaría en ${formatoMinutos(carga)}).`);
  }
  if (cupo.tipo === 'habitual' && carga > cupo.minutos) {
    avisa('CARGA', `Supera la carga habitual de ${formatoMinutos(cupo.minutos)} (quedaría en ${formatoMinutos(carga)}).`);
  }
  const otros = restriccionesDia(destino).examenes.filter((e) => e.materiaId !== sesion.materiaId);
  if (otros.length > 0 && bloqueos.length === 0) {
    avisa('DIA_EXAMEN', `Ese día hay examen de ${otros.map((e) => materiaPorId(e.materiaId).corto).join(' y ')}.`);
  }
  return {
    ok: bloqueos.length === 0, bloqueos, avisos, carga, cupo: cupo.tipo === 'fuera' ? null : cupo,
  };
}

/** Primeros `n` dias desde hoy a los que se puede mover la sesion sin bloqueos ni avisos. */
export function diasSugeridos({ sesion, sesiones, hoy, n = 3 }) {
  const desde = primerDiaMovible(hoy);
  const hasta = ultimoDiaMateria(sesion.materiaId);
  if (desde > hasta) return [];
  const out = [];
  for (const iso of rangoFechas(desde, hasta)) {
    if (iso === sesion.fecha) continue;
    const c = comprobarMovimiento({ sesion, destino: iso, sesiones, hoy });
    if (c.ok && c.avisos.length === 0) out.push({ fecha: iso, libre: c.cupo.minutos - c.carga });
    if (out.length === n) break;
  }
  return out;
}

/** Motivo opcional: texto plano de una linea recortado; null si supera el maximo. */
export function limpiarMotivo(texto) {
  if (typeof texto !== 'string') return '';
  const t = texto.replace(/\s+/g, ' ').trim();
  return t.length > MAX_MOTIVO ? null : t;
}

/**
 * Decide, dentro de la transaccion de Firestore, que escribir para dejar `sesionId` en `hasta`,
 * a partir del documento reschedules actual (o null). `revBase` es la revision que tenia la
 * pantalla cuando el usuario confirmo:
 * - misma revision: se escribe rev + 1 (documento y evento `sesionId-rev`, en la misma transaccion).
 * - otra revision y la sesion ya esta en `hasta`: 'existente' (doble clic, otra pestaña o un
 *   reintento tras perder la respuesta): no se escribe nada, no hay duplicados.
 * - otra revision y otra fecha: 'conflicto' (se movio en otra pestaña): no se pisa.
 * `desde` sale siempre del documento actual, no de la pantalla.
 */
export function resolverMovimiento(actual, {
  sesionId, revBase, hasta, fechaPlan, minutos, motivo = '', avisos = [],
}) {
  const rev = Number.isInteger(actual?.rev) ? actual.rev : 0;
  const desde = actual?.fecha ?? fechaPlan;
  if (rev !== revBase) return { accion: desde === hasta ? 'existente' : 'conflicto' };
  if (desde === hasta) return { accion: 'existente' };
  const nueva = rev + 1;
  return {
    accion: 'escribir',
    id: idEvento(sesionId, nueva),
    doc: { schemaVersion: SCHEMA_REPROGRAMACION, sesionId, fechaPlan, fecha: hasta, rev: nueva },
    evento: {
      schemaVersion: SCHEMA_REPROGRAMACION, tipo: 'reprogramacion', sesionId, rev: nueva,
      desde, hasta, fechaPlan, minutos, motivo, avisos: [...avisos],
    },
  };
}

/** Eventos de reprogramacion de una sesion, del mas reciente al mas antiguo. */
export function historialSesion(eventos, sesionId) {
  return eventos.filter((e) => e.tipo === 'reprogramacion' && e.sesionId === sesionId).sort((a, b) => b.rev - a.rev);
}
