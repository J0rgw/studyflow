import { Warning, Eye, EyeOff } from '../lib/icons.js';
import { h, icono } from '../lib/dom.js';
import { logo, cargador } from './ui.js';

function marcaGrande() {
  return h('div', { class: 'sf-auth__brand' }, logo(), h('span', {}, 'StudyFlow'));
}

export function vistaConfigPendiente(missing) {
  return h('main', { class: 'sf-center' },
    h('section', { class: 'sf-card sf-auth', 'aria-labelledby': 'cfg-titulo' },
      marcaGrande(),
      h('h1', { id: 'cfg-titulo', class: 'sf-auth__title' }, 'Falta configurar Firebase'),
      h('div', { class: 'alert alert--warning sf-alert', role: 'status' },
        h('div', { class: 'alert__indicator' }, icono(Warning)),
        h('div', { class: 'alert__content' },
          h('p', { class: 'alert__title' }, 'Variables pendientes'),
          h('ul', { class: 'sf-code-list' }, missing.map((m) => h('li', {}, h('code', {}, m)))))),
      h('p', { class: 'sf-muted' }, h('code', {}, 'docs/firebase-setup.md'))));
}

export function vistaComprobando() {
  return h('main', { class: 'sf-center' },
    h('div', { class: 'sf-checking' }, cargador('Comprobando sesión'), h('p', { class: 'sf-muted' }, 'Comprobando sesión…')));
}

export function vistaLogin(state, { onLogin }) {
  const cargando = state.status === 'signing-in';
  const campo = h('input', {
    id: 'password', class: 'input input--full-width', type: 'password', name: 'password',
    autocomplete: 'current-password', required: true, disabled: cargando,
    'aria-describedby': state.error ? 'login-error' : null,
    'aria-invalid': state.error ? 'true' : null,
  });
  const boton = h('button', {
    class: 'sf-reveal', type: 'button', 'aria-label': 'Mostrar contraseña', 'aria-pressed': 'false', disabled: cargando,
    onClick: () => {
      const visible = campo.type === 'password';
      campo.type = visible ? 'text' : 'password';
      boton.setAttribute('aria-pressed', String(visible));
      boton.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
      boton.replaceChildren(icono(visible ? EyeOff : Eye));
      campo.focus();
    },
  }, icono(Eye));
  const form = h('form', {
    class: 'sf-auth__form', novalidate: true,
    onSubmit: (e) => {
      e.preventDefault();
      const valor = campo.value;
      campo.value = '';
      onLogin(valor);
    },
  },
  h('div', { class: 'sf-field' },
    h('label', { class: 'label', for: 'password' }, 'Contraseña'),
    h('div', { class: 'sf-password' }, campo, boton)),
  state.error && h('p', { id: 'login-error', class: 'sf-error', role: 'alert' }, state.error),
  h('button', { class: 'button button--primary button--full-width sf-auth__submit', type: 'submit', disabled: cargando },
    cargando && cargador('Entrando'), cargando ? 'Entrando…' : 'Entrar'));
  queueMicrotask(() => { if (!cargando) campo.focus(); });
  return h('main', { class: 'sf-center' },
    h('section', { class: 'sf-card sf-auth', 'aria-labelledby': 'login-titulo' },
      marcaGrande(),
      h('h1', { id: 'login-titulo', class: 'sf-sr' }, 'Iniciar sesión en StudyFlow'),
      form));
}
