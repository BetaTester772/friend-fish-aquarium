import { api } from '../api.js';
import { openModal, confirmModal, el } from './modal.js';
import { inviteLink } from './gate.js';
import { toast } from './toast.js';

/**
 * Top bar and the "Add your fish" CTA (spec S1, S2, FR-004, FR-011).
 *
 * The current-user chip is the "clare" pill in the top right of the Reel; it
 * doubles as the menu holding the invite link and the privacy controls
 * (FR-020 / AC-11).
 */
export function createHud({
  container,
  state,
  onAddFish,
  onSignIn,
  onSignedOut,
  onReload,
}) {
  const brand = el('div', 'hud__brand');
  const title = el('div', 'hud__title', 'friend fish aquarium');
  const subtitle = el('div', 'hud__subtitle');
  brand.append(title, subtitle);

  const anchor = el('div', 'hud__anchor');
  const right = el('div', 'hud__right');
  right.append(anchor);

  container.replaceChildren(brand, right);

  // "Add your fish", bottom center, as in the Reel.
  const ctaWrap = el('div', 'hud__cta');
  const cta = el('button', 'btn btn--primary', 'Add your fish');
  cta.type = 'button';
  cta.addEventListener('click', () => onAddFish());
  ctaWrap.append(cta);
  document.body.append(ctaWrap);

  let menu = null;

  function closeMenu() {
    menu?.remove();
    menu = null;
    document.removeEventListener('pointerdown', onOutside, true);
  }

  function onOutside(event) {
    if (!menu?.contains(event.target) && !anchor.contains(event.target)) closeMenu();
  }

  function openMenu() {
    closeMenu();
    const { viewer, tank, gate } = state.get();

    menu = el('div', 'menu');
    menu.setAttribute('role', 'menu');

    // Carries the share token when the tank is private, so whoever receives it
    // is one click from the fish rather than one passphrase from a wall.
    const inviteUrl = inviteLink({
      inviteCode: tank?.inviteCode,
      shareKey: gate?.shareKey,
    });

    menu.append(
      el('div', 'menu__note', `Signed in as ${viewer.displayName}`),
      menuItem(gate?.enabled ? 'Copy invite link (lets them in)' : 'Copy invite link', async () => {
        try {
          await navigator.clipboard.writeText(inviteUrl);
          toast('Invite link copied', { tone: 'good' });
        } catch {
          window.prompt('Copy this invite link', inviteUrl);
        }
        closeMenu();
      }),
      menuItem('Change my name', async () => {
        closeMenu();
        const renamed = await promptForName({ state, initial: viewer.displayName });
        // The name is snapshotted onto the fish records, so pull a fresh
        // tank rather than leaving the old one over your own fish.
        if (renamed) onReload?.();
      }),
      el(
        'div',
        'menu__note',
        'Your face picture is stored only so friends recognise your fish.',
      ),
      menuItem('Sign out', async () => {
        closeMenu();
        await api.signOut();
        state.setViewer(null);
        onSignedOut?.();
        toast('Signed out');
      }),
      menuItem(
        'Delete my fish and data',
        async () => {
          closeMenu();
          const confirmed = await confirmModal({
            title: 'Delete everything?',
            body:
              'This removes your fish, deletes the face image stored on the ' +
              'server, and forgets your account. It cannot be undone.',
            confirmLabel: 'Delete it all',
            danger: true,
          });
          if (!confirmed) return;
          await api.deleteAccount();
          state.removeFish({ ownerUserId: viewer.id });
          state.setViewer(null);
          onSignedOut?.();
          toast('Deleted. Nothing of yours is left in the tank.');
        },
        'menu__item menu__item--danger',
      ),
    );

    anchor.append(menu);
    document.addEventListener('pointerdown', onOutside, true);
    menu.querySelector('button')?.focus();
  }

  function menuItem(label, onClick, className = 'menu__item') {
    const button = el('button', className, label);
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.addEventListener('click', onClick);
    return button;
  }

  function render() {
    const { viewer, fish, members, tank, connection } = state.get();

    subtitle.textContent =
      connection === 'reconnecting'
        ? 'reconnecting…'
        : `${fish.length} fish · ${members.filter((m) => m.online).length} here now`;
    title.textContent = tank?.name ?? 'friend fish aquarium';

    if (viewer) {
      const chip = el('button', 'user-chip');
      chip.type = 'button';
      chip.setAttribute('aria-haspopup', 'menu');
      chip.append(
        el('span', 'user-chip__dot'),
        el('span', null, viewer.displayName),
        el('span', 'user-chip__caret', '▾'),
      );
      chip.addEventListener('click', () => (menu ? closeMenu() : openMenu()));
      anchor.replaceChildren(chip);
    } else {
      const join = el('button', 'btn btn--ghost btn--small', 'Who are you?');
      join.type = 'button';
      join.addEventListener('click', () => onSignIn());
      anchor.replaceChildren(join);
    }

    // The CTA only exists while you have no fish here (spec FR-004).
    const hasFish = Boolean(viewer && fish.some((f) => f.ownerUserId === viewer.id));
    ctaWrap.hidden = hasFish;
  }

  render();
  const stops = [
    state.on('viewer', render),
    state.on('fish', render),
    state.on('members', render),
    state.on('connection', render),
    state.on('hydrated', render),
  ];

  return {
    render,
    destroy() {
      for (const stop of stops) stop();
      closeMenu();
      ctaWrap.remove();
    },
  };
}

/**
 * Nickname sign-in (spec FR-011). Auth is deliberately just a name plus the
 * tank link — see the README for why.
 */
export function promptForName({ state, initial = '' } = {}) {
  return openModal({
    render: ({ dialog, close }) => {
      const input = el('input');
      input.type = 'text';
      input.maxLength = 24;
      input.value = initial;
      input.placeholder = 'beandog';
      input.autocomplete = 'nickname';

      const field = el('div', 'field');
      const label = el('label', 'field__label', 'What should the tank call you?');
      label.htmlFor = 'ffa-name';
      input.id = 'ffa-name';
      field.append(label, input);

      const error = el('p', 'modal__error');
      error.hidden = true;

      const submit = el('button', 'btn btn--primary', initial ? 'Save' : 'Join the tank');
      submit.type = 'submit';

      const form = document.createElement('form');
      form.append(field, error, el('div', 'modal__actions'));
      form.lastChild.append(submit);

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        submit.disabled = true;
        error.hidden = true;
        try {
          const { user } = await api.signIn(input.value);
          state.setViewer({ ...user, fishId: state.myFish()?.id ?? null });
          close(user);
        } catch (err) {
          error.textContent = err.message;
          error.hidden = false;
          submit.disabled = false;
        }
      });

      dialog.append(
        el('h2', 'modal__title', initial ? 'Change your name' : 'Join the tank'),
        el(
          'p',
          'modal__body',
          'No password, no email. Just the name your friends will see over your fish.',
        ),
        form,
      );
      input.focus();
      input.select();
    },
  });
}
