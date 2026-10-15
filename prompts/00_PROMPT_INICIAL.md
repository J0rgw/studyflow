# PROMPT INICIAL — Codex

Construye **StudyFlow**, mi agenda académica personal que voy a desplegar en **GitHub Pages**. Quiero que al entrar sepa qué tengo que estudiar hoy según mis planes definitivos de UCAM, pueda navegar por calendario, arrancar un Pomodoro vinculado a una sesión, registrar tiempo efectivo y consultar mi progreso. Debe sentirse como una herramienta de estudio práctica, no una plataforma multiusuario ni un gestor genérico.

**Antes de escribir código:** lee `CONTEXT.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/architecture.md`, `docs/firebase-setup.md` y los planes de `source-plans/` si están presentes. Haz inventario breve de archivos faltantes. El calendario maestro define sesiones y duraciones; los otros cuatro planes completan temas. No inventes sesiones si falta el maestro.

## Stack innegociable
- HTML5, CSS y JavaScript nativo con módulos ES; Vite solo para desarrollar y generar `dist` estático.
- HeroUI Styles para CSS compatible con HTML vanilla y ReIcon para iconografía, consultando antes documentación real; si hay incompatibilidades, soluciona sin introducir React, TypeScript ni otra SPA.
- Firebase Auth (email/contraseña) y Firestore (datos persistentes) consumidos desde navegador. GitHub Pages aloja frontend; Firebase aloja datos. No hay servidor propio.

## Un acceso y nada más
- **Una única cuenta** de Firebase creada manualmente por mí en consola. SIN registro, altas, gestión de usuarios, roles, perfiles ni recuperación de contraseña dentro de StudyFlow.
- Pantalla de inicio de sesión mínima: título, campo de **contraseña** y botón Entrar. El email de la única cuenta es una configuración cliente fija (`VITE_LOGIN_EMAIL`), no se pregunta en UI.
- La contraseña será la que yo configure personalmente en Firebase Console. **No la escribas ni copies al código, comentarios, fixtures, variables de entorno, prompts, tests o documentación; ni simules autenticación comparando la contraseña en frontend.** Implementa `signInWithEmailAndPassword` enviando la contraseña que escribo en el campo directamente al SDK.
- Configura `browserLocalPersistence`, observa estado Firebase Auth y muestra la app únicamente con sesión válida. La sesión permanece en el navegador tras cerrar y abrir, incluyendo localhost y Pages (cada origen guarda su sesión independientemente). Botón «Cerrar sesión» discreto.
- Datos privados únicamente bajo `users/{uid}/...`. El proyecto incluye `firestore.rules` DENY por defecto y permite acceder exclusivamente al UID propietario concreto. El template contiene `REEMPLAZAR_UID_PROPIETARIO`: NO publicar reglas sin sustituirlo, NO abrir permisos provisionales.
- Manejar correctamente Firebase sin configurar: pantalla de configuración pendiente sin enseñar datos privados ficticios. No usar LocalStorage como base de datos alternativa a Firestore; el Auth SDK puede usar almacenamiento local para la sesión.

## UX y funciones
1. Inicio «Hoy»: fecha Madrid, sesiones reales del maestro, minutos previstos/efectivos, objetivo verificable, empezar sesión, notas, marcar completado, próximo examen.
2. Calendario mensual: navegar fechas, seleccionar día, mostrar materias, días bloqueados, límites de duración, exámenes con horario; no inventar horas de comienzo del estudio.
3. Pomodoro: 25/5, 50/10, configurable, pausar/reanudar/finalizar, solo sumar foco real, no descansos; guardado remoto idempotente y resistente a recargas.
4. Progreso: plan vs trabajo real por materia, horas pendientes, notas y conceptos a repasar.
5. Reprogramación: desplazamiento manual con confirmación y respeto de fechas bloqueadas y cupos; nunca mover sin permiso.
6. Importación: JSON versionado validado a Firestore, idempotente y que preserva logs existentes; exportación JSON como copia de seguridad.
7. Diseño limpio, responsive, accesible y legible; interfaz y comentarios explicativos en castellano, sin emojis ni gamificación.

## Datos de control
- Periodo: 14/10–08/11/2026, total 104 h (Álgebra 36; Ingeniería de Requisitos 25; TAC 23; Móviles 20).
- Bloqueos: 20–22/10; 27/10 y 03/11 máximo 2h. 06/11 máximo 4h. Exámenes 07/11 Requisitos 09–11 y Álgebra 11–14; 08/11 Móviles 09–11 y TAC 11–14.
- No convertir eventos de examen en tiempo estudiado. Si faltan planes, indicar estado vacío o demo **claramente identificada**, nunca presentarla como calendario real.

## Qué debes programar AHORA
En esta ejecución, no entregues solo recomendaciones: inicia fase 1 creando proyecto Vite, archivos HTML/CSS/JS, navegación Hoy/Calendario, diseño coherente, firebase init y flujo de auth de solo contraseña, estado autenticando/error/no configurado, repositorio Firestore base e infraestructura de GitHub Pages. Añade un esquema versionado de datos, README con pasos Firebase, `firestore.rules`, `.env.example`, `.gitignore`, pruebas mínimas sin credenciales y build. Si Firestore no está configurado, deja la web desplegable con mensaje claro, pero no inventes acceso exitoso. No uses mi contraseña en ningún archivo.

Realiza las comprobaciones disponibles (al menos `npm run build` y pruebas). Resume cambios, archivos creados, bloqueos de configuración manual y siguiente fase. No realices commits sin mi aprobación.
