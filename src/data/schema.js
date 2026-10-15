// Esquema versionado de datos. Todo cuelga de users/{uid}/...
// Plan original (plans, sessions) separado de la ejecucion (logs, reviews).

export const SCHEMA_VERSION = 1;

export const COLECCIONES = Object.freeze({
  planes: 'plans',
  sesiones: 'sessions',
  registros: 'logs',
  repasos: 'reviews',
  eventos: 'events',
});

/** Segmentos de ruta de una coleccion privada del propietario. */
export function rutaColeccion(uid, coleccion) {
  if (!uid) throw new Error('uid obligatorio');
  if (!Object.values(COLECCIONES).includes(coleccion)) {
    throw new Error(`Coleccion desconocida: ${coleccion}`);
  }
  return ['users', uid, coleccion];
}
