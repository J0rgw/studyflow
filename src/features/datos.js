// Vista Datos: importar plan JSON (zona de arrastre + vista previa) y copia de seguridad descargable.
import { Download, Upload, Close, Check, Warning, Trash } from '../lib/icons.js';
import { h, icono } from '../lib/dom.js';
import { formatoMinutos } from '../lib/dates.js';
import { MATERIAS } from '../data/control.js';
import { aEscribir } from '../data/importer.js';
import { barraMarcas, barraProgreso, punto, cargador, aviso } from './ui.js';

function lista(titulo, items, clase) {
  if (!items.length) return null;
  return h('div', { class: 'sf-issues' },
    h('h3', { class: 'sf-label' }, `${titulo} · ${items.length}`),
    h('ul', { class: `sf-issues__list ${clase}` }, items.map((i) =>
      h('li', {}, i.ref && h('strong', {}, `${i.ref}: `), i.mensaje))));
}

// Zona de arrastre unica (referencia Subida). El input va antes para que su foco pinte la zona.
function zona(onArchivo, ocupado) {
  const campo = h('input', {
    type: 'file', accept: 'application/json,.json', id: 'plan-archivo', class: 'sf-file', disabled: ocupado,
    onChange: (e) => { const f = e.target.files[0]; if (f) onArchivo(f); e.target.value = ''; },
  });
  const soltar = (activo) => (e) => { e.preventDefault(); if (!ocupado) z.classList.toggle('is-over', activo); };
  const z = h('label', {
    for: 'plan-archivo', class: `sf-drop${ocupado ? ' is-busy' : ''}`,
    onDragenter: soltar(true), onDragover: soltar(true),
    onDragleave: (e) => { if (!z.contains(e.relatedTarget)) z.classList.remove('is-over'); },
    onDrop: (e) => {
      e.preventDefault(); z.classList.remove('is-over');
      const f = e.dataTransfer && e.dataTransfer.files[0];
      if (f && !ocupado) onArchivo(f);
    },
  },
  h('span', { class: 'sf-drop__icon' }, icono(Upload, { size: 20 })),
  h('span', { class: 'sf-drop__text' }, 'Arrastra el plan o ', h('span', { class: 'sf-drop__link' }, 'elige un JSON')),
  h('span', { class: 'sf-drop__hint' }, 'schemaVersion 1 · máx. 1 MB'));
  return [campo, z];
}

function filaArchivo(imp, onCancelar) {
  const { informe } = imp;
  const guardando = imp.fase === 'guardando';
  const hecho = imp.fase === 'hecho';
  const nErr = informe.errores.length;
  const { hechas, total } = imp.progreso ?? { hechas: 0, total: 0 };
  const estado = guardando ? `Guardando ${hechas} de ${total}`
    : hecho ? `${imp.escritas} ${imp.escritas === 1 ? 'guardada' : 'guardadas'}`
      : informe.ok ? 'Válido' : `${nErr} ${nErr === 1 ? 'error' : 'errores'}`;
  return h('div', { class: `sf-filerow${informe.ok ? '' : ' is-error'}${hecho ? ' is-done' : ''}` },
    h('span', { class: 'sf-filerow__badge', 'aria-hidden': 'true' }, 'JSON'),
    h('div', { class: 'sf-filerow__body' },
      h('p', { class: 'sf-filerow__name' }, imp.nombre),
      h('p', { class: 'sf-filerow__meta' },
        `${informe.resumen.sesiones} sesiones · ${formatoMinutos(informe.resumen.minutosTotal)}`,
        h('span', { class: 'sf-filerow__sep', 'aria-hidden': 'true' }, '/'),
        h('span', { class: 'sf-filerow__state', role: guardando ? 'status' : null },
          !guardando && icono(informe.ok ? Check : Warning, { size: 14 }), estado)),
      guardando && h('div', { class: 'sf-filerow__progress' },
        barraProgreso(total ? hechas / total : 0, 'Guardando sesiones'),
        h('span', { class: 'sf-filerow__pct' }, `${total ? Math.round((hechas / total) * 100) : 0}%`))),
    // Como en la referencia: ✕ mientras se revisa, papelera cuando ya esta guardado.
    !guardando && h('button', {
      type: 'button', class: 'button button--ghost button--icon-only button--sm',
      'aria-label': hecho ? 'Quitar de la lista' : 'Descartar archivo', onClick: onCancelar,
    }, icono(hecho ? Trash : Close, { size: 18 })));
}

function vistaPrevia(imp, { onConfirmar, onCancelar }) {
  const { informe, diff } = imp;
  const nPend = diff ? aEscribir(diff).length : 0;
  const bloqueado = !informe.ok || (diff && diff.conflictos.length > 0);
  const porMateria = MATERIAS.map((m) => ({ materiaId: m.id, minutos: informe.resumen.porMateria[m.id] ?? 0 })).filter((x) => x.minutos > 0);
  return h('div', { class: 'sf-preview' },
    filaArchivo(imp, onCancelar),
    porMateria.length > 0 && h('div', { class: 'sf-preview__mix' },
      barraMarcas(porMateria, informe.resumen.minutosTotal || 1),
      h('ul', { class: 'sf-legend' }, porMateria.map((x) => h('li', {}, punto(x.materiaId),
        `${MATERIAS.find((m) => m.id === x.materiaId).corto} ${formatoMinutos(x.minutos)}`)))),
    lista('Errores', informe.errores, 'is-error'),
    lista('Avisos', informe.avisos, 'is-warn'),
    diff && h('p', { class: 'sf-preview__diff' },
      `${diff.nuevas.length} nuevas · ${diff.modificadas.length} modificadas · ${diff.sinCambios.length} sin cambios · ${diff.ausentes.length} ausentes (se conservan)`),
    diff && diff.conflictos.length > 0 && h('p', { class: 'sf-error', role: 'alert' },
      `Conflicto de id: ${diff.conflictos.map((c) => c.id).join(', ')}`),
    imp.fase !== 'guardando' && h('div', { class: 'sf-actions' },
      h('button', {
        type: 'button', class: 'button button--primary', disabled: bloqueado || nPend === 0,
        onClick: onConfirmar,
      }, icono(Upload), bloqueado ? 'Importar' : nPend === 0 ? 'Nada que importar' : `Importar ${nPend} ${nPend === 1 ? 'sesión' : 'sesiones'}`),
      h('button', { type: 'button', class: 'button button--ghost', onClick: onCancelar }, 'Descartar')));
}

export function vistaDatos({ importacion: imp, datos, onArchivo, onConfirmar, onCancelar, onBackup, backup }) {
  const ocupado = imp.fase === 'leyendo' || imp.fase === 'guardando';
  return h('div', { class: 'sf-page' },
    h('header', { class: 'sf-head' }, h('div', {}, h('p', { class: 'sf-eyebrow' }, 'Plan y copia'), h('h1', {}, 'Datos'))),
    h('div', { class: 'sf-datos' },
      h('section', { class: 'sf-card sf-import', 'aria-labelledby': 'h-imp' },
        h('h2', { id: 'h-imp', class: 'sf-label' }, 'Importar plan'),
        // La zona sigue arriba en todo momento (referencia Subida); la fila del archivo va debajo.
        zona(onArchivo, ocupado),
        imp.fase === 'leyendo' && h('p', { class: 'sf-inline-status' }, cargador('Analizando'), 'Analizando…'),
        imp.fase === 'error' && aviso('No se pudo importar', imp.mensaje),
        (imp.fase === 'analizado' || imp.fase === 'guardando') && vistaPrevia(imp, { onConfirmar, onCancelar }),
        imp.fase === 'hecho' && h('div', { role: 'status' }, filaArchivo(imp, onCancelar)),
        datos.status === 'error' && aviso('No se pudieron leer los datos', datos.error)),
      h('section', { class: 'sf-card sf-backup', 'aria-labelledby': 'h-bk' },
        h('h2', { id: 'h-bk', class: 'sf-label' }, 'Copia'),
        h('p', { class: 'sf-backup__count' },
          h('span', { class: 'sf-num' }, datos.status === 'ready' ? datos.sesiones.length : '—'),
          h('span', { class: 'sf-unit' }, 'sesiones guardadas')),
        h('button', { type: 'button', class: 'button button--secondary', disabled: backup.cargando, onClick: onBackup },
          backup.cargando ? cargador('Preparando copia') : icono(Download), backup.cargando ? 'Preparando…' : 'Descargar JSON'),
        backup.error && aviso('No se pudo descargar', backup.error))));
}
