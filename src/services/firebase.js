// Inicializacion de Firebase en el navegador. Se importa dinamicamente solo
// cuando la configuracion esta completa.
import { initializeApp } from 'firebase/app';
import {
  initializeAuth, browserLocalPersistence,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { createAuthService } from './auth.js';

export function initFirebase(config) {
  const app = initializeApp(config.firebase);
  // browserLocalPersistence: la sesion sobrevive a cerrar el navegador (por origen).
  const auth = initializeAuth(app, { persistence: browserLocalPersistence });
  const db = getFirestore(app);
  const authService = createAuthService({
    auth,
    loginEmail: config.loginEmail,
    sdk: { signInWithEmailAndPassword, signOut, onAuthStateChanged },
  });
  return { app, auth, db, authService };
}
