# Configurar Firebase para StudyFlow

1. Crear proyecto en [Firebase Console](https://console.firebase.google.com/).
2. Habilitar **Authentication → Sign-in method → Email/Password**.
3. En **Authentication → Users** crear **manualmente un único usuario** con un email que controles y la contraseña privada elegida. NO copiar la contraseña al proyecto. Anotar el UID de ese usuario.
4. Crear **Cloud Firestore** y seleccionar región. Aplicar `firestore.rules` tras sustituir `REEMPLAZAR_UID_PROPIETARIO` por el UID exacto, y comprobar que no quedan rutas con reglas permisivas.
5. Registrar aplicación Web y copiar configuración cliente Firebase en `.env.local` para local y variables de build de GitHub Actions si se despliega desde CI. Esta configuración cliente es pública; el email fijo de login también puede serlo. Nunca usar credenciales de cuenta de servicio en web.
6. Configurar authorized domains de Firebase Authentication para localhost y dominio de Pages correspondiente. Revisar políticas actuales de proyectos nuevos sobre localhost.
7. Configurar `base` Vite para URL GitHub Pages, pipeline que publique `dist/`. No subir `.env.local`, `.firebase/` con tokens privados ni datos reales.
8. Comprobar: primer login con SOLO campo contraseña, recarga, cerrar/abrir navegador, login en otro origen (requiere primer acceso por separado), logout, usuario ajeno denegado, reimportación idempotente.

**Nota:** crear un único formulario no impide a un atacante intentar registrar usuarios contra una API pública. Las reglas con UID propietario impiden acceso a sus datos incluso si otras cuentas llegaran a existir. Consultar también opciones de protección de abuso de Firebase según necesidades futuras. No incluir un registro de cuentas en la web.
