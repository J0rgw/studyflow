// Maquina de estados de autenticacion, pura y sin Firebase (facil de probar).
// status: unconfigured | checking | signed-out | signing-in | signed-in

export const ESTADO_INICIAL = Object.freeze({ status: 'checking', uid: null, error: null });

export function reduceAuth(state, evento) {
  switch (evento.type) {
    case 'CONFIG_MISSING':
      return { status: 'unconfigured', uid: null, error: null };
    case 'SESSION':
      return evento.uid
        ? { status: 'signed-in', uid: evento.uid, error: null }
        : { status: 'signed-out', uid: null, error: state.error };
    case 'LOGIN_START':
      return state.status === 'signed-out' ? { status: 'signing-in', uid: null, error: null } : state;
    case 'LOGIN_ERROR':
      return { status: 'signed-out', uid: null, error: evento.message };
    case 'AUTH_FAILURE':
      return { status: 'signed-out', uid: null, error: evento.message };
    default:
      return state;
  }
}

/** Mensaje en castellano para un codigo de error de Firebase Auth. */
export function mensajeErrorAuth(code) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/invalid-login-credentials':
      return 'Contraseña incorrecta.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos fallidos. Espera unos minutos antes de volver a probar.';
    case 'auth/network-request-failed':
      return 'Sin conexión con Firebase. Comprueba la red e inténtalo de nuevo.';
    case 'auth/user-disabled':
      return 'La cuenta está deshabilitada en Firebase.';
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'La cuenta configurada no existe o el email de acceso no es válido. Revisa la configuración.';
    case 'auth/operation-not-allowed':
      return 'El acceso con email y contraseña no está habilitado en Firebase.';
    default:
      return 'No se pudo iniciar sesión. Inténtalo de nuevo.';
  }
}
