import { describe, it, expect } from 'vitest';
import {
  nuevaDuda, limpiarDuda, ordenarDudas, contarDudas, SIGUIENTE_ESTADO, MAX_DUDA,
} from '../src/data/dudas.js';
import { puedeCerrar, resumenCierre, documentoCierre, MAX_TEXTO_CIERRE } from '../src/data/cierre.js';

const MIN = 60_000;

describe('dudas', () => {
  it('materia obligatoria y texto plano con limite', () => {
    expect(nuevaDuda({ materiaId: 'fisica', texto: 'x', fecha: '2026-10-17' }).error).toBeTruthy();
    expect(nuevaDuda({ materiaId: 'algebra', texto: '   ', fecha: '2026-10-17' }).error).toBeTruthy();
    expect(limpiarDuda('x'.repeat(MAX_DUDA + 1))).toBeNull();
    const { doc } = nuevaDuda({ materiaId: 'algebra', texto: '  <b>rango</b> de A  ', fecha: '2026-10-17' });
    expect(doc).toEqual({ schemaVersion: 1, materiaId: 'algebra', sesionId: null, texto: '<b>rango</b> de A', estado: 'pendiente', fecha: '2026-10-17' });
  });
  it('mismos datos, mismo documento: guardar dos veces con el mismo id no duplica', () => {
    const a = nuevaDuda({ materiaId: 'tac', sesionId: 'tac-1', texto: 'STP', fecha: '2026-10-17' });
    const b = nuevaDuda({ materiaId: 'tac', sesionId: 'tac-1', texto: 'STP', fecha: '2026-10-17' });
    expect(a).toEqual(b);
  });
  it('orden: pendientes, en repaso y resueltas; recientes primero', () => {
    const lista = [
      { id: 'a', estado: 'resuelta', fecha: '2026-10-17' },
      { id: 'b', estado: 'pendiente', fecha: '2026-10-15' },
      { id: 'c', estado: 'en-repaso', fecha: '2026-10-16' },
      { id: 'd', estado: 'pendiente', fecha: '2026-10-16' },
    ];
    expect(ordenarDudas(lista).map((d) => d.id)).toEqual(['d', 'b', 'c', 'a']);
    expect(contarDudas(lista)).toEqual({ pendiente: 2, 'en-repaso': 1, resuelta: 1 });
  });
  it('el ciclo de estados vuelve a pendiente al reabrir', () => {
    expect(SIGUIENTE_ESTADO.pendiente).toBe('en-repaso');
    expect(SIGUIENTE_ESTADO['en-repaso']).toBe('resuelta');
    expect(SIGUIENTE_ESTADO.resuelta).toBe('pendiente');
  });
});

describe('cierre del dia', () => {
  const sesiones = [
    { id: 'a', fecha: '2026-10-17', materiaId: 'algebra', minutos: 60, orden: 1 },
    { id: 'b', fecha: '2026-10-17', materiaId: 'tac', minutos: 30, orden: 2 },
    { id: 'c', fecha: '2026-10-18', materiaId: 'tac', minutos: 30, orden: 1 },
  ];
  const registros = [
    { sesionId: 'a', fecha: '2026-10-17', focoMs: 45 * MIN },
    { sesionId: 'b', fecha: '2026-10-16', focoMs: 10 * MIN }, // adelantado el dia anterior
    { sesionId: null, fecha: '2026-10-17', focoMs: 20 * MIN },
  ];
  const progreso = new Map([['a', { estado: 'completada', resultado: 'con-ayuda' }]]);

  it('solo dias del periodo ya empezados', () => {
    expect(puedeCerrar('2026-10-17', '2026-10-17')).toBe(true);
    expect(puedeCerrar('2026-10-18', '2026-10-17')).toBe(false);
    expect(puedeCerrar('2026-10-13', '2026-10-17')).toBe(false);
    expect(puedeCerrar('2026-13-01', '2026-10-17')).toBe(false);
  });
  it('resumen: objetivos revisados, pendiente y tiempo de las sesiones frente al del dia', () => {
    const r = resumenCierre({ fecha: '2026-10-17', sesiones, progreso, registros });
    expect(r.sesiones.map((s) => s.id)).toEqual(['a', 'b']);
    expect(r).toMatchObject({ previsto: 90, trabajadoSesiones: 55, trabajadoDia: 65, completadas: 1, revisadas: 1 });
    expect(r.pendientes.map((p) => [p.sesion.id, p.faltan])).toEqual([['b', 20]]);
  });
  it('documento: textos recortados, limite y el mismo resultado al repetir', () => {
    const a = documentoCierre('2026-10-17', { dificultades: '  inversa 3x3 \r\n', pendiente: undefined });
    expect(a.doc).toEqual({ schemaVersion: 1, fecha: '2026-10-17', dificultades: 'inversa 3x3', pendiente: '' });
    expect(documentoCierre('2026-10-17', { dificultades: '  inversa 3x3 \r\n' })).toEqual(a);
    expect(documentoCierre('2026-10-17', { dificultades: 'x'.repeat(MAX_TEXTO_CIERRE + 1) }).error).toBeTruthy();
    expect(documentoCierre('ayer', {}).error).toBeTruthy();
  });
});
