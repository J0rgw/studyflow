// Servicio de autenticacion. Recibe el SDK por inyeccion para poder probarlo
// sin red ni credenciales. La contrasena solo viaja al SDK: no se compara,
// no se guarda y no se escribe en consola.
import { mensajeErrorAuth } from './auth-state.js';

/**
 * @param {{ auth: object, loginEmail: string, sdk: {
 *   signInWithEmailAndPassword: Function, signOut: Function, onAuthStateChanged: Function } }} deps
 */
export function createAuthService({ auth, loginEmail, sdk }) {
  return {
    async login(password) {
      if (typeof password !== 'string' || password === '') {
        return { ok: false, message: 'Escribe la contraseña.' };
      }
      try {
        await sdk.signInWithEmailAndPassword(auth, loginEmail, password);
        return { ok: true };
      } catch (err) {
        return { ok: false, message: mensajeErrorAuth(err && err.code) };
      }
    },
    logout() {
      return sdk.signOut(auth);
    },
    /** callback recibe { uid } o null. Devuelve la funcion para cancelar. */
    subscribe(callback, onError) {
      return sdk.onAuthStateChanged(
        auth,
        (user) => callback(user ? { uid: user.uid } : null),
        onError,
      );
    },
  };
}
