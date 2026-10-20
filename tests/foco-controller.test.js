import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createFocoController, relojMonotono } from '../src/services/foco.js';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 16, 8, 0);
const sesion = { id: 'alg-01', materiaId: 'algebra' };
const otra = { id: 'tac-01', materiaId: 'tac' };
const AJUSTES = { modo: '25-5' };

/**
 * Firestore simulado y compartido por varias «pestañas». Como el real: las escuchas reciben el
 * documento de forma asincrona y la creacion de registros es una transaccion que falla sin
 * conexion ('unavailable') o por reglas ('permission-denied') sin escribir nada.
 */
function servidor() {
  const s = { foco: null, logs: new Map(), oyentes: new Set(), offline: false, rechazo: null, intentos: 0, colgado: false };
  const copia = () => (s.foco ? structuredClone(s.foco) : null);
  const notificar = () => { const datos = copia(); for (const cb of s.oyentes) queueMicrotask(() => cb({ datos, pendiente: false })); };
  s.repo = () => ({
    escucharFoco(cb) {
      s.oyentes.add(cb);
      const datos = copia();
      queueMicrotask(() => cb({ datos, pendiente: false }));
      return () => s.oyentes.delete(cb);
    },
    async guardarFoco({ rev, ejecucion, nuevos }) {
      if (s.colgado) await new Promise(() => {}); // sin conexion: la escritura nunca se confirma
      const pendientes = { ...(s.foco?.pendientes ?? {}), ...Object.fromEntries(nuevos.map((r) => [r.id, r.datos])) };
      s.foco = { rev, ejecucion: structuredClone(ejecucion), pendientes };
      notificar();
    },
    async confirmarRegistro(id, datos) {
      s.intentos += 1;
      if (s.offline) throw Object.assign(new Error('offline'), { code: 'unavailable' });
      if (s.rechazo) throw Object.assign(new Error('rechazo'), { code: s.rechazo });
      const r = s.logs.has(id) ? 'existente' : 'creado';
      if (r === 'creado') s.logs.set(id, structuredClone(datos));
      if (s.foco) { delete s.foco.pendientes[id]; notificar(); }
      return r;
    },
    async quitarPendiente(id) {
      if (s.foco) { delete s.foco.pendientes[id]; notificar(); }
    },
  });
  return s;
}

let n = 0;
const pestaña = (s) => {
  n += 1;
  const id = `ejec${String(n).padStart(8, '0')}`;
  const c = createFocoController({ repo: s.repo(), crearId: () => id });
  c.iniciar();
  return c;
};
const pasar = (ms) => vi.advanceTimersByTimeAsync(ms);
const registros = (s) => [...s.logs.values()];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => { vi.useRealTimers(); });

describe('recarga', () => {
  it('otra instancia continua el mismo foco y lo registra una sola vez', async () => {
    const s = servidor();
    const a = pestaña(s);
    await pasar(0);
    expect(a.empezar({ sesion, ajustes: AJUSTES }).ok).toBe(true);
    await pasar(10 * MIN);
    a.detener(); // se cierra la pestaña: nadie ve terminar el foco
    await pasar(20 * MIN);

    const b = pestaña(s);
    await pasar(1000);
    expect(registros(s)).toHaveLength(1);
    expect(registros(s)[0]).toMatchObject({ focoMs: 25 * MIN, inicio: T0, fin: T0 + 25 * MIN, tipo: 'completo', sesionId: 'alg-01' });
    expect(b.vista().ejecucion.fase).toBe('espera'); // el descanso tambien acabo; no arranca otro foco
    expect(b.vista().pendientes).toHaveLength(0);
    b.detener();

    const c = pestaña(s);
    await pasar(5 * MIN);
    expect(registros(s)).toHaveLength(1);
    c.detener();
  });

  it('una pausa sobrevive a la recarga y el tiempo en pausa no cuenta', async () => {
    const s = servidor();
    const a = pestaña(s);
    await pasar(0);
    a.empezar({ sesion, ajustes: AJUSTES });
    await pasar(5 * MIN);
    expect(a.accion('pausar')).toBe(true);
    await pasar(30 * MIN);
    a.detener();

    const b = pestaña(s);
    await pasar(1000);
    expect(b.vista().ejecucion.corriendo).toBe(false);
    expect(registros(s)).toHaveLength(0);
    b.accion('reanudar');
    await pasar(20 * MIN);
    expect(registros(s)).toHaveLength(1);
    const r = registros(s)[0];
    expect(r.focoMs).toBe(25 * MIN);
    expect(r.fin - r.inicio).toBe(25 * MIN + 30 * MIN + 1000);
    b.detener();
  });
});

describe('varias pestañas', () => {
  it('dos pestañas con el mismo foco producen un unico registro', async () => {
    const s = servidor();
    const a = pestaña(s);
    const b = pestaña(s);
    await pasar(0);
    a.empezar({ sesion, ajustes: AJUSTES });
    await pasar(26 * MIN);
    expect(registros(s)).toHaveLength(1);
    expect(a.vista().ejecucion.fase).toBe('descanso');
    expect(b.vista().ejecucion.fase).toBe('descanso');
    a.detener(); b.detener();
  });

  it('no deja empezar otra sesion mientras hay un foco en marcha', async () => {
    const s = servidor();
    const a = pestaña(s);
    const b = pestaña(s);
    await pasar(0);
    a.empezar({ sesion, ajustes: AJUSTES });
    await pasar(1000);
    const r = b.empezar({ sesion: otra, ajustes: AJUSTES });
    expect(r.ok).toBe(false);
    expect(b.vista().ejecucion.sesionId).toBe('alg-01');
    // La misma sesion desde otra pestaña solo abre el foco existente.
    expect(b.empezar({ sesion, ajustes: AJUSTES })).toEqual({ ok: true, existente: true });
    a.detener(); b.detener();
  });

  it('pausar en una pestaña se ve en la otra', async () => {
    const s = servidor();
    const a = pestaña(s);
    const b = pestaña(s);
    await pasar(0);
    a.empezar({ sesion, ajustes: AJUSTES });
    await pasar(3 * MIN);
    a.accion('pausar');
    await pasar(1000);
    expect(b.vista().ejecucion.corriendo).toBe(false);
    a.detener(); b.detener();
  });

  it('doble clic en finalizar no duplica', async () => {
    const s = servidor();
    const a = pestaña(s);
    await pasar(0);
    a.empezar({ sesion, ajustes: AJUSTES });
    await pasar(10 * MIN);
    expect(a.accion('finalizar')).toBe(true);
    expect(a.accion('finalizar')).toBe(false);
    await pasar(1000);
    expect(registros(s)).toHaveLength(1);
    expect(registros(s)[0]).toMatchObject({ focoMs: 10 * MIN, tipo: 'parcial' });
    expect(a.vista().ejecucion).toBeNull();
    a.detener();
  });
});

describe('objetivo y foco libre', () => {
  it('desde la sesion encadena focos en vivo hasta el objetivo y se detiene', async () => {
    const s = servidor();
    const a = pestaña(s);
    await pasar(0);
    a.empezar({ sesion, ajustes: AJUSTES, objetivoMs: 30 * MIN });
    await pasar(36 * MIN);
    expect(registros(s).map((r) => r.focoMs)).toEqual([25 * MIN, 5 * MIN]);
    expect(a.vista().ejecucion).toMatchObject({ fase: 'espera', focoHechoMs: 30 * MIN });
    await pasar(60 * MIN);
    expect(registros(s)).toHaveLength(2); // cumplido: no sigue solo
    a.detener();
  });

  it('foco libre con materia: se registra sin sesion y no choca con si mismo', async () => {
    const s = servidor();
    const a = pestaña(s);
    await pasar(0);
    expect(a.empezar({ materiaId: 'tac', ajustes: AJUSTES }).ok).toBe(true);
    expect(a.empezar({ ajustes: AJUSTES })).toEqual({ ok: true, existente: true });
    // Un foco de sesion no pisa un foco libre en marcha.
    expect(a.empezar({ sesion, ajustes: AJUSTES }).ok).toBe(false);
    await pasar(3 * MIN);
    a.accion('finalizar');
    await pasar(1000);
    expect(registros(s)[0]).toMatchObject({ sesionId: null, materiaId: 'tac', focoMs: 3 * MIN });
    a.detener();
  });
});

describe('fallos de Firestore', () => {
  it('sin conexion: queda pendiente, no se da por guardado y se reintenta', async () => {
    const s = servidor();
    s.offline = true;
    const a = pestaña(s);
    await pasar(0);
    a.empezar({ sesion, ajustes: AJUSTES });
    await pasar(25 * MIN + 100);
    expect(registros(s)).toHaveLength(0);
    expect(a.vista().pendientes).toMatchObject([{ estado: 'reintento' }]);
    expect(a.hayCambiosSinGuardar()).toBe(true);
    s.offline = false;
    await pasar(60_000);
    expect(registros(s)).toHaveLength(1);
    expect(a.vista().pendientes).toHaveLength(0);
    expect(a.hayCambiosSinGuardar()).toBe(false);
    a.detener();
  });

  it('rechazo remoto: se muestra como error, no se reintenta solo y no cuenta', async () => {
    const s = servidor();
    s.rechazo = 'permission-denied';
    const a = pestaña(s);
    await pasar(0);
    a.empezar({ sesion, ajustes: AJUSTES });
    await pasar(25 * MIN + 100);
    const [p] = a.vista().pendientes;
    expect(p.estado).toBe('error');
    expect(p.mensaje).toMatch(/rechazado/);
    expect(registros(s)).toHaveLength(0);
    const intentos = s.intentos;
    await pasar(10 * MIN);
    expect(s.intentos).toBe(intentos);
    // El usuario corrige (p. ej. publica las reglas) y reintenta: se guarda una vez.
    s.rechazo = null;
    a.reintentar();
    await pasar(0);
    expect(registros(s)).toHaveLength(1);
    expect(a.vista().pendientes).toHaveLength(0);
    a.detener();
  });

  it('un registro rechazado solo se quita de la bandeja si el usuario lo descarta', async () => {
    const s = servidor();
    s.rechazo = 'permission-denied';
    const a = pestaña(s);
    await pasar(0);
    a.empezar({ sesion, ajustes: AJUSTES });
    await pasar(3 * MIN);
    a.accion('finalizar');
    await pasar(1000);
    const [p] = a.vista().pendientes;
    expect(p.estado).toBe('error');
    expect(a.hayCambiosSinGuardar()).toBe(true);
    expect(a.descartarPendiente(p.id)).toBe(true);
    await pasar(1000);
    expect(a.vista().pendientes).toHaveLength(0);
    expect(s.foco.pendientes).toEqual({});
    expect(registros(s)).toHaveLength(0);
    expect(a.hayCambiosSinGuardar()).toBe(false);
    a.detener();
  });

  it('no se puede descartar un registro que aun puede guardarse', async () => {
    const s = servidor();
    s.offline = true;
    const a = pestaña(s);
    await pasar(0);
    a.empezar({ sesion, ajustes: AJUSTES });
    await pasar(3 * MIN);
    a.accion('finalizar');
    await pasar(100);
    expect(a.descartarPendiente(a.vista().pendientes[0].id)).toBe(false);
    a.detener();
  });

  it('un registro de la bandeja de otra pestaña cerrada se completa al abrir', async () => {
    const s = servidor();
    s.offline = true;
    const a = pestaña(s);
    await pasar(0);
    a.empezar({ sesion, ajustes: AJUSTES });
    await pasar(25 * MIN + 100);
    a.detener(); // se cierra con el registro aun en la bandeja de focus/actual
    s.offline = false;
    const b = pestaña(s);
    await pasar(1000);
    expect(registros(s)).toHaveLength(1);
    expect(s.foco.pendientes).toEqual({});
    b.detener();
  });

  it('avisa de un cambio del foco sin confirmar solo si tarda', async () => {
    const s = servidor();
    const a = pestaña(s);
    await pasar(0);
    a.empezar({ sesion, ajustes: AJUSTES });
    await pasar(500);
    expect(a.vista().sinConfirmar).toBe(false);
    s.colgado = true;
    a.accion('pausar');
    await pasar(500);
    expect(a.vista().sinConfirmar).toBe(false);
    expect(a.hayCambiosSinGuardar()).toBe(true);
    await pasar(2000);
    expect(a.vista().sinConfirmar).toBe(true);
    // La pausa sigue aplicada en local aunque no este confirmada.
    expect(a.vista().ejecucion.corriendo).toBe(false);
    a.detener();
  });

  it('no empieza antes de saber si hay un foco activo', () => {
    const s = servidor();
    const a = pestaña(s);
    expect(a.empezar({ sesion, ajustes: AJUSTES }).ok).toBe(false);
    a.detener();
  });
});

describe('reloj', () => {
  it('nunca retrocede', () => {
    let t = 1000;
    const reloj = relojMonotono(() => t);
    expect(reloj()).toBe(1000);
    t = 500;
    expect(reloj()).toBe(1000);
    t = 1500;
    expect(reloj()).toBe(1500);
  });
});
