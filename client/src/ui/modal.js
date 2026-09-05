import { bindText } from '../i18n.js';

/**
 * Minimal modal host: focus trapping, Escape to dismiss, and a promise that
 * settles with whatever the modal's own controls resolve it to.
 */
const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])';

export function openModal({ dismissible = true, wide = false, render }) {
  const root = document.getElementById('modal-root');
  const previouslyFocused = document.activeElement;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const shell = document.createElement('div');
  shell.className = 'modal-shell';
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-modal', 'true');

  const dialog = document.createElement('div');
  dialog.className = wide ? 'modal modal--wide' : 'modal';
  const languageSelector = document.querySelector('.language-selector');
  if (languageSelector) shell.append(languageSelector);
  shell.append(dialog);
  backdrop.append(shell);

  let settle;
  const result = new Promise((resolve) => {
    settle = resolve;
  });

  let onClose = null;
  let closed = false;

  function close(value) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown, true);
    if (languageSelector) document.body.append(languageSelector);
    backdrop.remove();
    onClose?.();
    previouslyFocused?.focus?.();
    settle(value);
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && dismissible) {
      event.stopPropagation();
      close(null);
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [...shell.querySelectorAll(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null,
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  backdrop.addEventListener('pointerdown', (event) => {
    if (dismissible && event.target === backdrop) close(null);
  });
  document.addEventListener('keydown', onKeydown, true);

  render({
    dialog,
    close,
    /** Register cleanup that must run however the modal is dismissed. */
    onClose: (fn) => {
      onClose = fn;
    },
  });

  root.append(backdrop);
  dialog.querySelector(FOCUSABLE)?.focus();

  return result;
}

/** Helper for the small confirm dialogs (delete fish, delete account). */
export function confirmModal({ titleKey, bodyKey, confirmKey, variables = {}, danger = false }) {
  return openModal({
    render: ({ dialog, close }) => {
      const heading = el('h2', 'modal__title');
      const text = el('p', 'modal__body');
      bindText(heading, titleKey, variables);
      bindText(text, bodyKey, variables);

      const actions = el('div', 'modal__actions');
      const cancel = el('button', 'btn btn--ghost');
      bindText(cancel, 'common.cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', () => close(false));

      const confirm = el(
        'button',
        danger ? 'btn btn--danger' : 'btn btn--primary',
        undefined,
      );
      bindText(confirm, confirmKey, variables);
      confirm.type = 'button';
      confirm.addEventListener('click', () => close(true));

      actions.append(cancel, confirm);
      dialog.append(heading, text, actions);
    },
  });
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
