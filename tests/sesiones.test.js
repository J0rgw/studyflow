import { describe, it, expect } from 'vitest';
import { minutosPorMateria, arbolPlan, sesionesDelDia, previstoHastaHoy } from '../src/data/sesiones.js';

const s = (id, fecha, materiaId, tema, minutos, orden = 1) => ({ id, fecha, materiaId, tema, minutos, orden, titulo: id, objetivo: '' });

const SESIONES = [
  s('a2', '2026-10-16', 'algebra', 'Rango', 60),
  s('r1', '2026-10-15', 'requisitos', '4.1 Captura', 90, 2),
  s('a1', '2026-10-15', 'algebra', 'Determinantes', 150, 1),
  s('a3', '2026-10-17', 'algebra', 'Determinantes', 30),
];

describe('consultas de sesiones', () => {
  it('sesionesDelDia respeta el orden del plan', () => {
    expect(sesionesDelDia(SESIONES, '2026-10-15').map((x) => x.id)).toEqual(['a1', 'r1']);
  });
  it('minutosPorMateria agrupa en orden de prioridad y omite materias sin carga', () => {
    expect(minutosPorMateria(SESIONES, '2026-10-15')).toEqual([
      { materiaId: 'algebra', minutos: 150 },
      { materiaId: 'requisitos', minutos: 90 },
    ]);
    expect(minutosPorMateria(SESIONES, '2026-10-20')).toEqual([]);
  });
  it('previstoHastaHoy separa lo programado hasta hoy (incluido) del total, por materia', () => {
    const r = previstoHastaHoy(SESIONES, '2026-10-16');
    expect(r.find((x) => x.materiaId === 'algebra')).toEqual({ materiaId: 'algebra', total: 240, hasta: 210 });
    expect(r.find((x) => x.materiaId === 'requisitos')).toEqual({ materiaId: 'requisitos', total: 90, hasta: 90 });
    expect(r.find((x) => x.materiaId === 'tac')).toEqual({ materiaId: 'tac', total: 0, hasta: 0 });
  });
  it('arbolPlan agrupa materia > tema > sesion sin inventar materias vacias', () => {
    const arbol = arbolPlan(SESIONES);
    expect(arbol.map((g) => g.materia.id)).toEqual(['algebra', 'requisitos']);
    const algebra = arbol[0];
    expect(algebra).toMatchObject({ minutos: 240, total: 3 });
    expect(algebra.temas.map((t) => [t.tema, t.minutos, t.sesiones.map((x) => x.id)])).toEqual([
      ['Determinantes', 180, ['a1', 'a3']],
      ['Rango', 60, ['a2']],
    ]);
  });
});
