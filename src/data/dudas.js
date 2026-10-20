// Dudas y errores por materia (reviews/{id}): texto plano, materia obligatoria, sesion opcional y
// estado pendiente -> en repaso -> resuelta. El id lo genera el cliente antes de guardar: repetir
// el guardado (doble clic, reintento) escribe el mismo documento y nunca duplica.
import { materiaPorId } from './control.js';

export const SCHEMA_DUDA = 1;
export const MAX_DUDA = 300;

export const ESTADOS_DUDA = Object.freeze(['pendiente', 'en-repaso', 'resuelta']);
export const NOMBRE_ESTADO_DUDA = Object.freeze({ pendiente: 'Pendiente', 'en-repaso': 'En repaso', resuelta: 'Resuelta' });

/** Siguiente estado al pulsar la accion de una duda (resuelta vuelve a pendiente: reabrir). */
export const SIGUIENTE_ESTADO = Object.freeze({ pendiente: 'en-repaso', 'en-repaso': 'resuelta', resuelta: 'pendiente' });

/** Texto de una duda: una o varias lineas recortadas; null si esta vacio o supera el maximo. */
export function limpiarDuda(texto) {
  if (typeof texto !== 'string') return null;
  const t = texto.replace(/\r\n/g, '\n').trim();
  return t.length === 0 || t.length > MAX_DUDA ? null : t;
}

/**
 * Documento de una duda nueva (sin las marcas de tiempo del servidor) o { error } si no es valida.
 * `fecha` es el dia de Madrid en que se apunta.
 */
export function nuevaDuda({ materiaId, sesionId = null, texto, fecha }) {
  if (!materiaPorId(materiaId)) return { error: 'Elige la materia.' };
  const t = limpiarDuda(texto);
  if (t === null) return { error: `Escribe la duda (máximo ${MAX_DUDA} caracteres).` };
  return { doc: { schemaVersion: SCHEMA_DUDA, materiaId, sesionId: sesionId ?? null, texto: t, estado: 'pendiente', fecha } };
}

const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : Number.POSITIVE_INFINITY);

/** Pendientes primero, luego en repaso y resueltas; dentro, la mas reciente primero. */
export function ordenarDudas(lista) {
  const orden = (e) => { const i = ESTADOS_DUDA.indexOf(e); return i === -1 ? 0 : i; };
  return [...lista].sort((a, b) => orden(a.estado) - orden(b.estado)
    || (b.fecha ?? '').localeCompare(a.fecha ?? '') || ms(b.creadoEn) - ms(a.creadoEn) || a.id.localeCompare(b.id));
}

/** Recuento por estado (las de estado desconocido cuentan como pendientes). */
export function contarDudas(lista) {
  const out = { pendiente: 0, 'en-repaso': 0, resuelta: 0 };
  for (const d of lista) out[ESTADOS_DUDA.includes(d.estado) ? d.estado : 'pendiente'] += 1;
  return out;
}
