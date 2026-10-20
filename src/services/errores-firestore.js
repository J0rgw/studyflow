// Clasificacion y mensajes de errores de Firestore, sin depender del SDK (se prueban en Node).

// Errores que pueden resolverse solos al volver la conexion: se reintentan.
const TRANSITORIOS = new Set(['unavailable', 'deadline-exceeded', 'aborted', 'resource-exhausted', 'internal', 'cancelled']);

export function esErrorTransitorio(err) { return TRANSITORIOS.has(err && err.code); }

/** Mensaje honesto en castellano para un error de Firestore (lectura o escritura). */
export function mensajeErrorFirestore(err, { guardar = false } = {}) {
  switch (err && err.code) {
    case 'permission-denied':
      return guardar
        ? 'Firestore ha rechazado el cambio (permisos o datos no válidos).'
        : 'Firestore ha denegado el acceso. Comprueba que las reglas tienen el UID de la cuenta propietaria.';
    case 'invalid-argument':
      return 'Firestore ha rechazado los datos como no válidos.';
    case 'unavailable':
      return guardar
        ? 'Sin conexión con Firestore: se reintentará al volver la conexión.'
        : 'Sin conexión con Firestore: no se pueden leer ni guardar datos ahora.';
    case 'unauthenticated':
      return 'La sesión no es válida. Vuelve a iniciar sesión.';
    case 'studyflow/conflicto':
      return 'Se movió en otra pestaña: revisa su fecha y vuelve a intentarlo.';
    default:
      return guardar ? 'No se pudo guardar en Firestore.' : 'No se pudieron leer los datos de Firestore.';
  }
}
