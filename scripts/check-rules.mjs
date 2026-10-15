// Comprueba que firestore.rules no conserva el marcador de plantilla.
// Ejecutar antes de publicar las reglas: npm run rules:check
import { readFileSync } from 'node:fs';

const reglas = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
if (reglas.includes("== 'REEMPLAZAR_UID_PROPIETARIO'")) {
  console.error('firestore.rules aun contiene REEMPLAZAR_UID_PROPIETARIO. Sustituyelo por el UID real antes de publicar.');
  process.exit(1);
}
console.log('firestore.rules: marcador de UID sustituido.');
