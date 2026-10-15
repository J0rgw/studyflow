import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { rutaColeccion, COLECCIONES, SCHEMA_VERSION } from '../src/data/schema.js';

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
    expect(reglas).toContain('match /users/{userId}/{document=**}');
    expect(reglas).toContain('request.auth.uid == userId');
    expect(reglas).toMatch(/request\.auth\.uid == '[A-Za-z0-9]{20,}'/);
    expect(reglas).not.toContain('REEMPLAZAR_UID_PROPIETARIO');
  });
  it('deniega todo lo demas y no hay allow abierto', () => {
    expect(reglas).toMatch(/match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
    expect(reglas).not.toMatch(/if true/);
  });
});
