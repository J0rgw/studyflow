// Esquema versionado de datos. Todo cuelga de users/{uid}/...
// Plan original (plans, sessions) separado de la ejecucion (logs, progress, focus, reviews...).
// Las sesiones del plan nunca se modifican desde la app: una fecha nueva vive en reschedules.

export const SCHEMA_VERSION = 1;

export const COLECCIONES = Object.freeze({
  planes: 'plans',
  sesiones: 'sessions',
  // Registros de foco: solo se crean (las reglas impiden modificarlos o borrarlos).
  registros: 'logs',
  // Estado manual, resultado del objetivo y notas de cada sesion: progress/{sesionId}.
  progreso: 'progress',
  // Foco activo compartido entre pestañas y su bandeja de registros por confirmar: focus/actual.
  foco: 'focus',
  // Preferencias (modo del temporizador): settings/foco.
  ajustes: 'settings',
  // Dudas y errores por materia (pendiente, en repaso, resuelta): reviews/{id}.
  repasos: 'reviews',
  // Auditoria de reprogramaciones: events/{sesionId-rev}. Solo se crean.
  eventos: 'events',
  // Fecha vigente de una sesion movida a mano: reschedules/{sesionId}.
  reprogramaciones: 'reschedules',
  // Cierre del dia (dificultades y pendiente): closings/{AAAA-MM-DD}.
  cierres: 'closings',
});

export const DOC_FOCO = 'actual';
export const DOC_AJUSTES_FOCO = 'foco';

/** Segmentos de ruta de una coleccion privada del propietario. */
export function rutaColeccion(uid, coleccion) {
  if (!uid) throw new Error('uid obligatorio');
  if (!Object.values(COLECCIONES).includes(coleccion)) {
    throw new Error(`Coleccion desconocida: ${coleccion}`);
  }
  return ['users', uid, coleccion];
}
