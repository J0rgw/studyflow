import { describe, it, expect, vi } from 'vitest';
import { ESTADO_INICIAL, reduceAuth, mensajeErrorAuth } from '../src/services/auth-state.js';
import { createAuthService } from '../src/services/auth.js';

describe('reduceAuth', () => {
  it('empieza comprobando sesion', () => {
    expect(ESTADO_INICIAL.status).toBe('checking');
  });
  it('sin configuracion queda en unconfigured', () => {
    expect(reduceAuth(ESTADO_INICIAL, { type: 'CONFIG_MISSING' }).status).toBe('unconfigured');
  });
  it('sesion valida -> signed-in con uid; sin sesion -> signed-out', () => {
    const dentro = reduceAuth(ESTADO_INICIAL, { type: 'SESSION', uid: 'u1' });
    expect(dentro).toMatchObject({ status: 'signed-in', uid: 'u1' });
    expect(reduceAuth(dentro, { type: 'SESSION', uid: null }).status).toBe('signed-out');
  });
  it('flujo de login con error conserva el mensaje', () => {
    let s = reduceAuth(ESTADO_INICIAL, { type: 'SESSION', uid: null });
    s = reduceAuth(s, { type: 'LOGIN_START' });
    expect(s.status).toBe('signing-in');
    s = reduceAuth(s, { type: 'LOGIN_ERROR', message: 'mal' });
    expect(s).toMatchObject({ status: 'signed-out', error: 'mal' });
  });
  it('LOGIN_START se ignora si ya hay sesion', () => {
    const s = reduceAuth(ESTADO_INICIAL, { type: 'SESSION', uid: 'u1' });
    expect(reduceAuth(s, { type: 'LOGIN_START' })).toBe(s);
  });
});

describe('mensajeErrorAuth', () => {
  it('traduce codigos conocidos y tiene mensaje por defecto', () => {
    expect(mensajeErrorAuth('auth/invalid-credential')).toMatch(/incorrecta/);
    expect(mensajeErrorAuth('auth/network-request-failed')).toMatch(/conexión/);
    expect(mensajeErrorAuth('otra')).toMatch(/No se pudo/);
  });
});

describe('createAuthService', () => {
  const auth = { id: 'auth' };
  const crear = (sdk) => createAuthService({ auth, loginEmail: 'yo@ejemplo.es', sdk });

  it('envia la contrasena tal cual al SDK con el email fijo', async () => {
    const sdk = { signInWithEmailAndPassword: vi.fn().mockResolvedValue({}) };
    const r = await crear(sdk).login('valor-de-prueba');
    expect(r).toEqual({ ok: true });
    expect(sdk.signInWithEmailAndPassword).toHaveBeenCalledWith(auth, 'yo@ejemplo.es', 'valor-de-prueba');
  });
  it('rechaza contrasena vacia sin llamar al SDK', async () => {
    const sdk = { signInWithEmailAndPassword: vi.fn() };
    const r = await crear(sdk).login('');
    expect(r.ok).toBe(false);
    expect(sdk.signInWithEmailAndPassword).not.toHaveBeenCalled();
  });
  it('convierte errores del SDK en mensajes sin filtrar la contrasena', async () => {
    const sdk = { signInWithEmailAndPassword: vi.fn().mockRejectedValue({ code: 'auth/invalid-credential' }) };
    const r = await crear(sdk).login('secreta-falsa');
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain('secreta-falsa');
  });
  it('subscribe entrega { uid } o null', () => {
    const sdk = { onAuthStateChanged: vi.fn((a, cb) => { cb({ uid: 'u9', email: 'x' }); cb(null); return () => {}; }) };
    const visto = [];
    crear(sdk).subscribe((u) => visto.push(u));
    expect(visto).toEqual([{ uid: 'u9' }, null]);
  });
});
