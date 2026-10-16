# CLAUDE.md — instrucciones de desarrollo

Leer `AGENTS.md`, `CONTEXT.md`, `README.md` y `docs/architecture.md`. StudyFlow es personal y estático en GitHub Pages, pero los datos privados se guardan en Firestore bajo una única cuenta Firebase Auth preconfigurada. Mantener HTML/CSS/JS ES Modules con Vite, HeroUI Styles y ReIcon si funcionan en vanilla.

Reglas críticas: sin registro ni gestión de cuentas; solo contraseña en formulario, email de inicio de sesión fijo configurado, nunca contraseña hardcodeada; `browserLocalPersistence` por origen. Firestore con reglas de UID concreto, todo denegado para no autenticados o UID ajeno. No fingir que una protección visual oculta los datos. No guardar credenciales en repositorio o prompts.

No inventar sesiones del plan maestro ni confundir horas previstas, trabajadas y dominio. Validar importación, proteger logs y mantener progreso. Antes de cada paso decir qué se implementará y después probar build, tests y explicar qué falta para Firebase/Pages. Sin commits automáticos.

Diseño: antes de tocar UI, CSS, animación o copy, leer `docs/design.md` y consultar sus referencias (sección 1). Tokens `--sf-*`, poco texto, scroll suave, `prefers-reduced-motion`.
