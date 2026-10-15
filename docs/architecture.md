# Arquitectura — StudyFlow para GitHub Pages

## Flujo
Navegador (HTML/CSS/JS/Vite) → Firebase Authentication Email/Password (único usuario) → Firestore con reglas `request.auth.uid == OWNER_UID`.

Pages únicamente hospeda el bundle. Firebase proporciona autenticación y base de datos externas; no requiere servidor propio. El login presenta solo contraseña; el email de la cuenta se configura como identificador fijo público, NO como segunda pantalla. No hay registro, administración o perfiles. Usar `setPersistence(auth, browserLocalPersistence)` + observador de sesión; antes de cargar datos, comprobar autenticación.

**No poner la contraseña ni hash verificable en el cliente.** Crear cuenta manualmente en Firebase Console con la contraseña proporcionada por el propietario. No colocarla en código, test, variables VITE ni docs. Firebase JS config y UID son públicos por naturaleza, por lo que Firestore rules han de ser efectivas incluso al invocar API fuera de StudyFlow.

## Reglas de Firestore (plantilla: reemplazar UID exacto antes de desplegar)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId
        && request.auth.uid == 'REEMPLAZAR_UID_PROPIETARIO';
    }
  }
}
```

Verificar que todos los documentos de datos están **debajo** de `users/{uid}/` y no hay permisos en otras rutas. Reglas específicas de validación de tipos/tamaños se pueden añadir según esquema. Probar con emulador dos cuentas, UID ajeno, sin login; no publicar con placeholder o reglas abiertas.

## Módulos sugeridos
- `src/services/firebase.js`: configuración firebase JS client, init y estado.
- `src/services/auth.js`: `login(password)`, `logout()`, `subscribeAuth()` y persistencia local.
- `src/services/firestore-repository.js`: operaciones por UID; guardar por lotes pequeños, logs de foco idempotentes.
- `src/data/schema.js`, `importer.js`, `validate.js`: importación de plan y validación.
- `src/features/today.js`, `calendar.js`, `focus.js`, `progress.js`, `review.js`: vistas.
- `src/app.js`: composición y navegación interna sin rutas de servidor.

Esquema orientativo: `users/{uid}/plans/{planId}`, `users/{uid}/sessions/{sessionId}`, `users/{uid}/logs/{logId}`, `users/{uid}/reviews/{id}`, `users/{uid}/events/{id}`. Mantener plan original vs ejecución/log. Idempotencia y migración versionada.

## Deploy
Vite base `/nombre-repositorio/` para project site y `/` para user/org Pages o dominio raíz. Output `dist/` a Pages por GitHub Actions. Añadir dominio de Pages y localhost a Authentication authorized domains cuando aplique. Evitar rutas pushState que den 404 al refrescar. `VITE_FIREBASE_*` son datos públicos de la app, no secretos privilegiados; nunca usar admin SDK o service account en frontend.

## Casos de prueba
- Sin iniciar sesión: ni lectura ni escritura de datos privados.
- Usuario distinto: siempre denegado incluso apuntando al UID del propietario.
- Propietario: autenticado y progreso persiste al recargar, cerrar pestaña, reabrir; verificar por separado localhost y Pages.
- Inicio offline/error: mensaje claro, no se inventa persistencia confirmada.
- Importar igual dos veces no duplica; cambiar contenido no borra logs.
- Pomodoro pausa y reanuda sin contar descansos ni intervalos duplicados.
