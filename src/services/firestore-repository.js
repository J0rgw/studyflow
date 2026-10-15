// Repositorio Firestore base. Toda operacion cuelga de users/{uid}/...
// Fase 1: solo lectura. Las escrituras (importacion, logs de foco) llegan en fases posteriores.
import { collection, getDocs } from 'firebase/firestore';
import { COLECCIONES, rutaColeccion } from '../data/schema.js';

export function createRepository({ db, uid }) {
  return {
    async listPlans() {
      const snap = await getDocs(collection(db, ...rutaColeccion(uid, COLECCIONES.planes)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  };
}

/** Mensaje honesto en castellano para un error de Firestore. */
export function mensajeErrorFirestore(err) {
  switch (err && err.code) {
    case 'permission-denied':
      return 'Firestore ha denegado el acceso. Comprueba que las reglas tienen el UID de la cuenta propietaria.';
    case 'unavailable':
      return 'Sin conexión con Firestore: no se pueden leer ni guardar datos ahora.';
    case 'unauthenticated':
      return 'La sesión no es válida. Vuelve a iniciar sesión.';
    default:
      return 'No se pudieron leer los datos de Firestore.';
  }
}
