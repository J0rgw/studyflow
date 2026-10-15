import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validarPlan, esFechaISO } from '../src/data/validate.js';
import { MATERIAS } from '../src/data/control.js';

const sesion = (o = {}) => ({
  id: 's1', fecha: '2026-10-15', materiaId: 'algebra', titulo: 'T', tema: 'Tema', objetivo: 'Obj', minutos: 60, orden: 1, ...o,
});
const plan = (o = {}) => ({
  schemaVersion: 1, planId: 'p1', titulo: 'Plan', origen: { etiqueta: 'prueba' }, completo: false, sesiones: [sesion()], ...o,
});
const codigos = (r) => r.errores.map((e) => e.codigo);

describe('validarPlan - estructura', () => {
  it('acepta un plan parcial de prueba valido y lo normaliza', () => {
    const r = validarPlan(plan());
    expect(r.ok).toBe(true);
    expect(r.plan.sesiones).toHaveLength(1);
  });
  it('acepta el ejemplo del repositorio', () => {
    const ejemplo = JSON.parse(readFileSync(new URL('../examples/plan-prueba.json', import.meta.url), 'utf8'));
    expect(validarPlan(ejemplo).ok).toBe(true);
  });
  it('rechaza raiz no objeto y versiones distintas', () => {
    expect(codigos(validarPlan([]))).toContain('RAIZ');
    expect(codigos(validarPlan(plan({ schemaVersion: 2 })))).toContain('VERSION');
  });
  it('exige etiqueta de origen y fuente en planes reales', () => {
    expect(codigos(validarPlan(plan({ origen: {} })))).toContain('ORIGEN');
    expect(codigos(validarPlan(plan({ origen: { etiqueta: 'real' } })))).toContain('FUENTE');
  });
  it('detecta ids duplicados, fechas imposibles y fuera de periodo', () => {
    const r = validarPlan(plan({ sesiones: [sesion(), sesion(), sesion({ id: 'b', fecha: '2026-02-30' }), sesion({ id: 'c', fecha: '2026-12-01' })] }));
    expect(codigos(r)).toEqual(expect.arrayContaining(['ID_DUP', 'FECHA', 'PERIODO']));
    expect(esFechaISO('2026-02-30')).toBe(false);
  });
  it('rechaza materia desconocida, minutos invalidos y textos vacios', () => {
    const r = validarPlan(plan({ sesiones: [sesion({ materiaId: 'x', minutos: 0, titulo: ' ' }), sesion({ id: 'b', minutos: 1.5 })] }));
    expect(codigos(r)).toEqual(expect.arrayContaining(['MATERIA', 'MINUTOS', 'TEXTO']));
  });
  it('prohibe inventar hora de inicio', () => {
    expect(codigos(validarPlan(plan({ sesiones: [sesion({ horaInicio: '09:00' })] })))).toContain('HORA');
  });
  it('avisa de campos desconocidos y no los persiste', () => {
    const r = validarPlan(plan({ sesiones: [sesion({ extra: 1 })] }));
    expect(r.ok).toBe(true);
    expect(r.avisos.some((a) => a.codigo === 'CAMPO')).toBe(true);
    expect(r.plan.sesiones[0]).not.toHaveProperty('extra');
  });
});

describe('validarPlan - restricciones del plan maestro', () => {
  it('bloquea sesiones en dias bloqueados', () => {
    expect(codigos(validarPlan(plan({ sesiones: [sesion({ fecha: '2026-10-21' })] })))).toContain('BLOQUEADO');
  });
  it('bloquea superar 2 h el 27/10 y el 03/11 y 4 h el 06/11', () => {
    for (const [fecha, minutos] of [['2026-10-27', 121], ['2026-11-03', 121], ['2026-11-06', 241]]) {
      expect(codigos(validarPlan(plan({ sesiones: [sesion({ fecha, minutos })] })))).toContain('LIMITE');
    }
    expect(validarPlan(plan({ sesiones: [sesion({ fecha: '2026-10-27', minutos: 120 })] })).ok).toBe(true);
  });
  it('avisa (no bloquea) si un dia normal supera 5 h', () => {
    const r = validarPlan(plan({ sesiones: [sesion({ minutos: 301 })] }));
    expect(r.ok).toBe(true);
    expect(r.avisos.some((a) => a.codigo === 'CARGA')).toBe(true);
  });
  it('un plan parcial con un dia de referencia distinto solo avisa', () => {
    const r = validarPlan(plan({ sesiones: [sesion({ fecha: '2026-10-23', minutos: 100 })] }));
    expect(r.ok).toBe(true);
    expect(r.avisos.some((a) => a.codigo === 'REFERENCIA')).toBe(true);
  });
  it('rechaza examenes que no coinciden con los verificados', () => {
    expect(codigos(validarPlan(plan({ examenes: [] })))).toContain('EXAMENES');
  });
});

describe('validarPlan - plan completo (104 h)', () => {
  // Plan sintetico que cumple todas las sumas y referencias: solo existe en el test.
  function planCompleto() {
    const falta = Object.fromEntries(MATERIAS.map((m) => [m.id, m.horas * 60]));
    const sesiones = [];
    let n = 0;
    const add = (fecha, materiaId, minutos) => { falta[materiaId] -= minutos; sesiones.push(sesion({ id: `x${n++}`, fecha, materiaId, minutos, orden: n })); };
    add('2026-10-23', 'algebra', 150); add('2026-10-23', 'requisitos', 120); add('2026-10-23', 'tac', 30);
    add('2026-10-27', 'tac', 120);
    add('2026-11-06', 'algebra', 90); add('2026-11-06', 'requisitos', 90); add('2026-11-06', 'tac', 30); add('2026-11-06', 'moviles', 30);
    // El resto se reparte en bloques de 3 h en dias sin restriccion.
    const dias = ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-24', '2026-10-25', '2026-10-26',
      '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05'];
    let i = 0;
    for (const m of MATERIAS) {
      while (falta[m.id] > 0) { const t = Math.min(60, falta[m.id]); add(dias[i++ % dias.length], m.id, t); }
    }
    return plan({ completo: true, origen: { etiqueta: 'real', fuente: 'Calendario_Maestro' }, sesiones });
  }
  it('acepta un plan que cuadra exactamente', () => {
    const r = validarPlan(planCompleto());
    expect(r.errores).toEqual([]);
    expect(r.resumen.minutosTotal).toBe(104 * 60);
  });
  it('bloquea y senala la diferencia si las sumas no cuadran', () => {
    const p = planCompleto();
    p.sesiones.pop();
    const r = validarPlan(p);
    expect(r.ok).toBe(false);
    expect(codigos(r)).toEqual(expect.arrayContaining(['SUMA_TOTAL']));
    expect(r.errores.some((e) => /Diferencia: -/.test(e.mensaje))).toBe(true);
  });
  it('bloquea si falla una referencia diaria', () => {
    const p = planCompleto();
    p.sesiones.find((s) => s.fecha === '2026-10-27').materiaId = 'moviles';
    expect(codigos(validarPlan(p))).toContain('REFERENCIA');
  });
  it('un plan completo vacio no pasa', () => {
    expect(validarPlan(plan({ completo: true, sesiones: [] })).ok).toBe(false);
  });
});
