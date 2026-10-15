import { describe, it, expect } from 'vitest';
import { analizarTexto, calcularDiff, documentoSesion, aEscribir, trocear, MAX_BYTES } from '../src/data/importer.js';

const base = {
  schemaVersion: 1, planId: 'p1', titulo: 'Plan', origen: { etiqueta: 'prueba' }, completo: false,
  sesiones: [
    { id: 'a', fecha: '2026-10-15', materiaId: 'algebra', titulo: 'A', tema: 'T', objetivo: 'O', minutos: 60, orden: 1 },
    { id: 'b', fecha: '2026-10-16', materiaId: 'tac', titulo: 'B', tema: 'T', objetivo: 'O', minutos: 30, orden: 1 },
  ],
};
const plan = () => analizarTexto(JSON.stringify(base)).resultado.plan;

describe('analizarTexto', () => {
  it('rechaza vacio, no JSON y archivos enormes', () => {
    expect(analizarTexto('').ok).toBe(false);
    expect(analizarTexto('{no').mensaje).toMatch(/JSON/);
    expect(analizarTexto(' '.repeat(MAX_BYTES + 1)).ok).toBe(false);
  });
  it('devuelve el informe de validacion', () => {
    const r = analizarTexto(JSON.stringify(base));
    expect(r.ok && r.resultado.ok).toBe(true);
  });
});

describe('calcularDiff (idempotencia)', () => {
  it('primera importacion: todo nuevo', () => {
    const d = calcularDiff(plan(), new Map());
    expect(d.nuevas).toHaveLength(2);
    expect(aEscribir(d)).toHaveLength(2);
  });
  it('reimportar lo mismo no escribe nada', () => {
    const p = plan();
    const guardado = new Map(p.sesiones.map((s) => [s.id, documentoSesion(p, s)]));
    const d = calcularDiff(p, guardado);
    expect(d.sinCambios).toHaveLength(2);
    expect(aEscribir(d)).toHaveLength(0);
  });
  it('detecta modificadas y conserva las ausentes sin borrarlas', () => {
    const p = plan();
    const guardado = new Map(p.sesiones.map((s) => [s.id, documentoSesion(p, s)]));
    guardado.set('vieja', { ...documentoSesion(p, p.sesiones[0]) });
    p.sesiones[0].minutos = 90;
    const d = calcularDiff(p, guardado);
    expect(d.modificadas.map((m) => m.id)).toEqual(['a']);
    expect(d.ausentes.map((a) => a.id)).toEqual(['vieja']);
    expect(aEscribir(d).map((x) => x.id)).not.toContain('vieja');
  });
  it('un id que pertenece a otro plan es conflicto y no se escribe', () => {
    const p = plan();
    const d = calcularDiff(p, new Map([['a', { ...documentoSesion(p, p.sesiones[0]), planId: 'otro' }]]));
    expect(d.conflictos.map((c) => c.id)).toEqual(['a']);
    expect(aEscribir(d).map((x) => x.id)).toEqual(['b']);
  });
  it('el documento de sesion no incluye estado ni progreso', () => {
    const claves = Object.keys(documentoSesion(plan(), plan().sesiones[0]));
    for (const prohibido of ['estado', 'minutosEfectivos', 'notas', 'status']) expect(claves).not.toContain(prohibido);
  });
});

describe('trocear', () => {
  it('respeta el maximo por lote', () => {
    const lotes = trocear(Array.from({ length: 950 }, (_, i) => i), 400);
    expect(lotes.map((l) => l.length)).toEqual([400, 400, 150]);
  });
});
