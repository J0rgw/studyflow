import { describe, it, expect } from 'vitest';
import {
  aplicarReprogramaciones, comprobarMovimiento, diasSugeridos, resolverMovimiento, limpiarMotivo, historialSesion,
  ultimoDiaMateria, cargaDia, MAX_MOTIVO,
} from '../src/data/reprogramacion.js';
import { cupoDia } from '../src/data/control.js';

const HOY = '2026-10-17'; // sabado
const plan = [
  { id: 'alg-01', fecha: '2026-10-16', materiaId: 'algebra', minutos: 60 },
  { id: 'tac-01', fecha: '2026-10-23', materiaId: 'tac', minutos: 120 },
  { id: 'alg-02', fecha: '2026-10-23', materiaId: 'algebra', minutos: 150 },
  { id: 'tac-27', fecha: '2026-10-27', materiaId: 'tac', minutos: 120 },
];
const s = plan[0];
const codigos = (lista) => lista.map((x) => x.codigo);
const mover = (destino, extra = {}) => comprobarMovimiento({ sesion: s, destino, sesiones: plan, hoy: HOY, ...extra });

describe('fecha vigente', () => {
  it('la reprogramacion manda sin tocar la sesion del plan', () => {
    const mapa = new Map([['alg-01', { fecha: '2026-10-24', rev: 1 }]]);
    const r = aplicarReprogramaciones(plan, mapa);
    expect(r[0]).toMatchObject({ id: 'alg-01', fecha: '2026-10-24', fechaPlan: '2026-10-16', movida: true });
    expect(plan[0].fecha).toBe('2026-10-16');
    expect(r[1]).toBe(plan[1]);
  });
  it('devuelta a su fecha o con fecha invalida no cuenta como movida', () => {
    const mapa = new Map([['alg-01', { fecha: '2026-10-16', rev: 2 }], ['tac-01', { fecha: 'mañana' }]]);
    const r = aplicarReprogramaciones(plan, mapa);
    expect(r[0]).toBe(plan[0]);
    expect(r[1]).toBe(plan[1]);
    expect(aplicarReprogramaciones(plan, new Map())).toBe(plan);
  });
});

describe('restricciones al mover', () => {
  it('cupos: maximo explicito es un bloqueo; carga habitual, un aviso que se confirma', () => {
    expect(cupoDia('2026-10-27')).toEqual({ minutos: 120, tipo: 'limite' });
    expect(cupoDia('2026-10-23')).toEqual({ minutos: 300, tipo: 'habitual' });
    expect(cupoDia('2026-10-24')).toEqual({ minutos: 360, tipo: 'habitual' });
    const limite = mover('2026-10-27');
    expect(limite.ok).toBe(false);
    expect(codigos(limite.bloqueos)).toEqual(['LIMITE']);
    const carga = mover('2026-10-23');
    expect(carga.ok).toBe(true);
    expect(carga.carga).toBe(330);
    expect(codigos(carga.avisos)).toEqual(['CARGA']);
  });
  it('dias bloqueados, pasados, fuera del periodo o la misma fecha no se admiten', () => {
    expect(codigos(mover('2026-10-21').bloqueos)).toEqual(['BLOQUEADO']);
    expect(codigos(mover('2026-10-15').bloqueos)).toEqual(['PASADA']);
    expect(codigos(mover('2026-11-20').bloqueos)).toEqual(['PERIODO']);
    expect(codigos(mover('2026-10-16').bloqueos)).toEqual(['MISMA_FECHA']);
    expect(codigos(mover('2026-02-30').bloqueos)).toEqual(['FECHA']);
    expect(mover('2026-10-17').ok).toBe(true); // hoy si
  });
  it('nunca el dia del examen de su materia ni despues', () => {
    expect(ultimoDiaMateria('algebra')).toBe('2026-11-06');
    expect(codigos(mover('2026-11-07').bloqueos)).toEqual(['EXAMEN']);
    expect(codigos(mover('2026-11-08').bloqueos)).toEqual(['EXAMEN']);
    expect(mover('2026-11-06').ok).toBe(true);
  });
  it('otro examen ese dia es un aviso', () => {
    const tac = plan[1];
    const r = comprobarMovimiento({ sesion: tac, destino: '2026-11-07', sesiones: plan, hoy: HOY });
    expect(r.ok).toBe(true);
    expect(codigos(r.avisos)).toEqual(['DIA_EXAMEN']);
  });
  it('una sesion completada no se mueve', () => {
    expect(codigos(mover('2026-10-24', { estado: 'completada' }).bloqueos)).toEqual(['COMPLETADA']);
  });
  it('la carga no cuenta la propia sesion', () => {
    expect(cargaDia(plan, '2026-10-23', 'tac-01')).toBe(150);
    const r = comprobarMovimiento({ sesion: plan[1], destino: '2026-10-24', sesiones: plan, hoy: HOY });
    expect(r.carga).toBe(120);
  });
  it('sugerencias: solo dias sin bloqueos ni avisos, desde hoy', () => {
    const r = diasSugeridos({ sesion: s, sesiones: plan, hoy: '2026-10-19' });
    expect(r.map((d) => d.fecha)).toEqual(['2026-10-19', '2026-10-24', '2026-10-25']);
    expect(r[0].libre).toBe(240);
  });
});

describe('escritura idempotente', () => {
  const pedido = (extra = {}) => ({
    sesionId: 'alg-01', revBase: 0, hasta: '2026-10-24', fechaPlan: '2026-10-16', minutos: 60, motivo: '', avisos: [], ...extra,
  });

  // Firestore simulado: aplica la decision como haria la transaccion.
  function almacen() {
    const st = { doc: null, eventos: new Map() };
    st.ejecutar = (p) => {
      const r = resolverMovimiento(st.doc, p);
      if (r.accion === 'escribir') {
        expect(st.eventos.has(r.id)).toBe(false);
        st.doc = r.doc;
        st.eventos.set(r.id, r.evento);
      }
      return r.accion;
    };
    return st;
  }

  it('primera vez: rev 1, evento sesion-1 desde la fecha del plan', () => {
    const r = resolverMovimiento(null, pedido());
    expect(r.accion).toBe('escribir');
    expect(r.id).toBe('alg-01-1');
    expect(r.doc).toEqual({ schemaVersion: 1, sesionId: 'alg-01', fechaPlan: '2026-10-16', fecha: '2026-10-24', rev: 1 });
    expect(r.evento).toMatchObject({ tipo: 'reprogramacion', rev: 1, desde: '2026-10-16', hasta: '2026-10-24', minutos: 60 });
  });

  it('doble clic, otra pestaña o reintento: un solo cambio y un solo evento', () => {
    const st = almacen();
    expect(st.ejecutar(pedido())).toBe('escribir');
    expect(st.ejecutar(pedido())).toBe('existente');
    expect(st.ejecutar(pedido())).toBe('existente');
    expect(st.eventos.size).toBe(1);
  });

  it('si otra pestaña la movio a otra fecha, no se pisa', () => {
    const st = almacen();
    st.ejecutar(pedido({ hasta: '2026-10-25' }));
    expect(st.ejecutar(pedido({ hasta: '2026-10-24' }))).toBe('conflicto');
    expect(st.doc.fecha).toBe('2026-10-25');
  });

  it('movimientos sucesivos encadenan revisiones y la auditoria conserva cada paso', () => {
    const st = almacen();
    st.ejecutar(pedido());
    st.ejecutar(pedido({ revBase: 1, hasta: '2026-10-25', motivo: 'Simulacro' }));
    st.ejecutar(pedido({ revBase: 2, hasta: '2026-10-16' })); // devolverla a su fecha
    expect([...st.eventos.keys()]).toEqual(['alg-01-1', 'alg-01-2', 'alg-01-3']);
    expect(st.eventos.get('alg-01-2')).toMatchObject({ desde: '2026-10-24', hasta: '2026-10-25', motivo: 'Simulacro' });
    expect(st.doc).toMatchObject({ fecha: '2026-10-16', rev: 3 });
    const hist = historialSesion([...st.eventos.values(), { tipo: 'otro', sesionId: 'alg-01', rev: 9 }], 'alg-01');
    expect(hist.map((e) => e.rev)).toEqual([3, 2, 1]);
  });

  it('motivo: una linea, recortado y con limite', () => {
    expect(limpiarMotivo('  falta   tiempo\n hoy ')).toBe('falta tiempo hoy');
    expect(limpiarMotivo('x'.repeat(MAX_MOTIVO + 1))).toBeNull();
    expect(limpiarMotivo(undefined)).toBe('');
  });
});
