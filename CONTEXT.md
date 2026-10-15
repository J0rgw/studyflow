# CONTEXT.md — StudyFlow UCAM

Fecha de contexto: 15/10/2026. Idioma de aplicación y documentación: español (España). Zona horaria: Europe/Madrid.

## 1. Propósito

StudyFlow es una webapp de uso personal, no comercial, para ejecutar el calendario de estudio de cuatro asignaturas de Ingeniería Informática UCAM. Debe responder inmediatamente a: qué toca hoy, qué objetivo de aprendizaje hay, cuánto tiempo se ha previsto, cuánto se ha trabajado realmente y qué viene después. No es una agenda genérica. Prima la utilidad y la legibilidad sobre el número de funciones.

Es un proyecto **independiente** de la práctica final Android del usuario. Aunque utiliza Firebase para almacenar datos, sigue siendo HTML/CSS/JS sin framework y no reutiliza la arquitectura de Android. Una única cuenta precreada, sin alta de usuarios en la aplicación.

## 2. Jerarquía de fuentes

1. `source-plans/Calendario_Maestro_4_Asignaturas_UCAM_Oct-Nov_2026.md` = autoridad para reparto diario, duración y restricciones.
2. Plan final de cada asignatura = autoridad para temas, resultados esperados, técnicas de estudio, ejercicios y materiales.
3. Este CONTEXT.md = requisitos de producto y hechos contrastados, no sustituto de las sesiones originales.

Si faltan archivos, informar qué falta, implementar estructura y demo claramente identificada, y no fabricar un calendario completo. Conservar los archivos originales sin modificarlos. Ante conflictos mostrar informe de discrepancias en `docs/import-audit.md`; no resolver silenciosamente.

## 3. Plan maestro: datos de control verificados en documentación previa

- Periodo: 14/10/2026–08/11/2026 (parciales 07–08/11).
- Total previsto antes de los exámenes: **104 horas efectivas**.
- Álgebra Lineal: **36 horas**, prioridad 1.
- Ingeniería de Requisitos: **25 horas**, prioridad 2.
- Tecnologías Avanzadas de Comunicación (TAC/CCNA): **23 horas**, prioridad 3.
- Aplicaciones para Dispositivos Móviles: **20 horas**, prioridad 4.
- Descanso/bloqueo: 20, 21 y 22/10/2026, **0 horas**.
- 27/10 y 03/11: máximo 2 h efectivas; martes con empresa y clase hasta las 18:00.
- Días laborables normales: 5 h efectivas; fines de semana de preparación: 6 h; viernes 06/11: 4 h.
- Referencias para validación: 23/10 Álgebra 150 min, Requisitos 120 min, TAC 30 min; 27/10 TAC 120 min y ninguna otra asignatura; 06/11 Álgebra 90 min, Requisitos 90 min, TAC 30 min, Móviles 30 min.
- Exámenes 07/11: Ingeniería de Requisitos 09:00–11:00; Álgebra Lineal 11:00–14:00.
- Exámenes 08/11: Móviles 09:00–11:00; TAC 11:00–14:00.
- No inventar la hora de comienzo de bloques de estudio: la fuente solo fija fechas y duraciones. Exámenes sí tienen horas reales.
- Horas de examen nunca se computan como estudio.
- Una referencia de total de horas **no autoriza a completar huecos con sesiones inventadas**. Si las sumas no cuadran, bloquear la importación y señalar la diferencia.

## 4. Enfoque por materia

### Álgebra Lineal
Reinicio de fundamentos matemáticos tras años sin practicarlos; aprender mediante ejercicios con corrección y explicaciones progresivas. Temas trabajados recientemente: dimensiones, tipos de matrices, operaciones, multiplicación y rango; avanzar hacia determinantes, inversa, sistemas y el temario que figure en el plan final. El usuario necesita distinguir «tiempo dedicado» de «ejercicio que ya puede resolver solo». Evitar presumir que un tema está dominado por haberlo leído.

### Ingeniería de Requisitos
Primer parcial 07/11. Temas: introducción, conceptos básicos, procesos, captura (4.1), análisis (4.2), modelado conceptual (4.3), casos de uso (4.4). Comprobar alcance de temas y prácticas. Trabajar conceptos, diagramas, escenarios, include/extend y recuperación activa. Primer recorrido antes del 01/11, luego repasos y simulacros según plan.

### TAC
Primer parcial 08/11; fuente principal Cisco Networking Academy del curso UCAM; correspondencia conocida con CCNA Switching, Routing and Wireless Essentials (SRWE), módulos 1–9, sin asumir exámenes concretos ni bancos externos. VLAN, switching, inter-VLAN, STP y resto de unidades según plan final. Priorizar conceptos, comandos, interpretación y preguntas prácticas.

### Aplicaciones para Dispositivos Móviles
Primer parcial 08/11, test conceptual: Android (Tema 1), Kotlin (Tema 2), Jetpack Compose (Tema 3.1, 3.2, 3.3); 265 diapositivas teóricas conocidas, sin asumir mismo peso de cada una. Mantener **separadas** preparación del examen y tareas/práctica Android, cuyo plazo global registrado en proyecto anterior es 15/12/2026: no inventar otras fechas.

## 5. Experiencia requerida

### Vista Hoy (pantalla inicial)
- Fecha local de Madrid, fecha seleccionable y acceso directo a calendario.
- En primer plano: «Hoy tienes X sesiones / Y h previstas», próximas evaluaciones y avance efectivo.
- Lista por asignatura y orden del plan; cada sesión con título, tema, objetivo verificable, minutos previstos, minutos efectivos, notas y estado.
- CTA «Empezar» abre modo enfoque con la sesión elegida.
- Estados: pendiente, en curso, parcial, completada, pospuesta; completar manualmente también es posible.
- «Cierre del día»: revisión de objetivos, dificultades y trabajo pendiente.

### Calendario
- Mes con navegación, selección de fecha y panel de sesiones; vista semanal opcional posterior.
- Colores fijos y discretos por asignatura, leyenda, eventos de examen, días bloqueados y cargas del día.
- Las sesiones sin hora de inicio son bloques de duración, **no eventos horarios ficticios**.
- Reprogramar sesión mediante edición de fecha y confirmación; prohibido mover en bloqueos o sobrepasar límite sin explicar conflicto.

### Modo enfoque
- Pomodoro 25/5 o 50/10, modo libre configurable y pausa larga.
- Iniciar, pausar, reanudar, finalizar, abandonar; asociar siempre a una sesión si existe.
- Registrar exclusivamente tiempo activo enfocado, no descansos ni tiempo pausado.
- Usar marcas de tiempo reales (Date.now) para mitigar deriva y recuperar tras refresh; sin duplicar minutos.
- La terminación de un pomodoro no equivale a completar automáticamente el objetivo educativo.

### Progreso
- Horas planificadas vs efectivas por materia y global, histórico diario y de semana.
- Conteo de sesiones y resultados verificables; no llamar «dominio» a porcentaje de tiempo.
- Notas de errores y dudas por asignatura, estado pendiente/en repaso/resuelto.
- Indicador de riesgo descriptivo por déficit de tiempo y cercanía de examen, sin diagnosticar preparación real ni falsas predicciones.

### Utilidades opcionales
- Enlaces a recursos por materia; checklist de preparación del examen; exportación JSON; diario breve de errores; revisión manual de pendientes.
- Accesibilidad de teclado, alto contraste en textos, diseño responsive y reduced motion.

## 6. Datos y persistencia

V1 sin backend: `localStorage` con una única capa `storage.js`, versionado (`schemaVersion`) y migraciones simples. Datos separados:
- plan base importado (read-only en uso habitual)
- logs de tiempo
- notas/errores
- estados de sesión
- reprogramaciones explícitas
- preferencias del temporizador

Usar IDs estables; nunca sobreescribir el histórico al reimportar; detectar duplicados; exportar/importar copia completa JSON con validación y vista previa. Si se considera IndexedDB, documentar motivo; no introducir dependencias gratuitas.

## 7. Semilla y faltantes

Los números de este archivo son *invariantes de validación*, no el conjunto completo de sesiones. El plan maestro completo y el último plan específico de Álgebra pueden no estar presentes en el entorno Codex inicialmente. La aplicación debe mostrar datos reales cuando estén disponibles, no simularlos como definitivos. No renderizar el objetivo 104 h como «trabajadas»; representa la planificación.

## 8. Definition of Done

- La web corre localmente con `npm install` / `npm run dev` y genera build estático.
- Vista Hoy carga la fecha real Europe/Madrid y consulta datos del plan.
- Calendario reproduce bloqueos y exámenes exactos.
- Importación JSON detecta incoherencias y no borra progreso.
- Temporizador registra exclusivamente minutos activos sin doble contabilizar tras refresh.
- Se puede cerrar y reabrir navegador sin perder datos.
- Se puede cambiar una sesión de fecha respetando límites o informando conflicto.
- Despliegue estático sin claves ni servicios externos salvo CSS/iconos opcionales.

## 9. Decisiones de despliegue y privacidad (actualización 15/10/2026)

- GitHub Pages sirve el frontend estático. Firestore aloja plan, sesiones, tiempos, notas, repasos y cambios.
- Autenticación Firebase Email/Password: una única cuenta creada manualmente desde consola; StudyFlow muestra SOLO un campo contraseña y botón Entrar, usando internamente un email fijo de esa cuenta. No incluir la contraseña en el repositorio.
- Persistencia `browserLocalPersistence`: mantener sesión al cerrar y abrir navegador, tanto en localhost como GitHub Pages (orígenes distintos). Logout explícito opcional en ajustes.
- Datos privados bajo `users/{UID}/...`; reglas Firestore con UID exacto del único propietario; las reglas no dan acceso a cualquier persona autenticada.
- Nunca subir fuentes personales ni exportaciones de datos reales a repositorio público. Nada de registrar, resetear contraseñas, recuperar usuarios, perfiles, roles o panel de administración.
- No utilizar datos falsos como reales. Importación JSON versionado e idempotente; progreso separado del plan.
- Resiliencia offline: Firestore puede disponer de caché, pero no prometer sincronización ilimitada ni funcionamiento desconectado completo sin implementarlo.
