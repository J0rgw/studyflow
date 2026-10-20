import { describe, it, expect } from 'vitest';
import {
  resumenMaterias, resumenGlobal, historicoDiario, historicoSemanal, riesgo, trabajadoPorMateria,
} from '../src/data/estadisticas.js';
import { estadoEfectivo, resultadoValido } from '../src/data/progreso.js';

const MIN = 60_000;
const HOY = '2026-10-17';
const sesiones = [
  { id: 'alg-1', fecha: '2026-10-15', materiaId: 'algebra', minutos: 60 },
  { id: 'alg-2', fecha: '2026-10-16', materiaId: 'algebra', minutos: 60 },
  { id: 'alg-3', fecha: '2026-10-17', materiaId: 'algebra', minutos: 90 },
  { id: 'alg-4', fecha: '2026-10-25', materiaId: 'algebra', minutos: 120 },
  { id: 'tac-1', fecha: '2026-10-16', materiaId: 'tac', minutos: 60 },
];
const reg = (sesionId, materiaId, fecha, min) => ({ sesionId, materiaId, fecha, focoMs: min * MIN, inicio: 1, fin: 2 });
const registros = [
  reg('alg-1', 'algebra', '2026-10-15', 40.5),
  reg(null, 'algebra', '2026-10-16', 20), // foco libre con materia
  reg('tac-1', 'tac', '2026-10-16', 60),
  reg(null, null, '2026-10-16', 10), // foco libre sin materia
];
const progreso = new Map([
  ['alg-1', { estado: 'completada', resultado: 'logrado' }],
  ['alg-2', { resultado: 'con-ayuda' }],
  ['tac-1', { resultado: 'otra-cosa' }],
]);
const porId = (lista, id) => lista.find((m) => m.materiaId === id);

describe('previsto frente a trabajado por materia', () => {
  const materias = resumenMaterias({ sesiones, registros, progreso, hoy: HOY });
  const alg = porId(materias, 'algebra');

  it('separa previsto vencido, hasta hoy y total', () => {
    expect(alg).toMatchObject({ total: 330, vencido: 120, hastaHoy: 210 });
  });
  it('trabajado = foco confirmado de la materia (sesiones y foco libre), redondeado hacia abajo', () => {
    expect(alg.trabajado).toBe(60);
    expect(trabajadoPorMateria(registros).get(null)).toBe(10 * MIN);
  });
  it('deficit = previsto en dias pasados menos trabajado; pendiente = total menos trabajado', () => {
    expect(alg.deficit).toBe(60);
    expect(alg.pendiente).toBe(270);
    expect(porId(materias, 'tac')).toMatchObject({ vencido: 60, trabajado: 60, deficit: 0, riesgo: 'al-dia' });
  });
  it('sesiones completadas solo si se marcaron a mano; el tiempo no completa nada', () => {
    expect(alg.completadas).toBe(1);
    expect(porId(materias, 'tac').completadas).toBe(0);
    expect(estadoEfectivo({ trabajadoMs: 600 * MIN })).not.toBe('completada');
  });
  it('resultados verificables contados aparte del tiempo', () => {
    expect(alg.resultados).toEqual({ logrado: 1, 'con-ayuda': 1, 'no-logrado': 0 });
    expect(porId(materias, 'tac').resultados).toEqual({ logrado: 0, 'con-ayuda': 0, 'no-logrado': 0 });
    expect(resultadoValido(null)).toBe(true);
    expect(resultadoValido('otra-cosa')).toBe(false);
  });
  it('sin sesiones: todo a cero, sin inventar', () => {
    expect(porId(materias, 'moviles')).toMatchObject({ total: 0, trabajado: 0, deficit: 0, sesiones: 0, riesgo: 'al-dia' });
  });
  it('riesgo descriptivo por deficit y cercania del examen', () => {
    expect(alg.diasExamen).toBe(21);
    expect(alg.riesgo).toBe('deficit');
    expect(riesgo({ deficit: 60, diasExamen: 7 })).toBe('deficit-cerca');
    expect(riesgo({ deficit: 29, diasExamen: 2 })).toBe('al-dia');
    expect(riesgo({ deficit: 300, diasExamen: -1 })).toBe('pasado');
  });

  it('global: el foco libre sin materia suma al total pero no a ninguna materia', () => {
    const g = resumenGlobal(materias, registros);
    expect(g).toMatchObject({ total: 390, vencido: 180, trabajadoMaterias: 120, sinMateria: 10, deficit: 60, completadas: 1, logrados: 1 });
    expect(g.trabajado).toBe(130);
  });
});

describe('historico', () => {
  it('diario: un dia por fecha del periodo; trabajado por el dia real del registro', () => {
    const dias = historicoDiario({ sesiones, registros });
    expect(dias).toHaveLength(26);
    expect(dias[0].fecha).toBe('2026-10-14');
    expect(dias.at(-1).fecha).toBe('2026-11-08');
    const d16 = dias.find((d) => d.fecha === '2026-10-16');
    expect(d16).toMatchObject({ previsto: 120, trabajado: 90 });
    expect(dias.find((d) => d.fecha === '2026-10-21').cupo.tipo).toBe('bloqueado');
  });
  it('semanal: de lunes a domingo recortado al periodo', () => {
    const semanas = historicoSemanal({ sesiones, registros, progreso });
    expect(semanas.map((w) => [w.desde, w.hasta])).toEqual([
      ['2026-10-14', '2026-10-18'], ['2026-10-19', '2026-10-25'], ['2026-10-26', '2026-11-01'], ['2026-11-02', '2026-11-08'],
    ]);
    expect(semanas[0]).toMatchObject({ previsto: 270, trabajado: 130, sesiones: 4, completadas: 1 });
    expect(semanas[1]).toMatchObject({ previsto: 120, trabajado: 0, sesiones: 1, completadas: 0 });
  });
});
