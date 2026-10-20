// Coordinador del modo foco. El estado vive en Firestore (focus/actual) y todas las pestañas lo
// escuchan, asi que recargar o abrir otra pestaña continua el mismo foco sin duplicarlo.
// - Reconcilia cada medio segundo y al volver a la pestaña: las fases se cierran en su instante
//   exacto aunque los temporizadores del navegador se retrasen en segundo plano.
// - Cada intervalo de foco terminado entra en la bandeja del documento en la MISMA escritura que
//   el cambio de fase, y luego se crea en logs con id determinista (solo si no existe).
// - Nada cuenta como trabajado hasta que Firestore lo confirma; sin conexion se reintenta y un
//   rechazo del servidor se muestra y espera a que el usuario lo reintente.
// Sin DOM: reloj, temporizadores y eventos del navegador se inyectan para probarlo en Node.
import {
  crearEjecucion, avanzar, ACCIONES, esEjecucionValida, normalizarEjecucion, configDe,
} from '../data/pomodoro.js';
import { esErrorTransitorio, mensajeErrorFirestore } from './errores-firestore.js';

const TICK_MS = 500;
// Una escritura del foco tarda ~100 ms en confirmarse: solo se avisa si tarda mas que esto.
const AVISO_SIN_CONFIRMAR_MS = 2000;
const ESPERAS_REINTENTO = [2000, 5000, 15000, 30000, 60000];
const CAMPOS = ['id', 'fase', 'intervalo', 'corriendo', 'desde', 'acumuladoMs', 'inicioIntervalo', 'pausadoEn'];

/**
 * Reloj de pared que nunca retrocede dentro de la pagina. Se usa la hora real (y no
 * performance.now) porque debe coincidir con la de otras pestañas y tras recargar, y porque con
 * el movil bloqueado el foco sigue corriendo; si el reloj del sistema retrocede, no resta tiempo.
 */
export function relojMonotono(fuente = () => Date.now()) {
  let ultimo = -Infinity;
  return () => { ultimo = Math.max(ultimo, fuente()); return ultimo; };
}

export function nuevoIdEjecucion() { return crypto.randomUUID().replace(/-/g, ''); }

const iguales = (a, b) => a && b && CAMPOS.every((k) => a[k] === b[k]);

const TIMERS = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
};

export function createFocoController({
  repo, ahora = relojMonotono(), timers = TIMERS, entorno = {}, crearId = nuevoIdEjecucion, onCambio = () => {},
}) {
  let activo = false;
  let listo = false;
  let error = null;
  let ejecucion = null;
  let rev = 0;
  let escriturasEnVuelo = 0;
  let enVueloDesde = null;
  let avisoLento = null;
  let errorEscritura = null;
  const bandeja = new Map(); // id -> datos del registro aun sin confirmar
  const envio = new Map(); // id -> { estado: 'guardando' | 'reintento' | 'error', intentos, mensaje }
  const confirmados = new Set();
  const descartados = new Set(); // rechazados que el usuario decidio no guardar
  let cancelarEscucha = null;
  let tick = null;
  let reintento = null;

  function persistir(estado, registros) {
    ejecucion = estado;
    rev += 1;
    for (const r of registros) if (!confirmados.has(r.id)) bandeja.set(r.id, r.datos);
    escriturasEnVuelo += 1;
    if (enVueloDesde == null) {
      enVueloDesde = ahora();
      avisoLento = timers.setTimeout(() => { avisoLento = null; onCambio(); }, AVISO_SIN_CONFIRMAR_MS + 50);
    }
    errorEscritura = null;
    Promise.resolve()
      .then(() => repo.guardarFoco({ rev, ejecucion: estado, nuevos: registros }))
      .catch((err) => {
        // Rechazado: lo que vale es lo que tiene el servidor. Los registros siguen en la bandeja
        // local y se intentan crear igualmente; si no, quedan a la vista como no guardados.
        errorEscritura = mensajeErrorFirestore(err, { guardar: true });
        resincronizar();
      })
      .finally(() => {
        escriturasEnVuelo -= 1;
        if (escriturasEnVuelo === 0) {
          enVueloDesde = null;
          if (avisoLento != null) { timers.clearTimeout(avisoLento); avisoLento = null; }
        }
        onCambio();
      });
    vaciar();
    onCambio();
  }

  function reconciliar() {
    if (!activo || !ejecucion) return;
    const { estado, registros } = avanzar(ejecucion, ahora());
    if (registros.length > 0 || !iguales(estado, ejecucion)) persistir(estado, registros);
  }

  function programarReintento(ms) {
    if (reintento != null) return;
    reintento = timers.setTimeout(() => { reintento = null; vaciar({ reintentos: true }); }, ms);
  }

  function enviar(id, datos) {
    const intentos = (envio.get(id)?.intentos ?? 0) + 1;
    envio.set(id, { estado: 'guardando', intentos, mensaje: null });
    Promise.resolve().then(() => repo.confirmarRegistro(id, datos)).then(
      () => { bandeja.delete(id); envio.delete(id); confirmados.add(id); onCambio(); },
      (err) => {
        const mensaje = mensajeErrorFirestore(err, { guardar: true });
        if (esErrorTransitorio(err)) {
          envio.set(id, { estado: 'reintento', intentos, mensaje });
          programarReintento(ESPERAS_REINTENTO[Math.min(intentos, ESPERAS_REINTENTO.length) - 1]);
        } else {
          // Rechazo remoto: no se reintenta solo (repetiria el mismo rechazo) ni se da por guardado.
          envio.set(id, { estado: 'error', intentos, mensaje });
        }
        onCambio();
      },
    );
  }

  function vaciar({ reintentos = false, errores = false } = {}) {
    if (!activo) return;
    for (const [id, datos] of bandeja) {
      const e = envio.get(id)?.estado;
      if (!e || (reintentos && e === 'reintento') || (errores && e === 'error')) enviar(id, datos);
    }
  }

  function alRecibir({ datos }) {
    listo = true;
    error = null;
    const r = Number.isInteger(datos?.rev) ? datos.rev : 0;
    // Una instantanea anterior a una escritura propia (rev menor) no pisa el estado local.
    if (r >= rev) {
      rev = r;
      ejecucion = esEjecucionValida(datos?.ejecucion) ? normalizarEjecucion(datos.ejecucion) : null;
    }
    for (const [id, d] of Object.entries(datos?.pendientes ?? {})) {
      if (!confirmados.has(id) && !descartados.has(id) && !bandeja.has(id)) bandeja.set(id, d);
    }
    reconciliar();
    vaciar();
    onCambio();
  }

  function escuchar() {
    cancelarEscucha = repo.escucharFoco(alRecibir, (err) => {
      listo = false;
      error = `${mensajeErrorFirestore(err)} Recarga la página.`;
      onCambio();
    });
  }

  function resincronizar() {
    if (!activo) return;
    if (cancelarEscucha) cancelarEscucha();
    rev = 0;
    escuchar();
  }

  const alVolverConexion = () => {
    if (reintento != null) { timers.clearTimeout(reintento); reintento = null; }
    vaciar({ reintentos: true });
  };
  const alCambiarVisibilidad = () => reconciliar();

  return {
    iniciar() {
      if (activo) return;
      activo = true;
      escuchar();
      tick = timers.setInterval(reconciliar, TICK_MS);
      entorno.online?.addEventListener('online', alVolverConexion);
      entorno.visible?.addEventListener('visibilitychange', alCambiarVisibilidad);
    },

    detener() {
      activo = false;
      if (cancelarEscucha) cancelarEscucha();
      if (tick != null) timers.clearInterval(tick);
      if (reintento != null) timers.clearTimeout(reintento);
      if (avisoLento != null) timers.clearTimeout(avisoLento);
      cancelarEscucha = null; tick = null; reintento = null; avisoLento = null;
      entorno.online?.removeEventListener('online', alVolverConexion);
      entorno.visible?.removeEventListener('visibilitychange', alCambiarVisibilidad);
    },

    /**
     * Empieza un foco para `sesion` (con `objetivoMs`: lo que falta de su tiempo) o, sin sesion,
     * un foco libre con `materiaId` opcional. Si ya hay un foco en marcha de otra cosa no lo pisa;
     * un descanso o espera se cierra (no hay foco sin guardar) y empieza el nuevo.
     */
    empezar({ sesion = null, materiaId = null, objetivoMs = null, ajustes }) {
      if (!listo) return { ok: false, mensaje: error ?? 'Comprobando si hay un foco activo…' };
      const t = ahora();
      const sesionId = sesion ? sesion.id : null;
      let registros = [];
      if (ejecucion) {
        const r = avanzar(ejecucion, t);
        // Misma sesion, o foco libre sobre foco libre: se abre el que ya existe.
        if (r.estado.sesionId === sesionId) {
          if (r.registros.length > 0) persistir(r.estado, r.registros);
          return { ok: true, existente: true };
        }
        if (r.estado.fase === 'foco') return { ok: false, mensaje: 'Ya hay otro foco en marcha.' };
        registros = r.registros;
      }
      persistir(crearEjecucion({
        id: crearId(), sesion, materiaId, objetivoMs, config: configDe(ajustes), ahora: t,
      }), registros);
      return { ok: true };
    },

    /** pausar | reanudar | siguiente | finalizar | descartar. Repetirla (doble clic) no duplica. */
    accion(tipo) {
      if (!activo || !ejecucion || !ACCIONES[tipo]) return false;
      const { estado, registros } = ACCIONES[tipo](ejecucion, ahora());
      if (registros.length === 0 && iguales(estado, ejecucion)) return false;
      persistir(estado, registros);
      return true;
    },

    /** Reintenta ya los registros rechazados o en espera de conexion. */
    reintentar() { vaciar({ reintentos: true, errores: true }); onCambio(); },

    /** Quita de la bandeja un registro que Firestore rechazo (decision explicita del usuario). */
    descartarPendiente(id) {
      if (envio.get(id)?.estado !== 'error') return false;
      descartados.add(id);
      bandeja.delete(id);
      envio.delete(id);
      Promise.resolve().then(() => repo.quitarPendiente(id)).catch(() => {});
      onCambio();
      return true;
    },

    vista() {
      return {
        listo,
        error,
        ejecucion,
        ahora: ahora(),
        pendientes: [...bandeja].map(([id, datos]) => ({ id, datos, ...(envio.get(id) ?? { estado: 'guardando', mensaje: null }) })),
        // Escrituras del estado del foco que Firestore tarda en confirmar (p. ej. sin conexion).
        sinConfirmar: enVueloDesde != null && ahora() - enVueloDesde >= AVISO_SIN_CONFIRMAR_MS,
        errorEscritura,
      };
    },

    hayCambiosSinGuardar() { return bandeja.size > 0 || escriturasEnVuelo > 0; },
  };
}
