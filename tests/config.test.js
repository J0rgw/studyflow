import { describe, it, expect } from 'vitest';
import { readConfig } from '../src/config.js';

const completo = {
  VITE_FIREBASE_API_KEY: 'k', VITE_FIREBASE_AUTH_DOMAIN: 'x.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'x', VITE_FIREBASE_APP_ID: '1:2:web:3', VITE_LOGIN_EMAIL: 'a@b.es',
};

describe('readConfig', () => {
  it('detecta configuracion completa', () => {
    const c = readConfig(completo);
    expect(c.configured).toBe(true);
    expect(c.loginEmail).toBe('a@b.es');
  });
  it('sin variables no esta configurado y lista las que faltan', () => {
    const c = readConfig({});
    expect(c.configured).toBe(false);
    expect(c.missing).toContain('VITE_LOGIN_EMAIL');
  });
  it('trata el marcador REEMPLAZAR de .env.example como no configurado', () => {
    const c = readConfig({ ...completo, VITE_FIREBASE_API_KEY: 'REEMPLAZAR' });
    expect(c.configured).toBe(false);
    expect(c.missing).toEqual(['VITE_FIREBASE_API_KEY']);
  });
});
