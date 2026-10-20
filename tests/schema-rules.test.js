import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { rutaColeccion, COLECCIONES, SCHEMA_VERSION } from '../src/data/schema.js';
import { DIAS_BLOQUEADOS, PERIODO } from '../src/data/control.js';

describe('esquema', () => {
  it('toda ruta cuelga de users/{uid}', () => {
    for (const c of Object.values(COLECCIONES)) {
      expect(rutaColeccion('abc', c).slice(0, 2)).toEqual(['users', 'abc']);
    }
    expect(SCHEMA_VERSION).toBe(1);
  });
  it('rechaza uid vacio y colecciones desconocidas', () => {
    expect(() => rutaColeccion('', 'logs')).toThrow();
    expect(() => rutaColeccion('abc', 'otra')).toThrow();
  });
});

describe('firestore.rules', () => {
  const reglas = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  it('solo permite bajo users/{userId} con uid concreto', () => {
    expect(reglas).toContain('match /users/{userId} {');
    expect(reglas).toContain('request.auth.uid == userId');
    expect(reglas).toMatch(/request\.auth\.uid == '[A-Za-z0-9]{20,}'/);
    expect(reglas).not.toContain('REEMPLAZAR_UID_PROPIETARIO');
    // Toda regla que concede acceso pasa por propietario(userId).
    for (const [, cond] of reglas.matchAll(/allow [a-z, ]+: if ([^;]+);/g)) {
      if (cond.trim() !== 'false') expect(cond).toContain('propietario(userId)');
    }
  });
  const bloque = (desde) => {
    const i = reglas.indexOf(desde);
    return reglas.slice(i, reglas.indexOf('match /', i + desde.length));
  };
  it('los registros de foco y la auditoria solo se crean (sin update ni delete)', () => {
    const logs = bloque('match /logs/{logId}');
    expect(logs).toMatch(/allow create: if propietario\(userId\) && registroValido\(logId\);/);
    expect(logs).not.toMatch(/allow [^:]*(update|delete|write)/);
    const eventos = bloque('match /events/{eventId}');
    expect(eventos).toMatch(/allow create: if propietario\(userId\) && eventoValido\(userId, eventId\);/);
    expect(eventos).not.toMatch(/allow [^:]*(update|delete|write)/);
  });
  it('la fecha vigente exige su evento y no se borra', () => {
    expect(reglas).toMatch(/existsAfter\(\/databases\/\$\(database\)\/documents\/users\/\$\(userId\)\/events\//);
    expect(bloque('match /reschedules/{sesionId}')).not.toMatch(/allow [^:]*(delete|write)/);
    expect(bloque('match /closings/{fecha}')).not.toMatch(/allow [^:]*(delete|write)/);
  });
  it('el acceso generico excluye las colecciones con reglas propias', () => {
    expect(reglas).toContain("!(coleccion in ['logs', 'events', 'reschedules', 'reviews', 'closings'])");
  });
  it('periodo y dias bloqueados de las reglas = datos de control', () => {
    expect(reglas).toContain(`!(f in [${DIAS_BLOQUEADOS.map((d) => `'${d}'`).join(', ')}])`);
    expect(reglas).toContain(`f >= '${PERIODO.inicio}' && f <= '${PERIODO.fin}'`);
  });
  it('deniega todo lo demas y no hay allow abierto', () => {
    expect(reglas).toMatch(/match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
    expect(reglas).not.toMatch(/if true/);
  });
});
