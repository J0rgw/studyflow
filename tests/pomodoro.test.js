import { describe, it, expect } from 'vitest';
import {
  crearEjecucion, avanzar, pausar, reanudar, siguienteFoco, finalizar, descartar, transcurridoMs, restanteMs,
  configDe, normalizarAjustes, esEjecucionValida, idRegistro, MIN_REGISTRO_MS, AJUSTES_INICIALES,
  objetivoCumplido, restanteObjetivoMs, objetivoEnMinutos, normalizarEjecucion,
} from '../src/data/pomodoro.js';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 16, 8, 0); // 16/10/2026 10:00 en Madrid
const sesion = { id: 'alg-01', materiaId: 'algebra' };
const nueva = (config = { foco: 25, descanso: 5, largo: 15, cada: 4 }, ahora = T0) => crearEjecucion({ id: 'ejec00000001', sesion, config, ahora });
// Simula una recarga: el estado pasa por JSON (como Firestore) y se reconstruye despues.
const recargar = (st) => JSON.parse(JSON.stringify(st));

describe('tiempo activo', () => {
  it('cuenta solo el tiempo con el reloj en marcha', () => {
    const st = nueva();
    expect(transcurridoMs(st, T0 + 10 * MIN)).toBe(10 * MIN);
    expect(restanteMs(st, T0 + 10 * MIN)).toBe(15 * MIN);
  });

  it('pausar y reanudar no suma el tiempo en pausa', () => {
    let st = nueva();
    st = pausar(st, T0 + 5 * MIN).estado;
    expect(transcurridoMs(st, T0 + 60 * MIN)).toBe(5 * MIN); // en pausa no avanza
    st = reanudar(st, T0 + 15 * MIN).estado;
    expect(transcurridoMs(st, T0 + 20 * MIN)).toBe(10 * MIN);
    // Termina a los 25 min de foco: 35 min de reloj (10 en pausa)
    const { estado, registros } = avanzar(st, T0 + 37 * MIN);
    expect(registros).toHaveLength(1);
    expect(registros[0].datos.focoMs).toBe(25 * MIN);
    expect(registros[0].datos.inicio).toBe(T0);
    expect(registros[0].datos.fin).toBe(T0 + 35 * MIN);
    expect(estado.fase).toBe('descanso');
  });

  it('el descanso nunca se registra y tras el no arranca otro foco solo', () => {
    let { estado, registros } = avanzar(nueva(), T0 + 25 * MIN);
    expect(registros.map((r) => r.datos.focoMs)).toEqual([25 * MIN]);
    ({ estado, registros } = avanzar(estado, T0 + 10 * 60 * MIN));
    expect(registros).toHaveLength(0);
    expect(estado.fase).toBe('espera');
    expect(estado.corriendo).toBe(false);
    expect(transcurridoMs(estado, T0 + 20 * 60 * MIN)).toBe(0);
  });

  it('pausa larga cada N focos', () => {
    let st = nueva({ foco: 25, descanso: 5, largo: 15, cada: 2 });
    st = avanzar(st, T0 + 25 * MIN).estado;
    expect(st.fase).toBe('descanso');
    st = siguienteFoco(st, T0 + 26 * MIN).estado; // salta el descanso
    expect(st.intervalo).toBe(2);
    st = avanzar(st, T0 + 51 * MIN).estado;
    expect(st.fase).toBe('largo');
  });

  it('un reloj que retrocede no resta ni suma', () => {
    const st = nueva();
    expect(transcurridoMs(st, T0 - 5 * MIN)).toBe(0);
    expect(pausar(st, T0 - 5 * MIN).estado.acumuladoMs).toBe(0);
  });
});

describe('recarga y reconciliacion', () => {
  it('tras recargar continua donde iba sin duplicar intervalos', () => {
    const st = recargar(nueva());
    const a = avanzar(st, T0 + 10 * MIN);
    expect(a.registros).toHaveLength(0);
    const b = avanzar(recargar(a.estado), T0 + 26 * MIN);
    expect(b.registros).toHaveLength(1);
    // Reconciliar otra vez (otra pestaña, otra recarga) desde el estado ya avanzado: nada nuevo.
    expect(avanzar(recargar(b.estado), T0 + 27 * MIN).registros).toHaveLength(0);
  });

  it('la misma reconciliacion desde dos pestañas produce el mismo registro (mismo id)', () => {
    const st = nueva();
    const a = avanzar(recargar(st), T0 + 25 * MIN + 400);
    const b = avanzar(recargar(st), T0 + 25 * MIN + 1700);
    expect(a.registros[0]).toEqual(b.registros[0]);
    expect(a.registros[0].id).toBe(idRegistro('ejec00000001', 1));
  });

  it('con la app cerrada horas, solo cuenta el foco en marcha hasta su fin', () => {
    const { estado, registros } = avanzar(nueva(), T0 + 5 * 60 * MIN);
    expect(registros).toHaveLength(1);
    expect(registros[0].datos.fin).toBe(T0 + 25 * MIN);
    expect(estado.fase).toBe('espera');
  });

  it('una pausa guardada sobrevive a la recarga', () => {
    const st = recargar(pausar(nueva(), T0 + 7 * MIN).estado);
    expect(avanzar(st, T0 + 300 * MIN).registros).toHaveLength(0);
    expect(transcurridoMs(st, T0 + 300 * MIN)).toBe(7 * MIN);
  });
});

describe('finalizar y descartar', () => {
  it('finalizar guarda el foco parcial real', () => {
    const { estado, registros } = finalizar(nueva(), T0 + 12 * MIN);
    expect(estado).toBeNull();
    expect(registros).toHaveLength(1);
    expect(registros[0].datos).toMatchObject({ focoMs: 12 * MIN, tipo: 'parcial', fin: T0 + 12 * MIN });
  });

  it('finalizar en pausa usa el instante de la pausa como fin', () => {
    const st = pausar(nueva(), T0 + 8 * MIN).estado;
    const { registros } = finalizar(st, T0 + 50 * MIN);
    expect(registros[0].datos).toMatchObject({ focoMs: 8 * MIN, fin: T0 + 8 * MIN });
  });

  it('un foco de menos de un minuto no se registra', () => {
    expect(finalizar(nueva(), T0 + MIN_REGISTRO_MS - 1).registros).toHaveLength(0);
  });

  it('finalizar en descanso no inventa foco; descartar conserva los intervalos completos', () => {
    const enDescanso = avanzar(nueva(), T0 + 25 * MIN).estado;
    expect(finalizar(enDescanso, T0 + 27 * MIN).registros).toHaveLength(0);
    const d = descartar(nueva(), T0 + 26 * MIN);
    expect(d.registros.map((r) => r.datos.tipo)).toEqual(['completo']);
    expect(descartar(nueva(), T0 + 20 * MIN).registros).toHaveLength(0);
  });

  it('el tiempo activo nunca supera el lapso entre inicio y fin', () => {
    let st = nueva();
    st = pausar(st, T0 + 3 * MIN).estado;
    st = reanudar(st, T0 + 9 * MIN).estado;
    const r = finalizar(st, T0 + 14 * MIN).registros[0].datos;
    expect(r.focoMs).toBe(8 * MIN);
    expect(r.fin - r.inicio).toBeGreaterThanOrEqual(r.focoMs);
  });
});

describe('objetivo de la sesion', () => {
  const conObjetivo = (min, cada = 4) => crearEjecucion({
    id: 'ejec00000001', sesion, objetivoMs: min * MIN, config: { foco: 25, descanso: 5, largo: 15, cada }, ahora: T0,
  });

  it('encadena focos en vivo hasta cubrir el objetivo; el ultimo se acorta y no hay descanso final', () => {
    let { estado: st, registros } = avanzar(conObjetivo(30), T0 + 25 * MIN);
    expect(registros.map((r) => r.datos.focoMs)).toEqual([25 * MIN]);
    expect(st.fase).toBe('descanso');
    // Una pestaña abierta ve acabar el descanso: el siguiente foco empieza en ese instante.
    ({ estado: st } = avanzar(st, T0 + 30 * MIN + 500));
    expect(st).toMatchObject({ fase: 'foco', intervalo: 2, desde: T0 + 30 * MIN });
    expect(restanteMs(st, T0 + 30 * MIN)).toBe(5 * MIN);
    ({ estado: st, registros } = avanzar(st, T0 + 36 * MIN));
    expect(registros.map((r) => r.datos.focoMs)).toEqual([5 * MIN]);
    expect(st.fase).toBe('espera');
    expect(objetivoCumplido(st)).toBe(true);
  });

  it('con la app cerrada no encadena: queda en espera sin acreditar nada mas', () => {
    const { estado, registros } = avanzar(conObjetivo(150), T0 + 5 * 60 * MIN);
    expect(registros).toHaveLength(1);
    expect(estado.fase).toBe('espera');
    expect(objetivoCumplido(estado)).toBe(false);
    expect(restanteObjetivoMs(estado)).toBe(125 * MIN);
  });

  it('un objetivo menor que un foco da un unico foco acortado', () => {
    const st = conObjetivo(10);
    expect(restanteMs(st, T0)).toBe(10 * MIN);
    const { estado, registros } = avanzar(st, T0 + 10 * MIN);
    expect(registros[0].datos.focoMs).toBe(10 * MIN);
    expect(objetivoCumplido(estado)).toBe(true);
    // Seguir despues de cumplirlo: focos normales, sin tope.
    expect(restanteMs(siguienteFoco(estado, T0 + 11 * MIN).estado, T0 + 11 * MIN)).toBe(25 * MIN);
  });

  it('el objetivo se redondea a minutos enteros (ningun foco por debajo de 1 min)', () => {
    expect(objetivoEnMinutos(49.9 * MIN)).toBe(49 * MIN);
    expect(objetivoEnMinutos(30_000)).toBeNull();
    expect(conObjetivo(0.5).objetivoMs).toBeNull();
  });

  it('una pausa dentro de un foco acortado sigue contando solo el tiempo activo', () => {
    let st = conObjetivo(10);
    st = pausar(st, T0 + 4 * MIN).estado;
    st = reanudar(st, T0 + 20 * MIN).estado;
    const { registros } = avanzar(recargar(st), T0 + 26 * MIN);
    expect(registros[0].datos).toMatchObject({ focoMs: 10 * MIN, fin: T0 + 26 * MIN });
  });
});

describe('foco libre', () => {
  it('sin sesion y con materia opcional', () => {
    const libre = crearEjecucion({ id: 'ejec00000002', materiaId: 'tac', config: { foco: 25, descanso: 5, largo: 15, cada: 4 }, ahora: T0 });
    expect(libre).toMatchObject({ sesionId: null, materiaId: 'tac', objetivoMs: null });
    expect(esEjecucionValida(libre)).toBe(true);
    const r = finalizar(libre, T0 + 5 * MIN).registros[0].datos;
    expect(r).toMatchObject({ sesionId: null, materiaId: 'tac', focoMs: 5 * MIN });
    const sinMateria = crearEjecucion({ id: 'ejec00000003', config: { foco: 25, descanso: 5, largo: 15, cada: 4 }, ahora: T0 });
    expect(finalizar(sinMateria, T0 + 2 * MIN).registros[0].datos.materiaId).toBeNull();
  });

  it('sin objetivo no encadena focos aunque se observe en vivo', () => {
    const libre = crearEjecucion({ id: 'ejec00000002', config: { foco: 25, descanso: 5, largo: 15, cada: 4 }, ahora: T0 });
    const { estado } = avanzar(avanzar(libre, T0 + 25 * MIN).estado, T0 + 30 * MIN + 200);
    expect(estado.fase).toBe('espera');
  });

  it('las ejecuciones guardadas antes (sin objetivo) siguen siendo validas', () => {
    const { objetivoMs, focoHechoMs, ...antigua } = nueva();
    expect(esEjecucionValida(antigua)).toBe(true);
    expect(normalizarEjecucion(antigua)).toMatchObject({ objetivoMs: null, focoHechoMs: 0 });
  });
});

describe('ajustes', () => {
  it('modos predefinidos y libre acotado', () => {
    expect(configDe({ modo: '25-5' })).toMatchObject({ foco: 25, descanso: 5 });
    expect(configDe({ modo: '50-10' })).toMatchObject({ foco: 50, descanso: 10 });
    expect(configDe({ modo: 'libre', libre: { foco: 500, descanso: 0 } })).toMatchObject({ foco: 120, descanso: 1 });
    expect(normalizarAjustes({ modo: 'raro' }).modo).toBe(AJUSTES_INICIALES.modo);
  });

  it('valida el estado leido de Firestore', () => {
    expect(esEjecucionValida(nueva())).toBe(true);
    expect(esEjecucionValida(pausar(nueva(), T0 + MIN).estado)).toBe(true);
    expect(esEjecucionValida({ ...nueva(), acumuladoMs: -1 })).toBe(false);
    expect(esEjecucionValida({ ...nueva(), corriendo: true, desde: null })).toBe(false);
    expect(esEjecucionValida(null)).toBe(false);
  });
});
