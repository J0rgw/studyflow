// Repositorio Firestore. Toda operacion cuelga de users/{uid}/...
// Fase 2: lectura, importacion idempotente por lotes y exportacion completa.
// Fase 3: progreso de sesiones, foco compartido entre pestañas y registros de foco idempotentes.
// Fase 4: reprogramaciones auditadas, dudas y cierre del dia.
import {
  collection, doc, getDocs, setDoc, deleteDoc, writeBatch, onSnapshot, runTransaction, serverTimestamp, deleteField, FieldPath,
} from 'firebase/firestore';
import { COLECCIONES, SCHEMA_VERSION, DOC_FOCO, DOC_AJUSTES_FOCO, rutaColeccion } from '../data/schema.js';
import { aEscribir, trocear } from '../data/importer.js';
import { resolverMovimiento } from '../data/reprogramacion.js';

/** Error propio: la sesion se movio en otra pestaña entre que se vio y se confirmo. */
export const CONFLICTO_REPROGRAMACION = 'studyflow/conflicto';

export function createRepository({ db, uid }) {
  const ref = (coleccion, id) => doc(db, ...rutaColeccion(uid, coleccion), id);
  const col = (coleccion) => collection(db, ...rutaColeccion(uid, coleccion));
  const escucharMapa = (coleccion, cb, onError) => onSnapshot(col(coleccion),
    (snap) => cb(new Map(snap.docs.map((d) => [d.id, d.data()]))), onError);
  const escucharLista = (coleccion, cb, onError) => onSnapshot(col(coleccion),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
  const refFoco = () => ref(COLECCIONES.foco, DOC_FOCO);
  // Quita un registro de la bandeja del foco (ya creado, o descartado por el usuario).
  const quitarPendiente = (id) => setDoc(refFoco(), { pendientes: { [id]: deleteField() } }, { merge: true });

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

    // ---------- Progreso (estado manual y notas) ----------

    /** cb(Map sesionId -> { estado, nota }) con cada cambio (tambien de otras pestañas). */
    escucharProgreso(cb, onError) {
      return onSnapshot(collection(db, ...rutaColeccion(uid, COLECCIONES.progreso)),
        (snap) => cb(new Map(snap.docs.map((d) => [d.id, d.data()]))), onError);
    },

    /** Resuelve solo cuando Firestore confirma la escritura (sin conexion queda pendiente). */
    guardarProgreso(sesionId, campos) {
      return setDoc(ref(COLECCIONES.progreso, sesionId),
        { schemaVersion: SCHEMA_VERSION, sesionId, ...campos, actualizadoEn: serverTimestamp() }, { merge: true });
    },

    // ---------- Registros de foco ----------

    /** cb(lista) con los registros CONFIRMADOS por el servidor. */
    escucharRegistros(cb, onError) {
      return onSnapshot(collection(db, ...rutaColeccion(uid, COLECCIONES.registros)),
        (snap) => cb(snap.docs.filter((d) => !d.metadata.hasPendingWrites).map((d) => ({ id: d.id, ...d.data() }))), onError);
    },

    /**
     * Crea el registro solo si no existe (transaccion: necesita conexion y no confirma nada sin
     * el servidor). Mismo id = mismo intervalo: repetirlo desde otra pestaña o tras recargar no
     * duplica. Despues lo quita de la bandeja del foco (si eso falla, el siguiente intento lo
     * encuentra creado y solo lo quita).
     */
    async confirmarRegistro(id, datos) {
      const r = ref(COLECCIONES.registros, id);
      const resultado = await runTransaction(db, async (tx) => {
        if ((await tx.get(r)).exists()) return 'existente';
        tx.set(r, { ...datos, creadoEn: serverTimestamp() });
        return 'creado';
      });
      quitarPendiente(id).catch(() => {});
      return resultado;
    },

    quitarPendiente,

    // ---------- Foco activo (compartido entre pestañas y dispositivos) ----------

    /** cb({ datos }) del documento focus/actual (datos null si no existe). */
    escucharFoco(cb, onError) {
      return onSnapshot(refFoco(), (snap) => cb({ datos: snap.exists() ? snap.data() : null }), onError);
    },

    /**
     * Guarda el estado del foco y añade registros a su bandeja en UNA escritura: un intervalo
     * terminado nunca queda fuera de Firestore aunque la pestaña se cierre antes de crearlo.
     * mergeFields sustituye `ejecucion` entera y solo añade claves a `pendientes`.
     */
    guardarFoco({ rev, ejecucion, nuevos = [] }) {
      const datos = {
        schemaVersion: SCHEMA_VERSION, rev, ejecucion, actualizadoEn: serverTimestamp(),
        pendientes: Object.fromEntries(nuevos.map((r) => [r.id, r.datos])),
      };
      const campos = ['schemaVersion', 'rev', 'ejecucion', 'actualizadoEn', ...nuevos.map((r) => new FieldPath('pendientes', r.id))];
      return setDoc(refFoco(), datos, { mergeFields: campos });
    },

    // ---------- Ajustes del temporizador ----------

    escucharAjustesFoco(cb, onError) {
      return onSnapshot(ref(COLECCIONES.ajustes, DOC_AJUSTES_FOCO), (snap) => cb(snap.exists() ? snap.data() : null), onError);
    },

    guardarAjustesFoco(ajustes) {
      return setDoc(ref(COLECCIONES.ajustes, DOC_AJUSTES_FOCO), { schemaVersion: SCHEMA_VERSION, ...ajustes });
    },

    // ---------- Reprogramacion (fase 4) ----------

    /** cb(Map sesionId -> { fecha, fechaPlan, rev }) de las sesiones movidas a mano. */
    escucharReprogramaciones(cb, onError) { return escucharMapa(COLECCIONES.reprogramaciones, cb, onError); },

    /** cb(lista) de eventos de auditoria (solo se crean: las reglas impiden cambiarlos). */
    escucharEventos(cb, onError) { return escucharLista(COLECCIONES.eventos, cb, onError); },

    /**
     * Mueve una sesion ya confirmada por el usuario. Transaccion: lee la fecha vigente y escribe
     * el documento reschedules (rev + 1) y su evento de auditoria juntos o nada. Repetirla no
     * duplica ('existente'); si otra pestaña la movio a otra fecha, falla con CONFLICTO sin pisar.
     * Necesita conexion: sin servidor no se confirma nada.
     */
    async reprogramar(pedido) {
      const r = ref(COLECCIONES.reprogramaciones, pedido.sesionId);
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(r);
        const decision = resolverMovimiento(snap.exists() ? snap.data() : null, pedido);
        if (decision.accion === 'conflicto') {
          throw Object.assign(new Error('La sesión se movió en otra pestaña.'), { code: CONFLICTO_REPROGRAMACION });
        }
        if (decision.accion === 'escribir') {
          tx.set(r, { ...decision.doc, actualizadoEn: serverTimestamp() });
          tx.set(ref(COLECCIONES.eventos, decision.id), { ...decision.evento, creadoEn: serverTimestamp() });
        }
        return decision.accion;
      });
    },

    // ---------- Dudas ----------

    escucharDudas(cb, onError) { return escucharLista(COLECCIONES.repasos, cb, onError); },

    /** Crea la duda con el id del cliente: repetirla reescribe el mismo documento. */
    guardarDuda(id, datos) {
      return setDoc(ref(COLECCIONES.repasos, id), { ...datos, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp() });
    },

    cambiarEstadoDuda(id, estado) {
      return setDoc(ref(COLECCIONES.repasos, id), { estado, actualizadoEn: serverTimestamp() }, { merge: true });
    },

    borrarDuda(id) { return deleteDoc(ref(COLECCIONES.repasos, id)); },

    // ---------- Cierre del dia ----------

    escucharCierres(cb, onError) { return escucharMapa(COLECCIONES.cierres, cb, onError); },

    /** Un documento por fecha: guardar de nuevo el cierre del mismo dia lo sustituye. */
    guardarCierre(datos) {
      return setDoc(ref(COLECCIONES.cierres, datos.fecha), { ...datos, cerradoEn: serverTimestamp() });
    },
  };
}

export { mensajeErrorFirestore, esErrorTransitorio } from './errores-firestore.js';
