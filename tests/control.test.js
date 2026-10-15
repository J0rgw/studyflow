import { describe, it, expect } from 'vitest';
import {
  MATERIAS, TOTAL_HORAS_PREVISTAS, restriccionesDia, proximoExamen, EXAMENES,
} from '../src/data/control.js';

describe('datos de control', () => {
  it('las horas por materia suman 104', () => {
    expect(MATERIAS.reduce((s, m) => s + m.horas, 0)).toBe(TOTAL_HORAS_PREVISTAS);
    expect(TOTAL_HORAS_PREVISTAS).toBe(104);
  });
  it('bloqueos 20-22/10 con 0 minutos', () => {
    for (const d of ['2026-10-20', '2026-10-21', '2026-10-22']) {
      expect(restriccionesDia(d)).toMatchObject({ bloqueado: true, maxMin: 0 });
    }
  });
  it('limites 27/10 y 03/11 = 2 h; 06/11 = 4 h; dia normal sin limite', () => {
    expect(restriccionesDia('2026-10-27').maxMin).toBe(120);
    expect(restriccionesDia('2026-11-03').maxMin).toBe(120);
    expect(restriccionesDia('2026-11-06').maxMin).toBe(240);
    expect(restriccionesDia('2026-10-15').maxMin).toBeNull();
  });
  it('examenes con horario exacto', () => {
    expect(restriccionesDia('2026-11-07').examenes.map((e) => `${e.materiaId} ${e.inicio}-${e.fin}`))
      .toEqual(['requisitos 09:00-11:00', 'algebra 11:00-14:00']);
    expect(restriccionesDia('2026-11-08').examenes.map((e) => `${e.materiaId} ${e.inicio}-${e.fin}`))
      .toEqual(['moviles 09:00-11:00', 'tac 11:00-14:00']);
    expect(EXAMENES).toHaveLength(4);
  });
  it('periodo 14/10-08/11', () => {
    expect(restriccionesDia('2026-10-13').enPeriodo).toBe(false);
    expect(restriccionesDia('2026-10-14').enPeriodo).toBe(true);
    expect(restriccionesDia('2026-11-08').enPeriodo).toBe(true);
    expect(restriccionesDia('2026-11-09').enPeriodo).toBe(false);
  });
  it('proximoExamen respeta fecha y hora', () => {
    expect(proximoExamen('2026-10-15', '10:00').materiaId).toBe('requisitos');
    expect(proximoExamen('2026-11-07', '12:00').materiaId).toBe('algebra');
    expect(proximoExamen('2026-11-08', '15:00')).toBeNull();
  });
});
