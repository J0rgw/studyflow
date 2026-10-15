// Composicion de la aplicacion: estado, ruteo por hash y render.
import { Home, Calendar, Database, Logout } from './lib/icons.js';
import { h, icono } from './lib/dom.js';
import { ahoraMadrid, parseISO } from './lib/dates.js';
import { readConfig } from './config.js';
import { ESTADO_INICIAL, reduceAuth } from './services/auth-state.js';
import { createRepository, mensajeErrorFirestore } from './services/firestore-repository.js';
import { vistaConfigPendiente, vistaComprobando, vistaLogin } from './features/auth-views.js';
import { vistaHoy } from './features/today.js';
import { vistaCalendario } from './features/calendar.js';
import { vistaDatos } from './features/datos.js';
import { analizarTexto, calcularDiff } from './data/importer.js';
import { nombreBackup } from './data/sesiones.js';

const RUTAS = { '#/hoy': 'hoy', '#/calendario': 'calendario', '#/datos': 'datos' };

const DATOS_VACIOS = () => ({ status: 'idle', sesiones: [], error: null });

export async function startApp(root, env) {
  const config = readConfig(env);
  const hoy = ahoraMadrid().fecha;
  const estado = {
    auth: ESTADO_INICIAL,
    ruta: RUTAS[location.hash] ?? 'hoy',
    mes: (({ y, m }) => ({ y, m }))(parseISO(hoy)),
    seleccionado: hoy,
    datos: DATOS_VACIOS(),
    importacion: { fase: 'idle' },
    backup: { cargando: false, error: null },
  };
  let servicios = null;
  let repo = null;

  const dispatch = (evento) => { estado.auth = reduceAuth(estado.auth, evento); render(); };

  function cargarDatos() {
    estado.datos = { status: 'loading', sesiones: [], error: null };
    return repo.listSessions().then(
      (mapa) => { estado.datos = { status: 'ready', sesiones: [...mapa].map(([id, d]) => ({ id, ...d })), error: null }; render(); },
      (err) => { estado.datos = { status: 'error', sesiones: [], error: mensajeErrorFirestore(err) }; render(); },
    );
  }

  async function analizarArchivo(archivo) {
    estado.importacion = { fase: 'leyendo' }; render();
    try {
      const analisis = analizarTexto(await archivo.text());
      if (!analisis.ok) { estado.importacion = { fase: 'error', mensaje: analisis.mensaje }; return render(); }
      const { resultado } = analisis;
      // Se compara siempre con lo guardado ahora mismo, no con una copia antigua.
      const existentes = resultado.ok ? await repo.listSessions() : null;
      estado.importacion = {
        fase: 'analizado', nombre: archivo.name, informe: resultado,
        diff: resultado.ok ? calcularDiff(resultado.plan, existentes) : null,
      };
    } catch (err) {
      estado.importacion = { fase: 'error', mensaje: mensajeErrorFirestore(err) };
    }
    render();
  }

  async function confirmarImportacion() {
    const imp = estado.importacion;
    if (imp.fase !== 'analizado' || !imp.informe.ok) return;
    estado.importacion = { ...imp, fase: 'guardando', progreso: { hechas: 0, total: 0 } }; render();
    try {
      const r = await repo.importPlan(imp.informe.plan, imp.diff, (hechas, total) => {
        estado.importacion.progreso = { hechas, total }; render();
      });
      estado.importacion = { fase: 'hecho', escritas: r.escritas };
      await cargarDatos();
    } catch (err) {
      estado.importacion = { ...imp, fase: 'error', mensaje: `${mensajeErrorFirestore(err)} Es seguro repetir la importación: no se duplicará nada.` };
    }
    render();
  }

  async function descargarBackup() {
    estado.backup = { cargando: true, error: null }; render();
    try {
      const copia = await repo.exportAll();
      const url = URL.createObjectURL(new Blob([JSON.stringify(copia, null, 2)], { type: 'application/json' }));
      const a = h('a', { href: url, download: nombreBackup(ahoraMadrid().fecha) });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      estado.backup = { cargando: false, error: null };
    } catch (err) {
      estado.backup = { cargando: false, error: mensajeErrorFirestore(err) };
    }
    render();
  }

  function navegacion() {
    const enlace = (ruta, texto, icon) => h('a', {
      class: `sf-nav__link${estado.ruta === ruta ? ' is-active' : ''}`,
      href: `#/${ruta}`, 'aria-current': estado.ruta === ruta ? 'page' : null,
    }, icono(icon), h('span', {}, texto));
    return h('header', { class: 'sf-top' },
      h('span', { class: 'sf-brand' }, 'StudyFlow'),
      h('nav', { class: 'sf-nav', 'aria-label': 'Principal' },
        enlace('hoy', 'Hoy', Home), enlace('calendario', 'Calendario', Calendar), enlace('datos', 'Datos', Database)),
      h('button', {
        type: 'button', class: 'button button--ghost button--sm sf-logout',
        onClick: () => servicios.authService.logout(),
      }, icono(Logout, { size: 18 }), h('span', {}, 'Cerrar sesión')));
  }

  function contenido() {
    if (estado.ruta === 'datos') {
      return vistaDatos({
        importacion: estado.importacion, datos: estado.datos, backup: estado.backup,
        onArchivo: analizarArchivo, onConfirmar: confirmarImportacion,
        onCancelar: () => { estado.importacion = { fase: 'idle' }; render(); },
        onBackup: descargarBackup,
      });
    }
    if (estado.ruta === 'calendario') {
      return vistaCalendario({
        datos: estado.datos, mes: estado.mes, seleccionado: estado.seleccionado, hoy,
        onSelect: (iso) => { estado.seleccionado = iso; render(); },
        onMes: (mes) => { estado.mes = mes; render(); },
      });
    }
    return vistaHoy({ ahora: ahoraMadrid(), datos: estado.datos });
  }

  function render() {
    const { status } = estado.auth;
    let vista;
    if (status === 'unconfigured') vista = vistaConfigPendiente(config.missing);
    else if (status === 'checking') vista = vistaComprobando();
    else if (status === 'signed-out' || status === 'signing-in') {
      vista = vistaLogin(estado.auth, {
        onLogin: async (password) => {
          dispatch({ type: 'LOGIN_START' });
          const r = await servicios.authService.login(password);
          if (!r.ok) dispatch({ type: 'LOGIN_ERROR', message: r.message });
        },
      });
    } else {
      vista = h('div', { class: 'sf-shell' }, navegacion(), h('main', { id: 'contenido' }, contenido()));
    }
    root.replaceChildren(vista);
  }

  window.addEventListener('hashchange', () => {
    estado.ruta = RUTAS[location.hash] ?? 'hoy';
    render();
  });

  if (!config.configured) { dispatch({ type: 'CONFIG_MISSING' }); return; }

  render();
  const { initFirebase } = await import('./services/firebase.js');
  const fb = initFirebase(config);
  servicios = fb;
  fb.authService.subscribe(
    (user) => {
      if (user && estado.auth.uid !== user.uid) {
        repo = createRepository({ db: fb.db, uid: user.uid });
        cargarDatos();
      }
      if (!user) { repo = null; estado.datos = DATOS_VACIOS(); estado.importacion = { fase: 'idle' }; }
      dispatch({ type: 'SESSION', uid: user ? user.uid : null });
    },
    () => dispatch({ type: 'AUTH_FAILURE', message: 'No se pudo comprobar la sesión. Recarga la página.' }),
  );
}
