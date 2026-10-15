import { Lock, Warning, Key } from '../lib/icons.js';
import { h, icono } from '../lib/dom.js';

export function vistaConfigPendiente(missing) {
  return h('main', { class: 'sf-center' },
    h('section', { class: 'card sf-panel', 'aria-labelledby': 'cfg-titulo' },
      h('div', { class: 'card__header' },
        h('span', { class: 'sf-badge' }, icono(Key)),
        h('h1', { id: 'cfg-titulo', class: 'card__title' }, 'StudyFlow'),
      ),
      h('div', { class: 'card__content sf-stack' },
        h('div', { class: 'alert alert--warning', role: 'status' },
          h('div', { class: 'alert__indicator' }, icono(Warning)),
          h('div', { class: 'alert__content' },
            h('p', { class: 'alert__title' }, 'Configuración de Firebase pendiente'),
            h('p', { class: 'alert__description' },
              'La web está desplegada, pero aún no tiene los datos de conexión. No se muestra ningún dato privado hasta configurarla.'),
          ),
        ),
        h('p', {}, 'Variables que faltan o conservan el marcador de ejemplo:'),
        h('ul', { class: 'sf-code-list' }, missing.map((m) => h('li', {}, h('code', {}, m)))),
        h('p', { class: 'sf-muted' },
          'Rellénalas en ', h('code', {}, '.env.local'), ' (local) o como variables del repositorio (Pages). Pasos en ',
          h('code', {}, 'docs/firebase-setup.md'), '.'),
      ),
    ),
  );
}

export function vistaComprobando() {
  return h('main', { class: 'sf-center' },
    h('p', { class: 'sf-muted', role: 'status' }, 'Comprobando sesión…'),
  );
}

export function vistaLogin(state, { onLogin }) {
  const cargando = state.status === 'signing-in';
  const campo = h('input', {
    id: 'password', class: 'input input--full-width', type: 'password', name: 'password',
    autocomplete: 'current-password', required: true, disabled: cargando,
    'aria-describedby': state.error ? 'login-error' : null,
    'aria-invalid': state.error ? 'true' : null,
  });
  const form = h('form', {
    class: 'sf-stack', novalidate: true,
    onSubmit: (e) => {
      e.preventDefault();
      const valor = campo.value;
      campo.value = '';
      onLogin(valor);
    },
  },
    h('div', { class: 'sf-field' },
      h('label', { class: 'label', for: 'password' }, 'Contraseña'),
      campo,
    ),
    state.error && h('p', { id: 'login-error', class: 'sf-error', role: 'alert' }, state.error),
    h('button', { class: 'button button--primary button--full-width', type: 'submit', disabled: cargando },
      cargando ? 'Entrando…' : 'Entrar'),
  );
  queueMicrotask(() => { if (!cargando) campo.focus(); });
  return h('main', { class: 'sf-center' },
    h('section', { class: 'card sf-panel', 'aria-labelledby': 'login-titulo' },
      h('div', { class: 'card__header' },
        h('span', { class: 'sf-badge' }, icono(Lock)),
        h('h1', { id: 'login-titulo', class: 'card__title' }, 'StudyFlow'),
      ),
      h('div', { class: 'card__content' }, form),
    ),
  );
}
