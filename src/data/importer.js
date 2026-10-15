// Importacion de planes: lectura segura del texto, comparacion con lo ya guardado y lotes.
// Idempotente: los IDs son los del archivo y solo se escriben sesiones nuevas o cambiadas.
// Los documentos de sesion contienen SOLO datos del plan; el progreso vive en otras colecciones,
// asi reimportar nunca lo pisa ni lo borra.
import { validarPlan } from './validate.js';
import { SCHEMA_VERSION } from './schema.js';

export const MAX_BYTES = 1024 * 1024;
export const TAMANO_LOTE = 400; // Firestore admite 500 operaciones por lote.
const CAMPOS = ['planId', 'fecha', 'materiaId', 'titulo', 'tema', 'objetivo', 'minutos', 'orden', 'prueba'];

/** Texto JSON -> { ok, resultado } con el informe de validacion, o { ok:false, mensaje }. */
export function analizarTexto(texto) {
  if (typeof texto !== 'string' || texto.length === 0) return { ok: false, mensaje: 'El archivo está vacío.' };
  if (texto.length > MAX_BYTES) return { ok: false, mensaje: 'El archivo supera 1 MB: no parece un plan válido.' };
  let datos;
  try { datos = JSON.parse(texto); } catch { return { ok: false, mensaje: 'El archivo no es JSON válido.' }; }
  return { ok: true, resultado: validarPlan(datos) };
}

/** Documento de sesion tal como se guarda en Firestore (sin estado ni logs). */
export function documentoSesion(plan, sesion) {
  return {
    schemaVersion: SCHEMA_VERSION,
    planId: plan.planId,
    fecha: sesion.fecha,
    materiaId: sesion.materiaId,
    titulo: sesion.titulo,
    tema: sesion.tema,
    objetivo: sesion.objetivo,
    minutos: sesion.minutos,
    orden: sesion.orden,
    prueba: plan.origen.etiqueta === 'prueba',
  };
}

function iguales(a, b) { return CAMPOS.every((c) => a[c] === b[c]); }

/**
 * Compara el plan validado con las sesiones ya guardadas (mapa id -> doc).
 * nuevas/modificadas se escribiran; sinCambios no se toca; ausentes (del mismo plan)
 * se CONSERVAN: reimportar no borra nada. Una sesion con id de otro plan es conflicto.
 */
export function calcularDiff(plan, existentes) {
  const mapa = existentes instanceof Map ? existentes : new Map(Object.entries(existentes));
  const nuevas = []; const modificadas = []; const sinCambios = []; const conflictos = [];
  const ids = new Set();
  for (const s of plan.sesiones) {
    ids.add(s.id);
    const doc = documentoSesion(plan, s);
    const previo = mapa.get(s.id);
    if (!previo) nuevas.push({ id: s.id, doc });
    else if (previo.planId !== plan.planId) conflictos.push({ id: s.id, planPrevio: previo.planId });
    else if (iguales(previo, doc)) sinCambios.push({ id: s.id });
    else modificadas.push({ id: s.id, doc, antes: previo });
  }
  const ausentes = [...mapa].filter(([id, d]) => d.planId === plan.planId && !ids.has(id)).map(([id]) => ({ id }));
  return { nuevas, modificadas, sinCambios, ausentes, conflictos };
}

export function aEscribir(diff) { return [...diff.nuevas, ...diff.modificadas]; }

/** Divide en lotes de tamano maximo `n`. */
export function trocear(lista, n = TAMANO_LOTE) {
  const lotes = [];
  for (let i = 0; i < lista.length; i += n) lotes.push(lista.slice(i, i + n));
  return lotes;
}
