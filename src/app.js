// Composicion de la aplicacion: estado, ruteo por hash y render.
import {
  Home, Calendar, Hierarchy, Database, Logout, Sun, Moon,
} from './lib/icons.js';
import { temaEfectivo, alternarTema } from './lib/theme.js';
import { h, icono } from './lib/dom.js';
import { ahoraMadrid, parseISO } from './lib/dates.js';
import { readConfig } from './config.js';
import { ESTADO_INICIAL, reduceAuth } from './services/auth-state.js';
import { createRepository, mensajeErrorFirestore } from './services/firestore-repository.js';
import { vistaConfigPendiente, vistaComprobando, vistaLogin } from './features/auth-views.js';
import { vistaHoy } from './features/today.js';
import { vistaCalendario } from './features/calendar.js';
import { vistaPlan } from './features/plan.js';
import { vistaDatos } from './features/datos.js';
import { logo } from './features/ui.js';
import { analizarTexto, calcularDiff } from './data/importer.js';
import { MATERIAS } from './data/control.js';
import { nombreBackup } from './data/sesiones.js';

const RUTAS = { '#/hoy': 'hoy', '#/calendario': 'calendario', '#/plan': 'plan', '#/datos': 'datos' };
const DESTINOS = [['hoy', 'Hoy', Home], ['calendario', 'Calendario', Calendar], ['plan', 'Plan', Hierarchy], ['datos', 'Datos', Database]];

const DATOS_VACIOS = () => ({ status: 'idle', sesiones: [], error: null });

// Cambio de vista con View Transitions (la capsula activa de la navegacion se desliza).
// Sin soporte o con movimiento reducido, el cambio es inmediato.
function transicion(actualizar) {
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(actualizar);
  } else actualizar();
}

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
    // Calendario: vista mes/agenda y materias visibles (solo en memoria, como en la referencia).
    calVista: 'mes',
    filtro: new Set(MATERIAS.map((m) => m.id)),
  };
  let servicios = null;
  let repo = null;
  let rutaPintada = null;

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
      // La fila del archivo se queda en estado «guardado» (referencia Subida).
      estado.importacion = { fase: 'hecho', escritas: r.escritas, nombre: imp.nombre, informe: imp.informe };
      await cargarDatos();
    } catch (err) {
      estado.importacion = { ...imp, fase: 'error', mensaje: `${mensajeErrorFirestore(err)} Puedes reintentar sin duplicar.` };
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

  // Navegacion (referencia Menu movil): capsula con el destino activo relleno y con etiqueta.
  function navegacion() {
    const enlace = ([ruta, texto, icon]) => {
      const activo = estado.ruta === ruta;
      return h('a', {
        class: `sf-nav__link${activo ? ' is-active' : ''}`, href: `#/${ruta}`, 'aria-current': activo ? 'page' : null,
      },
      activo && h('span', { class: 'sf-nav__pill', 'aria-hidden': 'true' }),
      // Cada contenido tiene nombre propio para que View Transitions anime su recolocacion
      // (en movil el activo gana etiqueta y los demas se desplazan, como en la referencia).
      h('span', { class: 'sf-nav__content', style: `view-transition-name: sf-navc-${ruta}; view-transition-class: sf-navc` },
        icono(icon, { size: 20, weight: activo ? 'Filled' : 'Outline' }),
        // La etiqueta activa va aparte: se apaga antes de moverse y la nueva aparece despues.
        h('span', { class: 'sf-nav__label', style: activo ? 'view-transition-name: sf-nav-label' : null }, texto)));
    };
    const oscuro = temaEfectivo() === 'dark';
    return h('header', { class: 'sf-top' },
      h('a', { class: 'sf-brand', href: '#/hoy' }, logo(), h('span', {}, 'StudyFlow')),
      h('nav', { class: 'sf-nav', 'aria-label': 'Principal' }, DESTINOS.map(enlace)),
      h('div', { class: 'sf-top__tools' },
        h('button', {
          type: 'button', class: 'button button--ghost button--sm button--icon-only sf-tool',
          'aria-label': oscuro ? 'Tema claro' : 'Tema oscuro',
          onClick: () => { alternarTema(); render(); },
        }, icono(oscuro ? Sun : Moon, { size: 18 })),
        h('button', {
          type: 'button', class: 'button button--ghost button--sm button--icon-only sf-tool', 'aria-label': 'Salir',
          onClick: () => servicios.authService.logout(),
        }, icono(Logout, { size: 18 }))));
  }

  function elegirFecha(iso) {
    estado.seleccionado = iso;
    const { y, m } = parseISO(iso);
    estado.mes = { y, m };
    render();
  }

  function contenido() {
    const ahora = ahoraMadrid();
    if (estado.ruta === 'plan') return vistaPlan({ datos: estado.datos, hoy: ahora.fecha });
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
        datos: estado.datos, mes: estado.mes, seleccionado: estado.seleccionado, hoy: ahora.fecha,
        vista: estado.calVista, filtro: estado.filtro,
        onSelect: (iso) => { estado.seleccionado = iso; render(); },
        onMes: (mes) => { estado.mes = mes; render(); },
        onVista: (v) => { estado.calVista = v; render(); },
        onFiltro: (id) => {
          if (estado.filtro.has(id)) estado.filtro.delete(id); else estado.filtro.add(id);
          render();
        },
      });
    }
    return vistaHoy({ ahora, datos: estado.datos, seleccionado: estado.seleccionado, onSelect: elegirFecha });
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
      // La entrada de vista (fade + 8px) solo al cambiar de ruta, no en cada re-render.
      const entra = estado.ruta !== rutaPintada;
      rutaPintada = estado.ruta;
      vista = h('div', { class: 'sf-shell' }, navegacion(),
        h('main', { id: 'contenido', class: entra ? 'is-entering' : null }, contenido()));
    }
    root.replaceChildren(vista);
  }

  window.addEventListener('hashchange', () => {
    estado.ruta = RUTAS[location.hash] ?? 'hoy';
    transicion(() => { render(); window.scrollTo({ top: 0, behavior: 'instant' }); });
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
