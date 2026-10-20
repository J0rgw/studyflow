import { describe, it, expect } from 'vitest';
import {
  estadoEfectivo, trabajadoPorSesion, trabajadoDelDia, registrosDeSesion, minutos, limpiarNota, MAX_NOTA,
  objetivoSesion, modoSesion,
} from '../src/data/progreso.js';

const MIN = 60_000;

describe('estado de una sesion', () => {
  it('el tiempo nunca completa una sesion: sin marca manual es parcial', () => {
    expect(estadoEfectivo({ trabajadoMs: 0 })).toBe('pendiente');
    expect(estadoEfectivo({ trabajadoMs: 600 * MIN })).toBe('parcial');
  });
  it('lo marcado por el usuario manda; el foco activo se ve como en curso', () => {
    expect(estadoEfectivo({ manual: 'completada' })).toBe('completada');
    expect(estadoEfectivo({ manual: 'pospuesta', trabajadoMs: 20 * MIN })).toBe('pospuesta');
    expect(estadoEfectivo({ manual: 'pendiente', trabajadoMs: 20 * MIN })).toBe('pendiente');
    expect(estadoEfectivo({ manual: 'completada', enCurso: true })).toBe('en-curso');
    expect(estadoEfectivo({ manual: 'inventado' })).toBe('pendiente');
  });
});

describe('tiempo trabajado', () => {
  const registros = [
    { sesionId: 'a', focoMs: 25 * MIN, inicio: 1 },
    { sesionId: 'a', focoMs: 12 * MIN + 59_000, inicio: 3 },
    { sesionId: 'b', focoMs: 50 * MIN, inicio: 2 },
  ];
  it('suma por sesion y redondea hacia abajo', () => {
    const mapa = trabajadoPorSesion(registros);
    expect(minutos(mapa.get('a'))).toBe(37);
    expect(registrosDeSesion(registros, 'a').map((r) => r.inicio)).toEqual([3, 1]);
  });
  it('trabajado del dia por materia segun las sesiones previstas ese dia', () => {
    const sesiones = [
      { id: 'a', fecha: '2026-10-23', materiaId: 'algebra' },
      { id: 'b', fecha: '2026-10-24', materiaId: 'tac' },
    ];
    expect(trabajadoDelDia(sesiones, trabajadoPorSesion(registros), '2026-10-23')).toEqual([{ materiaId: 'algebra', minutos: 37 }]);
  });
});

describe('notas', () => {
  it('texto plano recortado y con limite', () => {
    expect(limpiarNota('  hola\r\nadios  ')).toBe('hola\nadios');
    expect(limpiarNota('x'.repeat(MAX_NOTA + 1))).toBeNull();
    expect(limpiarNota(null)).toBe('');
  });
});

describe('objetivo de foco de una sesion', () => {
  const s = { id: 'a', minutos: 60 };
  it('por defecto lo previsto menos lo trabajado, en minutos enteros', () => {
    expect(objetivoSesion(s)).toEqual({ totalMin: 60, previsto: true, restanteMs: 60 * MIN });
    expect(objetivoSesion(s, { trabajadoMs: 10.5 * MIN }).restanteMs).toBe(49 * MIN);
    expect(objetivoSesion(s, { trabajadoMs: 60 * MIN }).restanteMs).toBeNull();
  });
  it('el objetivo querido sustituye a lo previsto si es valido', () => {
    expect(objetivoSesion(s, { objetivoMin: 90, trabajadoMs: 30 * MIN })).toEqual({ totalMin: 90, previsto: false, restanteMs: 60 * MIN });
    expect(objetivoSesion(s, { objetivoMin: 2 }).totalMin).toBe(60);
  });
  it('modo propio de la sesion o el general', () => {
    expect(modoSesion({ focoModo: '50-10' }, '25-5')).toBe('50-10');
    expect(modoSesion({ focoModo: 'raro' }, '25-5')).toBe('25-5');
    expect(modoSesion(undefined, 'libre')).toBe('libre');
  });
});
