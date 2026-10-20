// Composicion de la aplicacion: estado, ruteo por hash y render.
import {
  Home, Calendar, Hierarchy, Database, Logout, Sun, Moon, Stopwatch, ChartBar,
} from './lib/icons.js';
import { temaEfectivo, alternarTema } from './lib/theme.js';
import { h, icono } from './lib/dom.js';
import { ahoraMadrid, parseISO } from './lib/dates.js';
import { readConfig } from './config.js';
import { ESTADO_INICIAL, reduceAuth } from './services/auth-state.js';
import { createRepository, mensajeErrorFirestore } from './services/firestore-repository.js';
import { createFocoController } from './services/foco.js';
import { vistaConfigPendiente, vistaComprobando, vistaLogin } from './features/auth-views.js';
import { vistaHoy } from './features/today.js';
import { vistaCalendario } from './features/calendar.js';
import { vistaPlan } from './features/plan.js';
import { vistaDatos } from './features/datos.js';
import { vistaSesion } from './features/sesion.js';
import { vistaFoco, chipFoco, pintarReloj, nombreFase } from './features/focus.js';
import { vistaProgreso } from './features/progress.js';
import { vistaCierre } from './features/cierre.js';
import { logo, aviso } from './features/ui.js';
import { analizarTexto, calcularDiff } from './data/importer.js';
import { MATERIAS } from './data/control.js';
import { nombreBackup } from './data/sesiones.js';
import {
  trabajadoPorSesion, limpiarNota, objetivoSesion, modoSesion, resultadoValido, MAX_NOTA, LIMITES_OBJETIVO,
} from './data/progreso.js';
import { normalizarAjustes } from './data/pomodoro.js';
import { aplicarReprogramaciones, comprobarMovimiento, limpiarMotivo, MAX_MOTIVO } from './data/reprogramacion.js';
import { nuevaDuda, contarDudas } from './data/dudas.js';
import { documentoCierre } from './data/cierre.js';
import { esFechaISO } from './data/validate.js';

// Datos (importar plan y copia) es una herramienta: va en la barra superior, no en la capsula.
const DESTINOS = [['hoy', 'Hoy', Home], ['foco', 'Foco', Stopwatch], ['calendario', 'Calendario', Calendar], ['progreso', 'Progreso', ChartBar], ['plan', 'Plan', Hierarchy]];
const PRINCIPALES = DESTINOS.map(([r]) => r);
const TITULO = 'StudyFlow';

/**
 * #/hoy, #/foco, #/calendario, #/progreso, #/plan, #/datos, #/sesion/<id> y #/cierre/<AAAA-MM-DD>;
 * cualquier otra cosa es Hoy.
 */
export function leerRuta(hash) {
  const m = /^#\/(hoy|calendario|progreso|plan|datos|foco)$/.exec(hash);
  if (m) return { ruta: m[1], param: null };
  const s = /^#\/sesion\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})$/.exec(hash);
  if (s) return { ruta: 'sesion', param: s[1] };
  const c = /^#\/cierre\/(\d{4}-\d{2}-\d{2})$/.exec(hash);
  if (c && esFechaISO(c[1])) return { ruta: 'cierre', param: c[1] };
  return { ruta: 'hoy', param: null };
}

const DATOS_VACIOS = () => ({ status: 'idle', sesiones: [], error: null });
const PROGRESO_VACIO = () => ({ status: 'idle', mapa: new Map(), error: null });
const REGISTROS_VACIOS = () => ({ status: 'idle', lista: [], error: null });
const nuevoId = () => crypto.randomUUID().replace(/-/g, '');

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
  const inicial = leerRuta(location.hash);
  const estado = {
    auth: ESTADO_INICIAL,
    ruta: inicial.ruta,
    param: inicial.param,
    // Destino al que vuelve el detalle de sesion.
    anterior: 'hoy',
    mes: (({ y, m }) => ({ y, m }))(parseISO(inicial.ruta === 'cierre' ? inicial.param : hoy)),
    seleccionado: inicial.ruta === 'cierre' ? inicial.param : hoy,
    datos: DATOS_VACIOS(),
    importacion: { fase: 'idle' },
    backup: { cargando: false, error: null },
    // Calendario: vista mes/agenda y materias visibles (solo en memoria, como en la referencia).
    calVista: 'mes',
    filtro: new Set(MATERIAS.map((m) => m.id)),
    // Fase 3: progreso (estado y notas), registros de foco confirmados y ajustes del temporizador.
    progreso: PROGRESO_VACIO(),
    registros: REGISTROS_VACIOS(),
    ajustesFoco: normalizarAjustes(),
    errorAjustes: null,
    // Escrituras en curso por clave («estado:<id>», «nota:<id>»): solo «ok» tras confirmar Firestore.
    guardado: new Map(),
    borradores: new Map(),
    avisoFoco: null,
    // Materia opcional del foco libre (solo en memoria).
    materiaLibre: null,
    avisoSalir: false,
    // Fase 4: fechas reprogramadas y su auditoria, dudas y cierres del dia (todo en Firestore).
    reprogramaciones: PROGRESO_VACIO(),
    eventos: REGISTROS_VACIOS(),
    dudas: REGISTROS_VACIOS(),
    cierres: PROGRESO_VACIO(),
    filtroDudas: 'pendiente',
    // Borradores en memoria: fecha y motivo de un cambio, dudas a medio escribir y notas del cierre.
    borradoresMover: new Map(),
    borradoresDuda: new Map(),
    borradoresCierre: new Map(),
  };
  let servicios = null;
  let repo = null;
  let foco = null;
  let suscripciones = [];
  let rutaPintada = null;
  let reloj = null;
  let faseAnunciada = null;

  // Region viva fuera de la vista (que se sustituye en cada render) para anunciar cambios de fase.
  const anuncio = h('p', { class: 'sf-sr', 'aria-live': 'polite' });
  document.body.append(anuncio);

  const dispatch = (evento) => { estado.auth = reduceAuth(estado.auth, evento); render(); };

  function cargarDatos() {
    estado.datos = { status: 'loading', sesiones: [], error: null };
    return repo.listSessions().then(
      (mapa) => { estado.datos = { status: 'ready', sesiones: [...mapa].map(([id, d]) => ({ id, ...d })), error: null }; render(); },
      (err) => { estado.datos = { status: 'error', sesiones: [], error: mensajeErrorFirestore(err) }; render(); },
    );
  }

  // Repintado agrupado: el coordinador del foco puede avisar varias veces seguidas.
  let renderPedido = false;
  function pedirRender() {
    if (renderPedido) return;
    renderPedido = true;
    queueMicrotask(() => { renderPedido = false; render(); });
  }

  function alCambiarFoco() {
    const ej = foco?.vista().ejecucion;
    const fase = ej ? `${ej.id}:${nombreFase(ej)}` : null;
    if (faseAnunciada !== null && fase !== faseAnunciada) anuncio.textContent = ej ? nombreFase(ej) : 'Foco terminado';
    faseAnunciada = fase;
    pedirRender();
  }

  function suscribir(fb, uid) {
    repo = createRepository({ db: fb.db, uid });
    cargarDatos();
    estado.progreso = { ...PROGRESO_VACIO(), status: 'loading' };
    estado.registros = { ...REGISTROS_VACIOS(), status: 'loading' };
    suscripciones = [
      repo.escucharProgreso(
        (mapa) => { estado.progreso = { status: 'ready', mapa, error: null }; pedirRender(); },
        (err) => { estado.progreso = { status: 'error', mapa: new Map(), error: mensajeErrorFirestore(err) }; pedirRender(); },
      ),
      repo.escucharRegistros(
        (lista) => { estado.registros = { status: 'ready', lista, error: null }; pedirRender(); },
        (err) => { estado.registros = { status: 'error', lista: [], error: mensajeErrorFirestore(err) }; pedirRender(); },
      ),
      repo.escucharAjustesFoco(
        (a) => { if (a) { estado.ajustesFoco = normalizarAjustes(a); pedirRender(); } },
        (err) => { estado.errorAjustes = mensajeErrorFirestore(err); pedirRender(); },
      ),
      // Fase 4
      ...[
        ['reprogramaciones', 'mapa', repo.escucharReprogramaciones],
        ['eventos', 'lista', repo.escucharEventos],
        ['dudas', 'lista', repo.escucharDudas],
        ['cierres', 'mapa', repo.escucharCierres],
      ].map(([clave, campo, escuchar]) => {
        estado[clave] = { status: 'loading', [campo]: campo === 'mapa' ? new Map() : [], error: null };
        return escuchar(
          (v) => { estado[clave] = { status: 'ready', [campo]: v, error: null }; pedirRender(); },
          (err) => { estado[clave] = { status: 'error', [campo]: campo === 'mapa' ? new Map() : [], error: mensajeErrorFirestore(err) }; pedirRender(); },
        );
      }),
    ];
    foco = createFocoController({ repo, entorno: { online: window, visible: document }, onCambio: alCambiarFoco });
    foco.iniciar();
  }

  function desuscribir() {
    for (const cancelar of suscripciones) cancelar();
    suscripciones = [];
    if (foco) foco.detener();
    foco = null;
    repo = null;
    faseAnunciada = null;
    estado.datos = DATOS_VACIOS();
    estado.importacion = { fase: 'idle' };
    estado.progreso = PROGRESO_VACIO();
    estado.registros = REGISTROS_VACIOS();
    estado.guardado = new Map();
    estado.borradores = new Map();
    estado.avisoSalir = false;
    estado.reprogramaciones = PROGRESO_VACIO();
    estado.eventos = REGISTROS_VACIOS();
    estado.dudas = REGISTROS_VACIOS();
    estado.cierres = PROGRESO_VACIO();
    estado.borradoresMover = new Map();
    estado.borradoresDuda = new Map();
    estado.borradoresCierre = new Map();
  }

  // ---------- Progreso: estado y notas ----------

  // Cada escritura lleva un turno: si se repite antes de confirmar, solo cuenta la ultima.
  const turnos = new Map();
  function guardar(clave, escribir, alConfirmar = () => {}) {
    const turno = (turnos.get(clave) ?? 0) + 1;
    turnos.set(clave, turno);
    const vigente = () => turnos.get(clave) === turno;
    estado.guardado.set(clave, { estado: 'guardando' });
    render();
    // Sin conexion la escritura queda pendiente: tras unos segundos se dice, sin fingir exito.
    const lento = setTimeout(() => { if (vigente()) { estado.guardado.set(clave, { estado: 'guardando', lento: true }); render(); } }, 4000);
    Promise.resolve().then(escribir).then(
      () => { if (vigente()) { estado.guardado.set(clave, { estado: 'ok' }); alConfirmar(); } },
      (err) => { if (vigente()) estado.guardado.set(clave, { estado: 'error', mensaje: mensajeErrorFirestore(err, { guardar: true }) }); },
    ).finally(() => { clearTimeout(lento); if (vigente()) render(); });
  }

  function guardarEstado(s, valor) {
    guardar(`estado:${s.id}`, () => repo.guardarProgreso(s.id, { estado: valor }));
  }

  function guardarNota(s, texto) {
    const nota = limpiarNota(texto);
    if (nota === null) {
      estado.guardado.set(`nota:${s.id}`, { estado: 'error', mensaje: `Máximo ${MAX_NOTA} caracteres.` });
      return render();
    }
    estado.borradores.set(s.id, nota);
    return guardar(`nota:${s.id}`, () => repo.guardarProgreso(s.id, { nota }), () => {
      if (estado.borradores.get(s.id) === nota) estado.borradores.delete(s.id);
    });
  }

  function guardarAjustes(a) {
    estado.ajustesFoco = normalizarAjustes(a);
    estado.errorAjustes = null;
    render();
    Promise.resolve().then(() => repo.guardarAjustesFoco(estado.ajustesFoco))
      .catch((err) => { estado.errorAjustes = mensajeErrorFirestore(err, { guardar: true }); render(); });
  }

  // ---------- Fase 4: resultado, reprogramacion, dudas y cierre ----------

  // Las sesiones con su fecha vigente (la reprogramada si la hay). Mientras no se han leido las
  // reprogramaciones no se muestra ninguna fecha: podria ser la antigua.
  let efectivas = { base: null, mapa: null, sesiones: [] };
  function datosVista() {
    const d = estado.datos;
    if (d.status !== 'ready') return d;
    const r = estado.reprogramaciones;
    if (r.status === 'error') return { status: 'error', sesiones: [], error: r.error };
    if (r.status !== 'ready') return { status: 'loading', sesiones: [], error: null };
    if (efectivas.base !== d.sesiones || efectivas.mapa !== r.mapa) {
      efectivas = { base: d.sesiones, mapa: r.mapa, sesiones: aplicarReprogramaciones(d.sesiones, r.mapa) };
    }
    return { ...d, sesiones: efectivas.sesiones };
  }

  function guardarResultado(s, valor) {
    if (!resultadoValido(valor)) return;
    guardar(`resultado:${s.id}`, () => repo.guardarProgreso(s.id, { resultado: valor }));
  }

  function borradorMover(s, b, { repintar = true } = {}) {
    estado.borradoresMover.set(s.id, b);
    if (repintar) render();
  }

  /**
   * Mueve una sesion tras la segunda pulsacion del usuario. Se vuelve a comprobar con los datos
   * de ese instante (otra pestaña pudo cambiar el dia) y la transaccion parte de la revision vista.
   */
  function moverSesion(s, { destino, motivo, avisos }) {
    const clave = `mover:${s.id}`;
    const m = limpiarMotivo(motivo);
    if (m === null) { estado.guardado.set(clave, { estado: 'error', mensaje: `Motivo de ${MAX_MOTIVO} caracteres como máximo.` }); render(); return; }
    const c = comprobarMovimiento({
      sesion: s, destino, sesiones: datosVista().sesiones, hoy: ahoraMadrid().fecha, estado: estado.progreso.mapa.get(s.id)?.estado ?? null,
    });
    if (!c.ok) { estado.guardado.set(clave, { estado: 'error', mensaje: c.bloqueos[0].mensaje }); render(); return; }
    // Un aviso que no estaba en la pregunta confirmada obliga a confirmar de nuevo.
    const nuevos = c.avisos.filter((a) => !avisos.includes(a.codigo));
    if (nuevos.length > 0) { estado.guardado.set(clave, { estado: 'error', mensaje: `${nuevos[0].mensaje} Confírmalo de nuevo.` }); render(); return; }
    const actual = estado.reprogramaciones.mapa.get(s.id);
    guardar(clave, () => repo.reprogramar({
      sesionId: s.id, revBase: Number.isInteger(actual?.rev) ? actual.rev : 0, hasta: destino,
      fechaPlan: s.fechaPlan ?? s.fecha, minutos: s.minutos, motivo: m, avisos: c.avisos.map((a) => a.codigo),
    }), () => estado.borradoresMover.delete(s.id));
  }

  function borradorDuda(clave, b, { repintar = true } = {}) {
    estado.borradoresDuda.set(clave, b);
    if (repintar) render();
  }

  function anadirDuda(clave, { materiaId, sesionId, texto }) {
    const g = `duda-nueva:${clave}`;
    const r = nuevaDuda({ materiaId, sesionId, texto, fecha: ahoraMadrid().fecha });
    if (r.error) { estado.guardado.set(g, { estado: 'error', mensaje: r.error }); render(); return; }
    // El id se fija en el borrador: repetir el alta (reintento, doble envio) reescribe el mismo documento.
    const borrador = estado.borradoresDuda.get(clave) ?? {};
    const id = borrador.id ?? nuevoId();
    estado.borradoresDuda.set(clave, { ...borrador, id, texto });
    guardar(g, () => repo.guardarDuda(id, r.doc), () => {
      const b = estado.borradoresDuda.get(clave);
      if (b?.id === id) estado.borradoresDuda.set(clave, { materiaId: b.materiaId });
    });
  }

  function estadoDuda(d, valor) { guardar(`duda:${d.id}`, () => repo.cambiarEstadoDuda(d.id, valor)); }

  function borrarDuda(d) { guardar(`duda:${d.id}`, () => repo.borrarDuda(d.id)); }

  function borradorCierre(fecha, b) { estado.borradoresCierre.set(fecha, b); }

  function guardarCierre(fecha, textos) {
    const clave = `cierre:${fecha}`;
    const r = documentoCierre(fecha, textos);
    if (r.error) { estado.guardado.set(clave, { estado: 'error', mensaje: r.error }); render(); return; }
    estado.borradoresCierre.set(fecha, textos);
    guardar(clave, () => repo.guardarCierre(r.doc), () => {
      const b = estado.borradoresCierre.get(fecha);
      if (b && b.dificultades === textos.dificultades && b.pendiente === textos.pendiente) estado.borradoresCierre.delete(fecha);
    });
  }

  function contextoDudas() {
    return {
      dudas: estado.dudas, guardado: estado.guardado, borradores: estado.borradoresDuda,
      onBorrador: borradorDuda, onAnadir: anadirDuda, onEstado: estadoDuda, onBorrar: borrarDuda,
    };
  }

  // ---------- Foco ----------

  /**
   * Modo y objetivo de una sesion: su modo propio o el general, y el objetivo querido (por defecto
   * lo previsto) menos lo trabajado, contando tambien lo que aun se esta guardando.
   */
  function focoSesion(s) {
    const prog = estado.progreso.mapa.get(s.id);
    const confirmado = trabajadoPorSesion(estado.registros.lista).get(s.id) ?? 0;
    const enCola = (foco?.vista().pendientes ?? []).filter((p) => p.datos.sesionId === s.id).reduce((t, p) => t + p.datos.focoMs, 0);
    return {
      modo: modoSesion(prog, estado.ajustesFoco.modo),
      objetivo: objetivoSesion(s, { objetivoMin: prog?.focoObjetivoMin, trabajadoMs: confirmado + enCola }),
    };
  }

  function abrirFoco(r) {
    if (!r.ok) { estado.avisoFoco = r.mensaje; render(); return; }
    estado.avisoFoco = null;
    if (location.hash === '#/foco') render(); else location.hash = '#/foco';
  }

  // Desde una sesion: arranca al instante con su modo y pomodoros hasta cubrir lo que falta.
  function empezarFoco(s) {
    const { modo, objetivo } = focoSesion(s);
    abrirFoco(foco.empezar({ sesion: s, ajustes: { ...estado.ajustesFoco, modo }, objetivoMs: objetivo.restanteMs }));
  }

  function empezarLibre() {
    abrirFoco(foco.empezar({ materiaId: estado.materiaLibre, ajustes: estado.ajustesFoco }));
  }

  function accionFoco(tipo) {
    const ej = foco.vista().ejecucion;
    if (!foco.accion(tipo)) return;
    // Al terminar una sesion se vuelve a su detalle: el usuario decide si el objetivo esta cumplido.
    // Un foco libre se queda en Foco.
    if ((tipo === 'finalizar' || tipo === 'descartar') && ej?.sesionId) location.hash = `#/sesion/${ej.sesionId}`;
  }

  function guardarFocoSesion(s, campos) {
    guardar(`foco:${s.id}`, () => repo.guardarProgreso(s.id, campos));
  }

  function guardarObjetivo(s, min) {
    const [lo, hi] = LIMITES_OBJETIVO;
    if (!Number.isInteger(min) || min < lo || min > hi) {
      estado.guardado.set(`foco:${s.id}`, { estado: 'error', mensaje: `Objetivo entre ${lo} y ${hi} min.` });
      render();
      return;
    }
    guardarFocoSesion(s, { focoObjetivoMin: min });
  }

  /** Digitos del foco (vista y barra) cada 250 ms, sin repintar. Solo con un foco activo. */
  function asegurarReloj() {
    const hay = Boolean(foco?.vista().ejecucion);
    if (hay && reloj == null) reloj = setInterval(() => pintarReloj(root, foco?.vista()), 250);
    if (!hay && reloj != null) { clearInterval(reloj); reloj = null; }
    if (!hay && document.title !== TITULO) document.title = TITULO;
  }

  const haySinGuardar = () => Boolean(foco?.hayCambiosSinGuardar())
    || [...estado.guardado.values()].some((g) => g.estado === 'guardando');

  // ---------- Datos (fase 2) ----------

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

  // ---------- Vistas ----------

  function salir() {
    // Con minutos o cambios aun sin confirmar, la primera pulsacion solo avisa.
    if (haySinGuardar() && !estado.avisoSalir) { estado.avisoSalir = true; render(); return; }
    estado.avisoSalir = false;
    servicios.authService.logout();
  }

  // Navegacion (referencia Menu movil): capsula con el destino activo relleno y con etiqueta.
  function navegacion() {
    // Detalle de sesion y cierre del dia cuelgan de Hoy en la navegacion; Datos, de las herramientas.
    const seccion = PRINCIPALES.includes(estado.ruta) ? estado.ruta : (estado.ruta === 'datos' ? null : 'hoy');
    const enlace = ([ruta, texto, icon]) => {
      const activo = seccion === ruta;
      return h('a', {
        class: `sf-nav__link${activo ? ' is-active' : ''}`, href: `#/${ruta}`,
        'aria-current': activo ? (estado.ruta === ruta ? 'page' : 'true') : null,
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
    const enDatos = estado.ruta === 'datos';
    return h('header', { class: 'sf-top' },
      h('a', { class: 'sf-brand', href: '#/hoy' }, logo(), h('span', {}, 'StudyFlow')),
      h('nav', { class: 'sf-nav', 'aria-label': 'Principal' }, DESTINOS.map(enlace)),
      h('div', { class: 'sf-top__tools' },
        estado.ruta !== 'foco' && chipFoco(foco?.vista()),
        h('a', {
          class: `button button--ghost button--sm button--icon-only sf-tool${enDatos ? ' is-active' : ''}`, href: '#/datos',
          'aria-label': 'Datos: importar plan y copia', 'aria-current': enDatos ? 'page' : null,
        }, icono(Database, { size: 18, weight: enDatos ? 'Filled' : 'Outline' })),
        h('button', {
          type: 'button', class: 'button button--ghost button--sm button--icon-only sf-tool',
          'aria-label': oscuro ? 'Tema claro' : 'Tema oscuro',
          onClick: () => { alternarTema(); render(); },
        }, icono(oscuro ? Sun : Moon, { size: 18 })),
        h('button', {
          id: 'sf-salir', type: 'button', class: 'button button--ghost button--sm button--icon-only sf-tool', 'aria-label': 'Salir',
          onClick: salir,
        }, icono(Logout, { size: 18 }))));
  }

  function elegirFecha(iso) {
    estado.seleccionado = iso;
    const { y, m } = parseISO(iso);
    estado.mes = { y, m };
    render();
  }

  function contextoProgreso() {
    return {
      mapa: estado.progreso.mapa,
      progresoListo: estado.progreso.status === 'ready',
      errorProgreso: estado.progreso.error,
      registros: estado.registros.lista,
      porSesion: trabajadoPorSesion(estado.registros.lista),
      registrosListos: estado.registros.status === 'ready',
      errorRegistros: estado.registros.error,
    };
  }

  function contenido() {
    const ahora = ahoraMadrid();
    const progreso = contextoProgreso();
    const vistaFocoActual = foco?.vista() ?? null;
    // Todas las vistas ven las sesiones con su fecha vigente; la importacion compara con el plan.
    const datos = datosVista();
    if (estado.ruta === 'plan') return vistaPlan({ datos, hoy: ahora.fecha });
    if (estado.ruta === 'progreso') {
      return vistaProgreso({
        datos, progreso, hoy: ahora.fecha, cierres: estado.cierres.mapa, dudasCtx: contextoDudas(),
        filtroDudas: estado.filtroDudas, onFiltroDudas: (f) => { estado.filtroDudas = f; render(); },
      });
    }
    if (estado.ruta === 'cierre') {
      return vistaCierre({
        fecha: estado.param, hoy: ahora.fecha, datos, progreso, foco: vistaFocoActual, cierres: estado.cierres,
        guardado: estado.guardado, borrador: estado.borradoresCierre.get(estado.param),
        dudasPendientes: contarDudas(estado.dudas.lista).pendiente,
        onResultado: guardarResultado, onBorrador: borradorCierre, onGuardar: guardarCierre,
      });
    }
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
        datos, mes: estado.mes, seleccionado: estado.seleccionado, hoy: ahora.fecha,
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
    if (estado.ruta === 'sesion') {
      return vistaSesion({
        sesionId: estado.param, volver: estado.anterior, datos, progreso, foco: vistaFocoActual, hoy: ahora.fecha,
        ajustes: estado.ajustesFoco, errorAjustes: estado.errorAjustes, guardado: estado.guardado,
        borrador: estado.borradores.get(estado.param),
        focoSesion, onModoSesion: (s, m) => guardarFocoSesion(s, { focoModo: m }), onObjetivo: guardarObjetivo,
        onAjustes: guardarAjustes, onEmpezar: empezarFoco, onEstado: guardarEstado, onNota: guardarNota,
        onBorrador: (s, texto) => { estado.borradores.set(s.id, texto); },
        onReintentar: () => foco?.reintentar(), onDescartarPendiente: (id) => foco?.descartarPendiente(id),
        onResultado: guardarResultado,
        eventos: estado.eventos.lista, borradorMover: estado.borradoresMover.get(estado.param),
        onBorradorMover: borradorMover, onMover: moverSesion,
        dudasCtx: contextoDudas(),
      });
    }
    if (estado.ruta === 'foco') {
      return vistaFoco({
        foco: vistaFocoActual, datos, progreso, onAccion: accionFoco,
        ajustes: estado.ajustesFoco, materiaLibre: estado.materiaLibre, errorAjustes: estado.errorAjustes,
        onMateria: (id) => { estado.materiaLibre = id; render(); }, onAjustes: guardarAjustes, onEmpezarLibre: empezarLibre,
        onReintentar: () => foco?.reintentar(), onDescartar: (id) => foco?.descartarPendiente(id),
        reloj: () => foco?.vista().ahora ?? Date.now(),
      });
    }
    return vistaHoy({
      ahora, datos, seleccionado: estado.seleccionado, onSelect: elegirFecha,
      progreso, foco: vistaFocoActual, onEmpezar: empezarFoco, aviso: estado.avisoFoco, cierres: estado.cierres.mapa,
    });
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
      const clave = `${estado.ruta}/${estado.param ?? ''}`;
      const entra = clave !== rutaPintada;
      rutaPintada = clave;
      vista = h('div', { class: 'sf-shell' }, navegacion(),
        h('main', { id: 'contenido', class: entra ? 'is-entering' : null },
          estado.avisoSalir && aviso('Hay cambios sin guardar', 'Firestore aún no los ha confirmado. Pulsa Salir otra vez para salir igualmente.', 'warning'),
          contenido()));
    }
    // El render sustituye el DOM: se devuelve el foco del teclado (y el cursor) al mismo control.
    const previo = document.activeElement;
    const idPrevio = previo && previo !== document.body && root.contains(previo) ? previo.id : '';
    let seleccion = null;
    try { if (idPrevio && typeof previo.selectionStart === 'number') seleccion = [previo.selectionStart, previo.selectionEnd]; } catch { /* sin seleccion */ }
    root.replaceChildren(vista);
    if (idPrevio) {
      const nuevo = document.getElementById(idPrevio);
      if (nuevo && nuevo !== previo && !nuevo.disabled) {
        nuevo.focus({ preventScroll: true });
        if (seleccion) try { nuevo.setSelectionRange(...seleccion); } catch { /* campo sin seleccion */ }
      }
    }
    asegurarReloj();
    if (foco?.vista().ejecucion) pintarReloj(root, foco.vista());
  }

  window.addEventListener('hashchange', () => {
    const { ruta, param } = leerRuta(location.hash);
    if (PRINCIPALES.includes(estado.ruta)) estado.anterior = estado.ruta;
    estado.ruta = ruta;
    estado.param = param;
    // El cierre de un dia deja ese dia elegido en Hoy y Calendario al volver.
    if (ruta === 'cierre') { estado.seleccionado = param; estado.mes = (({ y, m }) => ({ y, m }))(parseISO(param)); }
    estado.avisoSalir = false;
    estado.avisoFoco = null;
    transicion(() => { render(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  });

  // Cerrar o recargar con minutos o cambios aun sin confirmar: el navegador pide confirmacion.
  window.addEventListener('beforeunload', (e) => {
    if (haySinGuardar()) { e.preventDefault(); e.returnValue = ''; }
  });

  if (!config.configured) { dispatch({ type: 'CONFIG_MISSING' }); return; }

  render();
  const { initFirebase } = await import('./services/firebase.js');
  const fb = initFirebase(config);
  servicios = fb;
  fb.authService.subscribe(
    (user) => {
      if (user && estado.auth.uid !== user.uid) { desuscribir(); suscribir(fb, user.uid); }
      if (!user) desuscribir();
      dispatch({ type: 'SESSION', uid: user ? user.uid : null });
    },
    () => dispatch({ type: 'AUTH_FAILURE', message: 'No se pudo comprobar la sesión. Recarga la página.' }),
  );
}
