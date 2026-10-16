import { describe, it, expect } from 'vitest';
import {
  ahoraMadrid, cuadriculaMes, diasEntre, sumarMeses, formatoMinutos, formatoLargo,
  instanteMadrid, fraccion, restante, formatoCorto, diaSemana, sumarDias, rangoFechas, horasDecimal,
} from '../src/lib/dates.js';

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
    expect(formatoCorto('2026-10-15')).toBe('jue 15 oct');
    expect(horasDecimal(150)).toBe('2,5');
    expect(horasDecimal(120)).toBe('2');
    expect(horasDecimal(2310)).toBe('38,5');
  });
  it('instanteMadrid respeta CEST (octubre) y CET (noviembre)', () => {
    expect(new Date(instanteMadrid('2026-10-15', '09:00')).toISOString()).toBe('2026-10-15T07:00:00.000Z');
    expect(new Date(instanteMadrid('2026-11-07', '09:00')).toISOString()).toBe('2026-11-07T08:00:00.000Z');
    // El cambio de hora es el 25/10 a las 03:00 CEST: las 12:00 de ese dia ya son CET.
    expect(new Date(instanteMadrid('2026-10-25', '12:00')).toISOString()).toBe('2026-10-25T11:00:00.000Z');
  });
  it('fraccion y restante', () => {
    expect(fraccion(0, 100, 25)).toBe(0.25);
    expect(fraccion(0, 100, -5)).toBe(0);
    expect(fraccion(0, 100, 500)).toBe(1);
    expect(restante((2 * 1440 + 3 * 60 + 4) * 60000 + 59900)).toEqual({ d: 2, h: 3, m: 4, s: 59 });
    expect(restante(-1000)).toEqual({ d: 0, h: 0, m: 0, s: 0 });
  });
  it('dias de la semana y rangos', () => {
    expect(diaSemana('2026-10-19')).toBe(0); // lunes
    expect(diaSemana('2026-10-18')).toBe(6); // domingo
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01');
    const periodo = rangoFechas('2026-10-14', '2026-11-08');
    expect(periodo).toHaveLength(26);
    expect(periodo.at(-1)).toBe('2026-11-08');
  });
});
