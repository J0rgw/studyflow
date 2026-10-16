# AGENTS.md — Instrucciones obligatorias

## Objetivo
Construir la web personal StudyFlow con calendario, Hoy, Pomodoro, progreso y repasos. Leer `CONTEXT.md`, `docs/architecture.md` y `README.md` antes de editar. El calendario maestro manda sobre las cuatro guías individuales.

## Restricciones técnicas
- HTML, CSS, JS ES Modules; Vite de build/dev; no React, TypeScript, frameworks SPA ni backend propio.
- HeroUI Styles y ReIcon solo tras verificar APIs reales y compatibilidad con HTML vanilla. Si una biblioteca no funciona sin React, documentar la limitación y aplicar estilos nativos sin cambiar de stack.
- GitHub Pages como frontend estático y Firebase Auth + Firestore para autenticación y datos persistentes. Sin panel de gestión de usuarios, registro, perfiles ni recuperación.
- Login de una cuenta creada manualmente: UI de un solo campo de contraseña, email fijo configurado aparte, sin exponer credenciales ni contraseña en bundle, test, fixture, consola o repo. Sesión persistente en browserLocalPersistence. No escribir contraseña en prompts o documentos.
- Firestore privado SOLO para UID autorizado mediante security rules restrictivas, incluidas subcolecciones; denegar por defecto. Probar acceso sin autenticar y con cuenta distinta.
- El frontend no contiene secretos privados. `.env.example` solo con nombres/valores ficticios de configuración pública; `.env.local` ignorado. No utilizar VITE_ para contraseñas, claves de servicio ni tokens privilegiados.
- Tratar Firebase como conexión imprescindible para sincronización; UI honesta en offline/errores. Persistir minutos reales solo tras confirmación durable; evitar duplicados por recarga, doble clic o pestañas.
- Rutas compatibles con `base` de GitHub Pages; usar hash-routing o cambio de vistas sin servidor de rutas.

## Reglas funcionales
- Importación segura y auditable; no fabricar días/horas, no perder progreso en reimportación, IDs estables, datos de prueba claramente etiquetados.
- Planificado ≠ realizado ≠ aprendido. Solo sumar tiempo de foco, no descanso. Desplazamiento manual con confirmación y límites.
- Protección ante XSS: no interpolar notas arbitrarias con innerHTML. Accesibilidad teclado y etiquetas en español.
- Tests de validación plan, reglas, sincronización, progreso, cronómetro y producción Pages.

## Proceso
Una fase por prompt. Ejecutar tests/build, documentar cambios y limitaciones. Historial de Git legible en castellano; NO hacer commits sin autorización. No modificar los planes originales.

## Diseño
Antes de cualquier cambio de UI, CSS, animación o texto de interfaz: leer `docs/design.md` y abrir las referencias de su sección 1 (Designspells, Dribbble, Collect UI). Usar solo los tokens `--sf-*`, mínimo texto explicativo, smooth scroll y respetar `prefers-reduced-motion`. Si se añade o cambia una referencia, actualizar `docs/design.md`.
