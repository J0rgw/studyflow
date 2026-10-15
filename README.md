# StudyFlow — kit de desarrollo con Codex

Agenda de estudio personal: HTML + CSS + JS nativo, HeroUI Styles, ReIcon, Vite, Firebase Authentication y Cloud Firestore. Se publica en GitHub Pages (estático); Firebase gestiona el acceso y datos mediante servicios externos. No es la práctica Android.

## Empezar

1. Copiar esta carpeta a un repositorio Git nuevo. Crear `source-plans/` y colocar los cinco planes originales, especialmente calendario maestro y plan definitivo de Álgebra. No publicar documentos que contengan datos personales en un repositorio público.
2. Crear proyecto Firebase en su consola. Activar Authentication Email/Password y Firestore. Crear **manualmente una única cuenta** con un email de uso personal y la contraseña elegida por el propietario; no registrar la contraseña en código, prompts, commits ni variables VITE. Guardar el UID de esa cuenta.
3. Configurar `VITE_FIREBASE_*` con valores de configuración pública (no contraseñas), y un email de inicio de sesión predefinido si se desea una pantalla de solo contraseña; publicar las reglas Firestore que permitan acceso **solo a ese UID exacto**. Mantener el UID y la configuración en ajustes de despliegue apropiados: el UID no es un secreto, las reglas son la defensa real.
4. Pegar `prompts/00_PROMPT_INICIAL.md` en Codex y ejecutar fases posteriores en orden. No pretender que la autenticación real funciona hasta que se configuren Firebase y reglas.
5. GitHub Pages: servir los archivos `dist` de Vite con `base` adaptado al nombre del repositorio o `/` si es sitio raíz. Configurar dominios autorizados de Firebase para localhost y el dominio del sitio según proceda. Verificar que no hay rutas SPA rotas.

## Nota de seguridad

GitHub Pages no ejecuta una base de datos ni valida contraseñas. Una contraseña hardcodeada en JS, incluso ofuscada o mediante hash, no sirve para proteger datos privados. Firebase ofrece autenticación real y Firestore persistente. La configuración pública de Firebase **no es un secreto**; las reglas de acceso sí son imprescindibles. La persistencia del login en localhost y en GitHub Pages es independiente para cada origen. No hay registro, recuperación de contraseña, perfiles ni administración de usuarios dentro de StudyFlow.

## Archivos

- `CONTEXT.md`: contexto académico y funcional.
- `AGENTS.md` y `CLAUDE.md`: instrucciones para agentes.
- `docs/architecture.md`: arquitectura y reglas de seguridad.
- `docs/firebase-setup.md`: pasos manuales de despliegue.
- `prompts/00_PROMPT_INICIAL.md`: instrucción inicial para Codex.
- `prompts/01_...` a `05_...`: fases.

## Desarrollo (fase 1)

```bash
npm install
cp .env.example .env.local   # rellenar con la config cliente de Firebase
npm run dev                  # desarrollo
npm test                     # pruebas (sin credenciales)
npm run build                # genera dist/ estatico
npm run rules:check          # falla si firestore.rules conserva REEMPLAZAR_UID_PROPIETARIO
```

Estado: login de solo contrasena (Firebase Auth, `browserLocalPersistence`), vistas Hoy y Calendario, repositorio Firestore de solo lectura y despliegue por GitHub Actions (`.github/workflows/deploy.yml`, variables `VITE_*` como Repository Variables). Sin configurar Firebase la web muestra una pantalla de configuracion pendiente.

Notas:
- `source-plans/` no existe todavia: no hay sesiones reales. Hoy y Calendario solo muestran los datos de control (bloqueos, limites, examenes, horas previstas). La importacion llega en la fase 2.
- HeroUI Styles 3 (clases CSS sobre Tailwind 4) y Reicon (SVG vanilla, importados icono a icono) funcionan sin React.
- `npm audit` senala `@grpc/grpc-js` dentro de Firestore: es la ruta de Node, no se incluye en el bundle del navegador.
- La base de Vite es relativa (`./`) y la navegacion usa hash, validos en cualquier subruta de Pages.
