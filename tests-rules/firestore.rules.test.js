// Ejecutar con: npm run test:rules (levanta el emulador de Firestore, requiere Java).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, deleteDoc, getDocs, collection, writeBatch, serverTimestamp, runTransaction, updateDoc,
} from 'firebase/firestore';
import { createRepository } from '../src/services/firestore-repository.js';

const reglas = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
// El UID propietario se lee de las reglas: el test no lo duplica ni lo inventa.
const OWNER = reglas.match(/request\.auth\.uid == '([A-Za-z0-9]{20,})'/)[1];
const OTRO = 'uidAjenoDePrueba000000000001';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-studyflow', firestore: { rules: reglas, host: '127.0.0.1', port: 8080 } });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `users/${OWNER}/sessions/s1`), { planId: 'p', minutos: 60 });
    await setDoc(doc(db, `users/${OWNER}/logs/l1`), { minutos: 25 });
    await setDoc(doc(db, 'publico/x'), { a: 1 });
  });
});

// Colecciones de lectura y escritura libre para el propietario (logs, events, reschedules,
// reviews y closings tienen reglas propias).
const RUTAS = ['plans', 'sessions', 'progress', 'focus', 'settings'];

const T = Date.UTC(2026, 9, 16, 8, 0);
const registro = (extra = {}) => ({
  schemaVersion: 1, ejecucionId: 'ejec00000001', intervalo: 1, sesionId: 'alg-01', materiaId: 'algebra',
  fecha: '2026-10-16', inicio: T, fin: T + 25 * 60000, focoMs: 25 * 60000, tipo: 'completo', creadoEn: serverTimestamp(), ...extra,
});

describe('sin autenticar', () => {
  it('no lee ni escribe datos privados', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, `users/${OWNER}/sessions/s1`)));
    await assertFails(getDocs(collection(db, `users/${OWNER}/sessions`)));
    await assertFails(setDoc(doc(db, `users/${OWNER}/sessions/nueva`), { a: 1 }));
    await assertFails(deleteDoc(doc(db, `users/${OWNER}/logs/l1`)));
  });
  it('tampoco accede a rutas fuera de users', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'publico/x')));
    await assertFails(setDoc(doc(db, 'otra/y'), { a: 1 }));
  });
});

describe('cuenta distinta', () => {
  it('no accede a los datos del propietario aunque apunte a su UID', async () => {
    const db = env.authenticatedContext(OTRO).firestore();
    await assertFails(getDoc(doc(db, `users/${OWNER}/sessions/s1`)));
    await assertFails(getDocs(collection(db, `users/${OWNER}/logs`)));
    await assertFails(setDoc(doc(db, `users/${OWNER}/sessions/s1`), { minutos: 1 }));
    await assertFails(deleteDoc(doc(db, `users/${OWNER}/sessions/s1`)));
  });
  it('no accede ni a su propia ruta users/{su uid}', async () => {
    const db = env.authenticatedContext(OTRO).firestore();
    await assertFails(setDoc(doc(db, `users/${OTRO}/sessions/s1`), { a: 1 }));
    await assertFails(getDoc(doc(db, `users/${OTRO}/sessions/s1`)));
  });
  it('no accede a rutas fuera de users', async () => {
    const db = env.authenticatedContext(OTRO).firestore();
    await assertFails(getDoc(doc(db, 'publico/x')));
  });
});

describe('propietario', () => {
  it('lee y escribe en todas las subcolecciones privadas', async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(getDoc(doc(db, `users/${OWNER}/sessions/s1`)));
    for (const c of RUTAS) {
      await assertSucceeds(setDoc(doc(db, `users/${OWNER}/${c}/t1`), { a: 1 }));
      await assertSucceeds(getDocs(collection(db, `users/${OWNER}/${c}`)));
    }
  });
  it('admite lotes (importacion) y subcolecciones anidadas', async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    const b = writeBatch(db);
    b.set(doc(db, `users/${OWNER}/sessions/n1`), { a: 1 });
    b.set(doc(db, `users/${OWNER}/sessions/n2`), { a: 2 });
    await assertSucceeds(b.commit());
    await assertSucceeds(setDoc(doc(db, `users/${OWNER}/sessions/s1/notas/n1`), { t: 'x' }));
  });
  it('no puede escribir fuera de users/{su uid}', async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(setDoc(doc(db, 'publico/y'), { a: 1 }));
    await assertFails(setDoc(doc(db, `users/${OTRO}/sessions/s1`), { a: 1 }));
  });
});

describe('registros de foco (logs)', () => {
  const ruta = `users/${OWNER}/logs/ejec00000001-1`;

  it('el propietario crea un registro valido y lo lee', async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(setDoc(doc(db, ruta), registro()));
    await assertSucceeds(getDoc(doc(db, ruta)));
    await assertSucceeds(getDocs(collection(db, `users/${OWNER}/logs`)));
  });

  it('un registro creado no se puede sobrescribir, modificar ni borrar', async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(setDoc(doc(db, ruta), registro()));
    await assertFails(setDoc(doc(db, ruta), registro())); // repetir = actualizar: rechazado
    await assertFails(updateDoc(doc(db, ruta), { focoMs: 50 * 60000 }));
    await assertFails(deleteDoc(doc(db, ruta)));
    await assertFails(deleteDoc(doc(db, `users/${OWNER}/logs/l1`)));
  });

  it('la creacion por transaccion (como la app) es idempotente', async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    const crear = () => runTransaction(db, async (tx) => {
      const r = doc(db, ruta);
      if ((await tx.get(r)).exists()) return 'existente';
      tx.set(r, registro());
      return 'creado';
    });
    expect(await crear()).toBe('creado');
    expect(await crear()).toBe('existente');
  });

  it('rechaza registros incoherentes', async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    const malos = [
      ['id distinto de ejecucion-intervalo', `users/${OWNER}/logs/otro-1`, registro()],
      ['menos de 1 min', ruta, registro({ focoMs: 59000 })],
      ['mas de 4 h', ruta, registro({ focoMs: 14400001, fin: T + 14400001 })],
      ['foco mayor que el lapso real', ruta, registro({ fin: T + 10 * 60000 })],
      ['minutos decimales', ruta, registro({ focoMs: 1500000.5 })],
      ['campo extra', ruta, registro({ estado: 'completada' })],
      ['falta un campo', ruta, (({ tipo, ...r }) => r)(registro())],
      ['materia desconocida', ruta, registro({ materiaId: 'fisica' })],
      ['tipo desconocido', ruta, registro({ tipo: 'descanso' })],
      ['sesion vacia', ruta, registro({ sesionId: '' })],
      ['fecha de creacion del cliente', ruta, registro({ creadoEn: new Date() })],
    ];
    for (const [, r, datos] of malos) await assertFails(setDoc(doc(db, r), datos));
  });

  it('admite foco libre: sin sesion y con o sin materia', async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(setDoc(doc(db, `users/${OWNER}/logs/libre0000001-1`), registro({ ejecucionId: 'libre0000001', sesionId: null })));
    await assertSucceeds(setDoc(doc(db, `users/${OWNER}/logs/libre0000002-1`), registro({ ejecucionId: 'libre0000002', sesionId: null, materiaId: null })));
  });

  it('sin autenticar o con otra cuenta no se crean ni se leen', async () => {
    for (const ctx of [env.unauthenticatedContext(), env.authenticatedContext(OTRO)]) {
      const db = ctx.firestore();
      await assertFails(setDoc(doc(db, ruta), registro()));
      await assertFails(getDoc(doc(db, `users/${OWNER}/logs/l1`)));
    }
  });
});

describe('reprogramaciones auditadas (reschedules + events)', () => {
  const dbOwner = () => env.authenticatedContext(OWNER).firestore();
  const repo = () => createRepository({ db: dbOwner(), uid: OWNER });
  const pedido = (extra = {}) => ({
    sesionId: 'alg-01', revBase: 0, hasta: '2026-10-24', fechaPlan: '2026-10-16', minutos: 60, motivo: '', avisos: [], ...extra,
  });
  const resched = (extra = {}) => ({
    schemaVersion: 1, sesionId: 'alg-01', fechaPlan: '2026-10-16', fecha: '2026-10-24', rev: 1, actualizadoEn: serverTimestamp(), ...extra,
  });
  const evento = (extra = {}) => ({
    schemaVersion: 1, tipo: 'reprogramacion', sesionId: 'alg-01', rev: 1, desde: '2026-10-16', hasta: '2026-10-24',
    fechaPlan: '2026-10-16', minutos: 60, motivo: '', avisos: [], creadoEn: serverTimestamp(), ...extra,
  });
  // Escribe ambos documentos a la vez, como la transaccion de la app.
  const juntos = (db, r, e, id = `${e.sesionId}-${e.rev}`) => {
    const b = writeBatch(db);
    b.set(doc(db, `users/${OWNER}/reschedules/${r.sesionId}`), r);
    b.set(doc(db, `users/${OWNER}/events/${id}`), e);
    return b.commit();
  };

  it('la transaccion de la app mueve, es idempotente y deja un solo evento', async () => {
    expect(await repo().reprogramar(pedido())).toBe('escribir');
    expect(await repo().reprogramar(pedido())).toBe('existente');
    const db = dbOwner();
    const eventos = await getDocs(collection(db, `users/${OWNER}/events`));
    expect(eventos.docs.map((d) => d.id)).toEqual(['alg-01-1']);
    expect((await getDoc(doc(db, `users/${OWNER}/reschedules/alg-01`))).data()).toMatchObject({ fecha: '2026-10-24', rev: 1 });
    // Un segundo movimiento encadena rev 2 desde la fecha vigente; uno con revision vieja choca.
    expect(await repo().reprogramar(pedido({ revBase: 1, hasta: '2026-10-25' }))).toBe('escribir');
    await expect(repo().reprogramar(pedido({ revBase: 1, hasta: '2026-10-26' }))).rejects.toMatchObject({ code: 'studyflow/conflicto' });
    const e2 = (await getDoc(doc(db, `users/${OWNER}/events/alg-01-2`))).data();
    expect(e2).toMatchObject({ desde: '2026-10-24', hasta: '2026-10-25' });
  });

  it('las sesiones del plan no se tocan al reprogramar', async () => {
    await repo().reprogramar(pedido({ sesionId: 's1', fechaPlan: '2026-10-16' }));
    const s = await getDoc(doc(dbOwner(), `users/${OWNER}/sessions/s1`));
    expect(s.data()).toEqual({ planId: 'p', minutos: 60 });
  });

  it('cada cambio de fecha necesita su evento, y cada evento su cambio', async () => {
    const db = dbOwner();
    await assertFails(setDoc(doc(db, `users/${OWNER}/reschedules/alg-01`), resched()));
    await assertFails(setDoc(doc(db, `users/${OWNER}/events/alg-01-1`), evento()));
    await assertSucceeds(juntos(db, resched(), evento()));
  });

  it('rechaza saltos de revision, fechas bloqueadas o fuera del periodo y eventos incoherentes', async () => {
    const db = dbOwner();
    const malos = [
      ['empieza en rev 2', resched({ rev: 2 }), evento({ rev: 2 })],
      ['dia bloqueado', resched({ fecha: '2026-10-21' }), evento({ hasta: '2026-10-21' })],
      ['fuera del periodo', resched({ fecha: '2026-11-20' }), evento({ hasta: '2026-11-20' })],
      ['evento con otra fecha', resched(), evento({ hasta: '2026-10-25' })],
      ['desde distinto del plan', resched(), evento({ desde: '2026-10-17' })],
      ['campo extra', resched({ nota: 'x' }), evento()],
      ['motivo largo', resched(), evento({ motivo: 'x'.repeat(201) })],
      ['fecha del cliente', resched(), evento({ creadoEn: new Date() })],
    ];
    for (const [, r, e] of malos) await assertFails(juntos(db, r, e));
    await assertFails(juntos(db, resched(), evento(), 'otro-id'));
  });

  it('la auditoria no se modifica ni se borra; la fecha vigente no se borra', async () => {
    await repo().reprogramar(pedido());
    const db = dbOwner();
    await assertFails(updateDoc(doc(db, `users/${OWNER}/events/alg-01-1`), { motivo: 'cambiado' }));
    await assertFails(deleteDoc(doc(db, `users/${OWNER}/events/alg-01-1`)));
    await assertFails(deleteDoc(doc(db, `users/${OWNER}/reschedules/alg-01`)));
    // Rehacer el evento 1 con otra fecha tampoco: ya existe.
    await assertFails(juntos(db, resched({ rev: 2, fecha: '2026-10-25' }), evento({ rev: 1, desde: '2026-10-24', hasta: '2026-10-25' }), 'alg-01-1'));
  });

  it('sin autenticar o con otra cuenta no se lee ni se mueve nada', async () => {
    await repo().reprogramar(pedido());
    for (const ctx of [env.unauthenticatedContext(), env.authenticatedContext(OTRO)]) {
      const db = ctx.firestore();
      await assertFails(getDoc(doc(db, `users/${OWNER}/reschedules/alg-01`)));
      await assertFails(getDocs(collection(db, `users/${OWNER}/events`)));
      await assertFails(juntos(db, resched({ rev: 2, fecha: '2026-10-25' }), evento({ rev: 2, desde: '2026-10-24', hasta: '2026-10-25' })));
    }
  });
});

describe('dudas (reviews)', () => {
  const repo = () => createRepository({ db: env.authenticatedContext(OWNER).firestore(), uid: OWNER });
  const duda = (extra = {}) => ({
    schemaVersion: 1, materiaId: 'algebra', sesionId: null, texto: 'Rango de una matriz 3x4', estado: 'pendiente', fecha: '2026-10-17', ...extra,
  });
  const ruta = `users/${OWNER}/reviews/duda0001`;

  it('alta idempotente con el id del cliente, cambio de estado y borrado', async () => {
    await assertSucceeds(repo().guardarDuda('duda0001', duda()));
    await assertSucceeds(repo().guardarDuda('duda0001', duda())); // reintento: mismo documento
    const db = env.authenticatedContext(OWNER).firestore();
    expect((await getDocs(collection(db, `users/${OWNER}/reviews`))).size).toBe(1);
    await assertSucceeds(repo().cambiarEstadoDuda('duda0001', 'en-repaso'));
    expect((await getDoc(doc(db, ruta))).data().estado).toBe('en-repaso');
    await assertSucceeds(repo().borrarDuda('duda0001'));
  });

  it('rechaza dudas no validas y cambios de materia o fecha', async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    const ts = { creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() };
    for (const mala of [duda({ estado: 'olvidada' }), duda({ materiaId: 'fisica' }), duda({ texto: '' }), duda({ texto: 'x'.repeat(301) }), duda({ extra: 1 })]) {
      await assertFails(setDoc(doc(db, ruta), { ...mala, ...ts }));
    }
    await repo().guardarDuda('duda0001', duda());
    await assertFails(setDoc(doc(db, ruta), { materiaId: 'tac', actualizadoEn: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(doc(db, ruta), { fecha: '2026-10-18', actualizadoEn: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(doc(db, ruta), { estado: 'resuelta' }, { merge: true })); // sin marca del servidor
  });

  it('otra cuenta no las lee', async () => {
    await repo().guardarDuda('duda0001', duda());
    await assertFails(getDoc(doc(env.authenticatedContext(OTRO).firestore(), ruta)));
  });
});

describe('cierre del dia (closings)', () => {
  const repo = () => createRepository({ db: env.authenticatedContext(OWNER).firestore(), uid: OWNER });
  const cierre = (extra = {}) => ({ schemaVersion: 1, fecha: '2026-10-17', dificultades: 'Inversa 3x3', pendiente: '', ...extra });

  it('un documento por fecha: guardar de nuevo lo sustituye', async () => {
    await assertSucceeds(repo().guardarCierre(cierre()));
    await assertSucceeds(repo().guardarCierre(cierre({ pendiente: 'Repasar STP' })));
    const db = env.authenticatedContext(OWNER).firestore();
    const docs = (await getDocs(collection(db, `users/${OWNER}/closings`))).docs;
    expect(docs.map((d) => d.id)).toEqual(['2026-10-17']);
    expect(docs[0].data()).toMatchObject({ dificultades: 'Inversa 3x3', pendiente: 'Repasar STP' });
    await assertFails(deleteDoc(doc(db, `users/${OWNER}/closings/2026-10-17`)));
  });

  it('rechaza fechas que no cuadran, fuera del periodo, textos largos o campos extra', async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    const ts = { cerradoEn: serverTimestamp() };
    await assertFails(setDoc(doc(db, `users/${OWNER}/closings/2026-10-18`), { ...cierre(), ...ts }));
    await assertFails(setDoc(doc(db, `users/${OWNER}/closings/2026-12-01`), { ...cierre({ fecha: '2026-12-01' }), ...ts }));
    await assertFails(setDoc(doc(db, `users/${OWNER}/closings/2026-10-17`), { ...cierre({ dificultades: 'x'.repeat(2001) }), ...ts }));
    await assertFails(setDoc(doc(db, `users/${OWNER}/closings/2026-10-17`), { ...cierre({ nota: 1 }), ...ts }));
  });

  it('sin autenticar no se lee ni se escribe', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, `users/${OWNER}/closings/2026-10-17`), { ...cierre(), cerradoEn: serverTimestamp() }));
    await assertFails(getDocs(collection(db, `users/${OWNER}/closings`)));
  });
});
