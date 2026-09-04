import { api, ApiError } from '../api.js';
import { openModal, el } from './modal.js';

/**
 * The passphrase prompt shown when the tank is private (see server/gate.js).
 *
 * It is not dismissible: without the passphrase there is nothing behind it to
 * look at, so an escape hatch would only produce an empty blue screen.
 */
export function promptForPassphrase() {
  return openModal({
    dismissible: false,
    render: ({ dialog, close }) => {
      const input = el('input');
      input.type = 'password';
      input.id = 'ffa-passphrase';
      input.autocomplete = 'current-password';
      input.placeholder = 'the passphrase';

      const label = el('label', 'field__label', 'Passphrase');
      label.htmlFor = input.id;

      const field = el('div', 'field');
      field.append(label, input);

      const error = el('p', 'modal__error');
      error.hidden = true;

      const submit = el('button', 'btn btn--primary', 'Come in');
      submit.type = 'submit';

      const actions = el('div', 'modal__actions');
      actions.append(submit);

      const form = document.createElement('form');
      form.append(field, error, actions);

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        submit.disabled = true;
        submit.textContent = 'Checking…';
        error.hidden = true;

        try {
          await api.unlock(input.value);
          close(true);
        } catch (err) {
          // The server pauses before answering a wrong guess, so this lands
          // a moment later on purpose.
          error.textContent =
            err instanceof ApiError && err.status === 403
              ? err.message
              : 'Could not reach the tank. Try again.';
          error.hidden = false;
          input.select();
        } finally {
          submit.disabled = false;
          submit.textContent = 'Come in';
        }
      });

      dialog.append(
        el('h2', 'modal__title', 'this tank is private'),
        el(
          'p',
          'modal__body',
          'Ask whoever sent you the link for the passphrase. It is the same one ' +
            'for everybody.',
        ),
        form,
      );
      input.focus();
    },
  });
}
