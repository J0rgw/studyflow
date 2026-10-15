// Vista Datos: importar plan JSON (con vista previa), y copia de seguridad descargable.
import { Download, Upload, Warning, InfoCircle } from '../lib/icons.js';
import { h, icono } from '../lib/dom.js';
import { formatoMinutos } from '../lib/dates.js';
import { MATERIAS } from '../data/control.js';
import { aEscribir } from '../data/importer.js';

function lista(titulo, items, clase) {
  if (!items.length) return null;
  return h('div', { class: 'sf-stack-sm' },
    h('h3', {}, `${titulo} (${items.length})`),
    h('ul', { class: `sf-list sf-issues ${clase}` }, items.map((i) =>
      h('li', {}, i.ref && h('strong', {}, `${i.ref}: `), i.mensaje))));
}

function resumenPlan(resumen) {
  return h('ul', { class: 'sf-list' },
    h('li', {}, `${resumen.sesiones} sesiones, ${formatoMinutos(resumen.minutosTotal)} en total`),
    MATERIAS.map((m) => h('li', {}, `${m.corto}: ${formatoMinutos(resumen.porMateria[m.id] ?? 0)}`)));
}

function vistaPrevia(imp, { onConfirmar, onCancelar }) {
  const { informe, diff } = imp;
  const nPend = diff ? aEscribir(diff).length : 0;
  const bloqueado = !informe.ok || (diff && diff.conflictos.length > 0);
  return h('div', { class: 'sf-stack' },
    h('p', {}, h('strong', {}, imp.nombre)),
    resumenPlan(informe.resumen),
    lista('Errores que bloquean la importación', informe.errores, 'sf-issues--error'),
    lista('Avisos', informe.avisos, 'sf-issues--aviso'),
    diff && h('div', { class: 'sf-stack-sm' },
      h('h3', {}, 'Cambios respecto a lo guardado'),
      h('ul', { class: 'sf-list' },
        h('li', {}, `${diff.nuevas.length} nuevas`),
        h('li', {}, `${diff.modificadas.length} modificadas`),
        h('li', {}, `${diff.sinCambios.length} sin cambios`),
        h('li', {}, `${diff.ausentes.length} guardadas que ya no están en el archivo (se conservan, no se borra nada)`)),
      diff.conflictos.length > 0 && h('p', { class: 'sf-error', role: 'alert' },
        `Conflicto: ${diff.conflictos.length} id(s) ya pertenecen a otro plan (${diff.conflictos.map((c) => c.id).join(', ')}).`)),
    h('div', { class: 'sf-actions' },
      h('button', {
        type: 'button', class: 'button button--primary', disabled: bloqueado || nPend === 0 || imp.fase === 'guardando',
        onClick: onConfirmar,
      }, icono(Upload), nPend === 0 && !bloqueado ? 'Nada que importar' : `Importar ${nPend} sesión(es)`),
      h('button', { type: 'button', class: 'button button--ghost', onClick: onCancelar }, 'Descartar')));
}

export function vistaDatos({ importacion: imp, datos, onArchivo, onConfirmar, onCancelar, onBackup, backup }) {
  const campo = h('input', {
    type: 'file', accept: 'application/json,.json', id: 'plan-archivo', class: 'sf-file',
    onChange: (e) => { const f = e.target.files[0]; if (f) onArchivo(f); e.target.value = ''; },
  });
  return h('div', { class: 'sf-page' },
    h('header', { class: 'sf-page__head' }, h('h1', {}, 'Datos')),
    h('div', { class: 'sf-grid' },
      h('section', { class: 'card sf-span-2', 'aria-labelledby': 'h-imp' },
        h('div', { class: 'card__header' }, h('h2', { id: 'h-imp', class: 'card__title' }, 'Importar plan')),
        h('div', { class: 'card__content sf-stack' },
          h('p', { class: 'sf-muted' },
            'JSON con schemaVersion 1. Se valida contra los datos de control (bloqueos, límites, exámenes, 104 h) y se muestra una vista previa antes de guardar. Reimportar no duplica ni borra progreso.'),
          h('label', { for: 'plan-archivo', class: 'button button--secondary sf-filebtn' }, icono(Upload), 'Elegir archivo JSON'),
          campo,
          imp.fase === 'leyendo' && h('p', { role: 'status' }, 'Analizando archivo…'),
          imp.fase === 'error' && h('p', { class: 'sf-error', role: 'alert' }, imp.mensaje),
          (imp.fase === 'analizado' || imp.fase === 'guardando') && vistaPrevia(imp, { onConfirmar, onCancelar }),
          imp.fase === 'guardando' && h('p', { role: 'status' }, `Guardando… ${imp.progreso.hechas} de ${imp.progreso.total}`),
          imp.fase === 'hecho' && h('div', { class: 'alert alert--success', role: 'status' },
            h('div', { class: 'alert__content' },
              h('p', { class: 'alert__title' }, 'Importación completada'),
              h('p', { class: 'alert__description' }, `${imp.escritas} sesión(es) guardadas en Firestore.`))),
          datos.status === 'error' && h('p', { class: 'sf-error', role: 'alert' }, datos.error))),
      h('section', { class: 'card', 'aria-labelledby': 'h-bk' },
        h('div', { class: 'card__header' }, h('h2', { id: 'h-bk', class: 'card__title' }, 'Copia de seguridad')),
        h('div', { class: 'card__content sf-stack' },
          h('p', { class: 'sf-muted' }, 'Descarga todos tus datos en un JSON. Se genera en el navegador y no se envía a ningún sitio. No lo subas a un repositorio público.'),
          h('button', { type: 'button', class: 'button button--secondary', disabled: backup.cargando, onClick: onBackup },
            icono(Download), backup.cargando ? 'Preparando…' : 'Descargar copia JSON'),
          backup.error && h('p', { class: 'sf-error', role: 'alert' }, backup.error),
          h('p', { class: 'sf-muted' }, h('span', { class: 'sf-inline-icon' }, icono(InfoCircle, { size: 16 })),
            ' La lista de sesiones guardadas se ve en Hoy y Calendario.')))));
}
