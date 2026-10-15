// Validacion exhaustiva de un plan JSON (schemaVersion 1). Pura y sin Firebase.
// Devuelve discrepancias; los errores bloquean la importacion, los avisos solo informan.
import { SCHEMA_VERSION } from './schema.js';
import {
  MATERIAS, EXAMENES, PERIODO, TOTAL_HORAS_PREVISTAS, REFERENCIAS_DIA, restriccionesDia, materiaPorId,
} from './control.js';
import { toISO } from '../lib/dates.js';

export const MAX_SESIONES = 500;
const RE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CAMPOS_SESION = ['id', 'fecha', 'materiaId', 'titulo', 'tema', 'objetivo', 'minutos', 'orden'];
const CAMPOS_HORA = ['hora', 'horaInicio', 'inicio', 'fin', 'start', 'end'];
const MAX_TEXTO = { titulo: 120, tema: 200, objetivo: 500 };
const MAX_MIN_SESION = 480;

export function esFechaISO(v) {
  if (typeof v !== 'string' || !RE_FECHA.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  return toISO(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate()) === v;
}

function esObjeto(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

/** Limite diario: errores para bloqueos y limites explicitos; aviso para el resto. */
function dia(iso) {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

export function validarPlan(plan) {
  const items = [];
  const error = (codigo, mensaje, ref) => items.push({ nivel: 'error', codigo, mensaje, ref });
  const aviso = (codigo, mensaje, ref) => items.push({ nivel: 'aviso', codigo, mensaje, ref });
  const salida = () => ({
    ok: !items.some((i) => i.nivel === 'error'),
    errores: items.filter((i) => i.nivel === 'error'),
    avisos: items.filter((i) => i.nivel === 'aviso'),
    plan: items.some((i) => i.nivel === 'error') ? null : normalizar(plan),
    resumen: resumir(plan),
  });

  if (!esObjeto(plan)) { error('RAIZ', 'El archivo debe contener un objeto JSON.'); return salida(); }
  if (plan.schemaVersion !== SCHEMA_VERSION) {
    error('VERSION', `schemaVersion debe ser ${SCHEMA_VERSION} (recibido: ${JSON.stringify(plan.schemaVersion)}).`);
    return salida();
  }
  if (typeof plan.planId !== 'string' || !RE_ID.test(plan.planId)) error('PLAN_ID', 'planId obligatorio: letras, números, guion y guion bajo (máx. 64).');
  if (typeof plan.titulo !== 'string' || !plan.titulo.trim()) error('TITULO', 'El plan necesita un titulo.');
  if (!esObjeto(plan.origen) || !['real', 'prueba'].includes(plan.origen.etiqueta)) {
    error('ORIGEN', 'origen.etiqueta debe ser "real" o "prueba": los datos de prueba nunca se presentan como reales.');
  } else if (plan.origen.etiqueta === 'real' && (typeof plan.origen.fuente !== 'string' || !plan.origen.fuente.trim())) {
    error('FUENTE', 'Un plan "real" debe indicar origen.fuente (el plan original de donde sale).');
  }
  if (typeof plan.completo !== 'boolean') error('COMPLETO', 'completo debe ser true o false (un plan parcial no se valida contra las 104 h).');
  if (!Array.isArray(plan.sesiones)) { error('SESIONES', 'sesiones debe ser una lista.'); return salida(); }
  if (plan.sesiones.length > MAX_SESIONES) { error('DEMASIADAS', `Máximo ${MAX_SESIONES} sesiones.`); return salida(); }
  if (plan.sesiones.length === 0) error('VACIO', 'El plan no contiene sesiones.');

  // Sesiones una a una
  const ids = new Set();
  const validas = [];
  plan.sesiones.forEach((s, i) => {
    const ref = `sesión #${i + 1}${esObjeto(s) && typeof s.id === 'string' ? ` (${s.id})` : ''}`;
    if (!esObjeto(s)) { error('SESION', 'No es un objeto.', ref); return; }
    let bien = true;
    const falla = (c, m) => { error(c, m, ref); bien = false; };
    if (typeof s.id !== 'string' || !RE_ID.test(s.id)) falla('ID', 'id obligatorio y estable (letras, números, guion).');
    else if (ids.has(s.id)) falla('ID_DUP', 'id repetido.');
    else ids.add(s.id);
    if (!esFechaISO(s.fecha)) falla('FECHA', 'fecha debe ser una fecha real AAAA-MM-DD.');
    else if (s.fecha < PERIODO.inicio || s.fecha > PERIODO.fin) falla('PERIODO', `fecha fuera del periodo ${PERIODO.inicio} a ${PERIODO.fin}.`);
    if (!materiaPorId(s.materiaId)) falla('MATERIA', `materiaId desconocido (${JSON.stringify(s.materiaId)}).`);
    for (const [campo, max] of Object.entries(MAX_TEXTO)) {
      if (typeof s[campo] !== 'string' || !s[campo].trim()) falla('TEXTO', `${campo} obligatorio.`);
      else if (s[campo].length > max) falla('TEXTO', `${campo} supera ${max} caracteres.`);
    }
    if (!Number.isInteger(s.minutos) || s.minutos <= 0 || s.minutos > MAX_MIN_SESION) falla('MINUTOS', `minutos debe ser un entero entre 1 y ${MAX_MIN_SESION}.`);
    if (!Number.isInteger(s.orden) || s.orden < 0) falla('ORDEN', 'orden debe ser un entero >= 0.');
    for (const c of CAMPOS_HORA) {
      if (c in s) falla('HORA', `"${c}": la fuente no fija hora de inicio; las sesiones son bloques de duración.`);
    }
    for (const c of Object.keys(s)) {
      if (!CAMPOS_SESION.includes(c) && !CAMPOS_HORA.includes(c)) aviso('CAMPO', `Campo desconocido "${c}" (se ignora).`, ref);
    }
    if (bien) validas.push(s);
  });

  // Exámenes opcionales: deben coincidir con los de control
  if (plan.examenes !== undefined) {
    const esperado = JSON.stringify(EXAMENES.map(({ materiaId, fecha, inicio, fin }) => ({ materiaId, fecha, inicio, fin })));
    const recibido = Array.isArray(plan.examenes)
      ? JSON.stringify(plan.examenes.map(({ materiaId, fecha, inicio, fin }) => ({ materiaId, fecha, inicio, fin }))) : null;
    if (esperado !== recibido) error('EXAMENES', 'Los exámenes del archivo no coinciden con los verificados (07/11 Requisitos 09-11 y Álgebra 11-14; 08/11 Móviles 09-11 y TAC 11-14).');
  }

  // Reparto por día
  const porDia = new Map();
  for (const s of validas) {
    const d = porDia.get(s.fecha) ?? { total: 0, materias: {} };
    d.total += s.minutos;
    d.materias[s.materiaId] = (d.materias[s.materiaId] ?? 0) + s.minutos;
    porDia.set(s.fecha, d);
  }
  for (const [fecha, d] of [...porDia].sort()) {
    const r = restriccionesDia(fecha);
    if (r.bloqueado) error('BLOQUEADO', `${fecha} es un día bloqueado (0 h) pero tiene ${d.total} min.`, fecha);
    else if (r.maxMin != null && d.total > r.maxMin) error('LIMITE', `${fecha}: ${d.total} min superan el máximo de ${r.maxMin} min.`, fecha);
    else if (r.maxMin == null && d.total > (dia(fecha) ? 360 : 300)) aviso('CARGA', `${fecha}: ${d.total} min superan la carga habitual (${dia(fecha) ? '6' : '5'} h).`, fecha);
    if (r.examenes.length > 0) aviso('DIA_EXAMEN', `${fecha} tiene examen y sesiones de estudio: comprueba que son repaso previo.`, fecha);
  }

  // Referencias verificadas: exactas si el plan es completo, informativas si es parcial
  for (const [fecha, ref] of Object.entries(REFERENCIAS_DIA)) {
    const d = porDia.get(fecha);
    if (!d && plan.completo !== true) continue;
    const real = d?.materias ?? {};
    const claves = new Set([...Object.keys(ref), ...Object.keys(real)]);
    const dif = [...claves].filter((k) => (ref[k] ?? 0) !== (real[k] ?? 0))
      .map((k) => `${materiaPorId(k)?.corto ?? k}: esperado ${ref[k] ?? 0}, plan ${real[k] ?? 0}`);
    if (dif.length) (plan.completo === true ? error : aviso)('REFERENCIA', `${fecha} no cuadra con la referencia verificada (${dif.join('; ')}).`, fecha);
  }

  // Sumas totales (bloquean solo en planes completos; no se rellenan huecos)
  const porMateria = {};
  for (const s of validas) porMateria[s.materiaId] = (porMateria[s.materiaId] ?? 0) + s.minutos;
  if (plan.completo === true) {
    for (const m of MATERIAS) {
      const real = porMateria[m.id] ?? 0;
      if (real !== m.horas * 60) error('SUMA_MATERIA', `${m.nombre}: el plan suma ${real} min y debería sumar ${m.horas * 60} (${m.horas} h). Diferencia: ${real - m.horas * 60} min.`, m.id);
    }
    const total = Object.values(porMateria).reduce((a, b) => a + b, 0);
    if (total !== TOTAL_HORAS_PREVISTAS * 60) error('SUMA_TOTAL', `El plan suma ${total} min y debería sumar ${TOTAL_HORAS_PREVISTAS * 60} (${TOTAL_HORAS_PREVISTAS} h).`);
  } else if (validas.length > 0) {
    aviso('PARCIAL', 'Plan parcial: no se comprueba contra las 104 h ni se completan huecos.');
  }
  if (plan.origen?.etiqueta === 'prueba') aviso('PRUEBA', 'Datos de PRUEBA: se marcarán como tales en la aplicación.');

  return salida();
}

function resumir(plan) {
  const sesiones = esObjeto(plan) && Array.isArray(plan.sesiones) ? plan.sesiones.filter(esObjeto) : [];
  const porMateria = {};
  let total = 0;
  for (const s of sesiones) {
    if (Number.isInteger(s.minutos) && materiaPorId(s.materiaId)) {
      porMateria[s.materiaId] = (porMateria[s.materiaId] ?? 0) + s.minutos;
      total += s.minutos;
    }
  }
  return { sesiones: sesiones.length, minutosTotal: total, porMateria };
}

/** Plan limpio: solo campos conocidos, listo para persistir. */
function normalizar(plan) {
  return {
    schemaVersion: SCHEMA_VERSION,
    planId: plan.planId,
    titulo: plan.titulo.trim(),
    origen: { etiqueta: plan.origen.etiqueta, ...(plan.origen.fuente ? { fuente: String(plan.origen.fuente).trim() } : {}) },
    completo: plan.completo,
    sesiones: plan.sesiones.map((s) => ({
      id: s.id, fecha: s.fecha, materiaId: s.materiaId,
      titulo: s.titulo.trim(), tema: s.tema.trim(), objetivo: s.objetivo.trim(),
      minutos: s.minutos, orden: s.orden,
    })),
  };
}
