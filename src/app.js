// Composicion de la aplicacion: estado, ruteo por hash y render.
import { Home, Calendar, Logout } from './lib/icons.js';
import { h, icono } from './lib/dom.js';
import { ahoraMadrid, parseISO } from './lib/dates.js';
import { readConfig } from './config.js';
import { ESTADO_INICIAL, reduceAuth } from './services/auth-state.js';
import { createRepository, mensajeErrorFirestore } from './services/firestore-repository.js';
import { vistaConfigPendiente, vistaComprobando, vistaLogin } from './features/auth-views.js';
import { vistaHoy } from './features/today.js';
import { vistaCalendario } from './features/calendar.js';

const RUTAS = { '#/hoy': 'hoy', '#/calendario': 'calendario' };

export async function startApp(root, env) {
  const config = readConfig(env);
  const hoy = ahoraMadrid().fecha;
  const estado = {
    auth: ESTADO_INICIAL,
    ruta: RUTAS[location.hash] ?? 'hoy',
    mes: (({ y, m }) => ({ y, m }))(parseISO(hoy)),
    seleccionado: hoy,
    plans: { status: 'idle', items: [], error: null },
  };
  let servicios = null;
  let repo = null;

  const dispatch = (evento) => { estado.auth = reduceAuth(estado.auth, evento); render(); };

  function cargarPlanes() {
    estado.plans = { status: 'loading', items: [], error: null };
    repo.listPlans().then(
      (items) => { estado.plans = { status: 'ready', items, error: null }; render(); },
      (err) => { estado.plans = { status: 'error', items: [], error: mensajeErrorFirestore(err) }; render(); },
    );
  }

  function navegacion() {
    const enlace = (ruta, texto, icon) => h('a', {
      class: `sf-nav__link${estado.ruta === ruta ? ' is-active' : ''}`,
      href: `#/${ruta}`, 'aria-current': estado.ruta === ruta ? 'page' : null,
    }, icono(icon), h('span', {}, texto));
    return h('header', { class: 'sf-top' },
      h('span', { class: 'sf-brand' }, 'StudyFlow'),
      h('nav', { class: 'sf-nav', 'aria-label': 'Principal' },
        enlace('hoy', 'Hoy', Home), enlace('calendario', 'Calendario', Calendar)),
      h('button', {
        type: 'button', class: 'button button--ghost button--sm sf-logout',
        onClick: () => servicios.authService.logout(),
      }, icono(Logout, { size: 18 }), h('span', {}, 'Cerrar sesión')));
  }

  function contenido() {
    if (estado.ruta === 'calendario') {
      return vistaCalendario({
        mes: estado.mes, seleccionado: estado.seleccionado, hoy,
        onSelect: (iso) => { estado.seleccionado = iso; render(); },
        onMes: (mes) => { estado.mes = mes; render(); },
      });
    }
    return vistaHoy({ ahora: ahoraMadrid(), plans: estado.plans });
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
        cargarPlanes();
      }
      if (!user) { repo = null; estado.plans = { status: 'idle', items: [], error: null }; }
      dispatch({ type: 'SESSION', uid: user ? user.uid : null });
    },
    () => dispatch({ type: 'AUTH_FAILURE', message: 'No se pudo comprobar la sesión. Recarga la página.' }),
  );
}
