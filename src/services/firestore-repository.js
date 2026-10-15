// Repositorio Firestore base. Toda operacion cuelga de users/{uid}/...
// Fase 2: lectura, importacion idempotente por lotes y exportacion completa.
import { collection, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { COLECCIONES, SCHEMA_VERSION, rutaColeccion } from '../data/schema.js';
import { aEscribir, trocear } from '../data/importer.js';

export function createRepository({ db, uid }) {
  return {
    async listPlans() {
      const snap = await getDocs(collection(db, ...rutaColeccion(uid, COLECCIONES.planes)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },

    async listSessions() {
      const snap = await getDocs(collection(db, ...rutaColeccion(uid, COLECCIONES.sesiones)));
      return new Map(snap.docs.map((d) => [d.id, d.data()]));
    },

    /**
     * Escribe solo lo que cambia, en lotes, y el documento del plan al FINAL: si un lote
     * falla, repetir la importacion es seguro (mismos IDs, mismos datos). merge:true evita
     * tocar campos que no son del plan.
     */
    async importPlan(plan, diff, onProgreso = () => {}) {
      const pendientes = aEscribir(diff);
      const lotes = trocear(pendientes);
      let hechas = 0;
      for (const lote of lotes) {
        const batch = writeBatch(db);
        for (const { id, doc: datos } of lote) {
          batch.set(doc(db, ...rutaColeccion(uid, COLECCIONES.sesiones), id), datos, { merge: true });
        }
        await batch.commit();
        hechas += lote.length;
        onProgreso(hechas, pendientes.length);
      }
      await setDoc(doc(db, ...rutaColeccion(uid, COLECCIONES.planes), plan.planId), {
        schemaVersion: SCHEMA_VERSION,
        planId: plan.planId,
        titulo: plan.titulo,
        origen: plan.origen,
        completo: plan.completo,
        totalSesiones: plan.sesiones.length,
        prueba: plan.origen.etiqueta === 'prueba',
      }, { merge: true });
      return { escritas: hechas };
    },

    /** Copia completa de todas las colecciones privadas del propietario. */
    async exportAll() {
      const datos = {};
      for (const nombre of Object.values(COLECCIONES)) {
        const snap = await getDocs(collection(db, ...rutaColeccion(uid, nombre)));
        datos[nombre] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      return { schemaVersion: SCHEMA_VERSION, exportadoEn: new Date().toISOString(), colecciones: datos };
    },
  };
}

/** Mensaje honesto en castellano para un error de Firestore. */
export function mensajeErrorFirestore(err) {
  switch (err && err.code) {
    case 'permission-denied':
      return 'Firestore ha denegado el acceso. Comprueba que las reglas tienen el UID de la cuenta propietaria.';
    case 'invalid-argument':
      return 'Firestore ha rechazado los datos como no válidos.';
    case 'unavailable':
      return 'Sin conexión con Firestore: no se pueden leer ni guardar datos ahora.';
    case 'unauthenticated':
      return 'La sesión no es válida. Vuelve a iniciar sesión.';
    default:
      return 'No se pudieron leer los datos de Firestore.';
  }
}
