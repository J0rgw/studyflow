import { describe, it, expect } from 'vitest';
import { ahoraMadrid, cuadriculaMes, diasEntre, sumarMeses, formatoMinutos, formatoLargo } from '../src/lib/dates.js';

describe('fechas', () => {
  it('usa la zona Europe/Madrid (cambio de dia respecto a UTC)', () => {
    // 23:30 UTC del 14/10 ya es 01:30 del 15/10 en Madrid (CEST, UTC+2).
    expect(ahoraMadrid(new Date('2026-10-14T23:30:00Z'))).toEqual({ fecha: '2026-10-15', hora: '01:30' });
  });
  it('cuadricula de octubre 2026 empieza en lunes y tiene semanas completas', () => {
    const g = cuadriculaMes(2026, 10);
    expect(g.every((s) => s.length === 7)).toBe(true);
    expect(g[0][0].iso).toBe('2026-09-28');
    expect(g.flat().find((d) => d.iso === '2026-10-01').delMes).toBe(true);
    expect(g.flat().filter((d) => d.delMes)).toHaveLength(31);
  });
  it('diasEntre y sumarMeses', () => {
    expect(diasEntre('2026-10-15', '2026-11-07')).toBe(23);
    expect(sumarMeses(2026, 12, 1)).toEqual({ y: 2027, m: 1 });
    expect(sumarMeses(2026, 1, -1)).toEqual({ y: 2025, m: 12 });
  });
  it('formatos', () => {
    expect(formatoMinutos(150)).toBe('2 h 30 min');
    expect(formatoMinutos(120)).toBe('2 h');
    expect(formatoLargo('2026-10-15')).toMatch(/jueves, 15 de octubre de 2026/);
  });
});
