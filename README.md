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

## Desarrollo (fases 1 a 4)

```bash
npm install
cp .env.example .env.local   # rellenar con la config cliente de Firebase
npm run dev                  # desarrollo
npm test                     # pruebas (sin credenciales)
npm run build                # genera dist/ estatico
npm run test:rules           # reglas Firestore contra el emulador (requiere Java)
npm run rules:check          # falla si firestore.rules conserva REEMPLAZAR_UID_PROPIETARIO
```

Estado: login de solo contrasena (Firebase Auth, `browserLocalPersistence`), vistas Hoy y Calendario, repositorio Firestore de solo lectura y despliegue por GitHub Actions (`.github/workflows/deploy.yml`, variables `VITE_*` como Repository Variables). Sin configurar Firebase la web muestra una pantalla de configuracion pendiente.

Notas:
- `source-plans/` no existe todavia: no hay sesiones reales. Hoy y Calendario solo muestran los datos de control (bloqueos, limites, examenes, horas previstas). La importacion llega en la fase 2.
- HeroUI Styles 3 (clases CSS sobre Tailwind 4) y Reicon (SVG vanilla, importados icono a icono) funcionan sin React.
- `npm audit` senala `@grpc/grpc-js` dentro de Firestore: es la ruta de Node, no se incluye en el bundle del navegador.
- La base de Vite es relativa (`./`) y la navegacion usa hash, validos en cualquier subruta de Pages.

## Importacion de planes (fase 2)

Vista **Datos**: elegir un JSON `schemaVersion 1` (ejemplo etiquetado como prueba en `examples/plan-prueba.json`), revisar errores/avisos y cambios, y confirmar. Campos de sesion: `id`, `fecha`, `materiaId`, `titulo`, `tema`, `objetivo`, `minutos`, `orden`; sin hora de inicio. Plan con `completo: true` debe sumar exactamente 104 h (y cuadrar las referencias de 23/10, 27/10 y 06/11) o la importacion se bloquea; `completo: false` es un plan parcial que solo avisa.

- Idempotente: IDs estables, solo se escriben sesiones nuevas o cambiadas, en lotes de 400 y el documento del plan al final. Las sesiones guardadas que ya no estan en el archivo se conservan.
- Las sesiones guardan solo datos del plan; el progreso (logs, estados) vive en otras colecciones y no se toca.
- Copia de seguridad: boton «Descargar copia JSON» en Datos (se genera en el navegador). No subirla a un repositorio publico.
- `source-plans/` sigue sin existir: no hay calendario real. Hay que convertir el plan maestro a este JSON y validarlo; la app no inventa sesiones.

## Sesiones y foco (fase 3)

- **Detalle de sesion** (`#/sesion/<id>`, desde Hoy, Calendario o Plan): objetivo, tiempo trabajado frente a previsto con sus registros, estado (Pendiente, Parcial, Completada, Pospuesta) y notas. El estado lo marca el usuario: terminar un pomodoro nunca completa la sesion. Sin marca, una sesion con tiempo confirmado se ve como «Parcial»; con un foco activo, «En curso».
- **Foco** (destino «Foco» de la navegacion, `#/foco`): 25/5, 50/10 o libre (foco 5-120 min, descanso 1-30) y pausa larga configurable (15 min cada 4 por defecto, en `settings/foco`). Pausar, reanudar, saltar descanso, finalizar (guarda el foco interrumpido si llega a 1 min) y descartar (doble pulsacion). Con un foco activo, la barra superior muestra el tiempo y lleva al foco.
  - **Foco libre:** sin foco activo, «Foco» permite empezar uno sin sesion, con materia opcional (si se elige, el tiempo queda asociado a esa asignatura). Tras un descanso no arranca otro foco solo.
  - **Desde una sesion** (▶ en Hoy o «Empezar» en su detalle): arranca al instante con el modo de esa sesion (o el general) y un **objetivo** = minutos queridos para la sesion (por defecto los previstos) menos lo ya trabajado. Los focos se encadenan solos hasta cubrirlo (el ultimo se acorta) y despues queda «Objetivo cumplido», sin completar la sesion. Solo se encadena si una pestaña abierta ve terminar el descanso: con la app cerrada se queda en espera. Modo y objetivo se guardan por sesion en `progress/{sesionId}` (`focoModo`, `focoObjetivoMin`).
- **Solo cuenta el foco con el reloj en marcha.** El estado guarda instantes absolutos en `users/{uid}/focus/actual` y el tiempo se calcula siempre desde ellos (reloj de pared que nunca retrocede), no contando ticks: recargar, cerrar la pestaña o abrir otra pestaña o dispositivo continua el mismo foco. Si la app estaba cerrada, un foco en marcha cuenta como mucho hasta su fin.
- **Registros idempotentes y protegidos.** Cada intervalo tiene id `ejecucion-n`; entra en una bandeja de `focus/actual` en la misma escritura que el cambio de fase y despues se crea en `logs` con una transaccion que solo escribe si no existe. Varias pestañas o una recarga producen el mismo id: nunca hay duplicados. Las reglas solo permiten **crear** registros (no modificarlos ni borrarlos) y validan campos, tiempo activo entre 1 min y 4 h, que no supere el lapso inicio-fin y la fecha del servidor.
- **Nada se da por guardado hasta que Firestore lo confirma.** Lo pendiente se ve aparte y no suma. Sin conexion se reintenta solo; un rechazo del servidor se muestra con «Reintentar» o «Descartar». Con cambios sin confirmar, el navegador pide confirmacion al cerrar y «Salir» avisa antes.
- Estado y notas en `progress/{sesionId}` (las notas son texto plano, max. 2000 caracteres; nunca se interpretan como HTML).

Limitaciones conocidas:
- Firestore usa cache en memoria: si se recarga **sin conexion** con cambios sin confirmar, esos cambios se pierden (la app avisa antes). La creacion de registros necesita conexion; se completa al volver.
- Si dos pestañas empiezan focos de sesiones distintas en el mismo instante gana la ultima escritura: se pierde el intervalo en curso de la otra, nunca se duplica.
- Un foco que se deja en marcha sin estar estudiando cuenta hasta su fin (un intervalo como maximo; con una pestaña abierta y objetivo pendiente, hasta cubrir el objetivo). Los registros no se pueden borrar desde la app: es lo que los protege.

## Progreso y reajustes (fase 4)

Navegacion: Hoy, Foco, Calendario, **Progreso** y Plan. **Datos** (importar y copia) pasa a las herramientas de arriba a la derecha para que la capsula siga cabiendo en 360 px.

- **Tres medidas separadas.** *Previsto* = plan con su fecha vigente; *trabajado* = solo foco confirmado por Firestore; *resultado* = lo que el usuario marca de cada objetivo verificable (**Sin ayuda**, **Con ayuda**, **Aun no**; se puede quitar). Ninguna se deduce de otra: el tiempo no completa sesiones ni se llama dominio, y acabar un pomodoro nunca completa nada.
- **Progreso** (`#/progreso`): trabajado frente a previsto (global y por materia), sesiones hechas (solo las marcadas a mano), objetivos sin ayuda y horas por trabajar. *Deficit* = previsto en dias ya pasados (hasta ayer) menos trabajado de la materia (sesiones y foco libre con esa materia). El **riesgo es descriptivo**: «Al dia» (deficit < 30 min), «Deficit X» o «Deficit X · examen en N d» (examen a 7 dias o menos); no diagnostica preparacion ni predice nada. Historico **diario** (columna tenue = previsto, estrecha y solida = trabajado ese dia real; flechas/Inicio/Fin; tabla accesible) y **semanal** (lunes a domingo). El foco libre sin materia suma al total pero a ninguna materia.
- **Dudas** (Progreso y detalle de sesion): materia obligatoria, texto plano de hasta 300 caracteres y estado pendiente → en repaso → resuelta (reabrir). El id lo pone el cliente al guardar: repetir el alta no duplica.
- **Cierre del dia** (`#/cierre/AAAA-MM-DD`, desde la tarjeta de Hoy o el historico): tiempo del dia, resultado de cada objetivo (se guarda al momento en la sesion), lo que queda sin completar con acceso a reprogramarlo, y notas de dificultades y pendiente. Solo dias del periodo ya empezados; un documento por fecha (guardar otra vez lo actualiza). Las cifras no se copian: se calculan siempre.
- **Reprogramar** (tarjeta «Fecha» del detalle de sesion): siempre manual, con dos pulsaciones. Se elige el dia (o uno de los «dias con hueco», que solo rellenan el campo) y se ven sus conflictos:
  - *Bloquean*: dia bloqueado (20-22/10), fuera del periodo, dia pasado, dia del examen de su materia o posterior, maximo explicito superado (27/10 y 03/11: 2 h; 06/11: 4 h) o sesion marcada como completada.
  - *Avisan* (la pregunta de confirmacion los incluye y quedan en la auditoria): superar la carga habitual (5 h entre semana, 6 h en fin de semana) u otro examen ese dia.
  - El plan importado (`sessions`) **no se modifica**: la fecha vigente vive en `reschedules/{sesionId}` (con `rev`) y cada cambio crea un evento `events/{sesionId-rev}` en la misma transaccion. Devolverla a su fecha es otro cambio auditado. Doble clic, otra pestaña o un reintento no duplican; si otra pestaña la movio a otro dia, se avisa sin pisarla. Necesita conexion.
  - Todas las vistas usan la fecha vigente (Hoy, Calendario, Plan, Progreso) y marcan «desde <fecha del plan>».

Limitaciones de la fase 4:
- Mover una sesion con tiempo ya registrado lleva ese tiempo al nuevo dia en el resumen de Hoy (que cuenta el avance de las sesiones previstas ese dia); el historico diario de Progreso usa el dia real del registro.
- Si una reimportacion cambia la fecha de una sesion ya movida, manda la fecha movida (fue una decision explicita).
- Las reglas repiten periodo y dias bloqueados para validar fechas (`tests/schema-rules.test.js` comprueba que coinciden con `src/data/control.js`).

Antes de usarlo con Firebase real hay que **publicar las reglas nuevas** (`firestore.rules`, p. ej. `npx firebase deploy --only firestore:rules`). Con las de la fase 3 la app funciona, pero `events`, `reschedules`, `reviews` y `closings` quedan con acceso generico del propietario: la auditoria se podria editar o borrar y no se validan fechas ni campos. Las nuevas hacen la auditoria de solo creacion, exigen un evento por cada cambio de fecha y validan dudas y cierres. `npm run test:rules` las verifica con el emulador.
