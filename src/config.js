// Lectura de la configuracion cliente. Todo es publico (no hay secretos VITE_*).

const REQUERIDAS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_LOGIN_EMAIL',
];

// Un valor vacio o con el marcador de .env.example cuenta como no configurado.
function valorValido(v) {
  return typeof v === 'string' && v.trim() !== '' && !v.trim().startsWith('REEMPLAZAR');
}

/** @param {Record<string, string|undefined>} env */
export function readConfig(env) {
  const faltan = REQUERIDAS.filter((k) => !valorValido(env[k]));
  return {
    configured: faltan.length === 0,
    missing: faltan,
    loginEmail: env.VITE_LOGIN_EMAIL,
    firebase: {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    },
  };
}
