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

  const dialog = document.createElement('div');
  dialog.className = wide ? 'modal modal--wide' : 'modal';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  backdrop.append(dialog);

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

    const focusable = [...dialog.querySelectorAll(FOCUSABLE)].filter(
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
export function confirmModal({ title, body, confirmLabel, danger = false }) {
  return openModal({
    render: ({ dialog, close }) => {
      const heading = el('h2', 'modal__title', title);
      const text = el('p', 'modal__body', body);

      const actions = el('div', 'modal__actions');
      const cancel = el('button', 'btn btn--ghost', 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', () => close(false));

      const confirm = el(
        'button',
        danger ? 'btn btn--danger' : 'btn btn--primary',
        confirmLabel,
      );
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
