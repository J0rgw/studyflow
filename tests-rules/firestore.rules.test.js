// Ejecutar con: npm run test:rules (levanta el emulador de Firestore, requiere Java).
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, getDocs, collection, writeBatch } from 'firebase/firestore';

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

const RUTAS = ['plans', 'sessions', 'logs', 'reviews', 'events'];

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
