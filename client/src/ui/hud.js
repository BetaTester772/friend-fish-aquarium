import { api } from '../api.js';
import { openModal, confirmModal, el } from './modal.js';
import { inviteLink } from './gate.js';
import { toast } from './toast.js';
import { apiErrorMessage, bindText, subscribeLocale, t } from '../i18n.js';

const localized = (tag, className, key, variables) => {
  const node = el(tag, className);
  bindText(node, key, variables);
  return node;
};

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
  const cta = localized('button', 'btn btn--primary', 'hud.addFish');
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
      localized('div', 'menu__note', 'hud.signedInAs', { name: viewer.displayName }),
      menuItem(gate?.enabled ? 'hud.copyInvitePrivate' : 'hud.copyInvite', async () => {
        try {
          await navigator.clipboard.writeText(inviteUrl);
          toast('hud.inviteCopied', { tone: 'good' });
        } catch {
          window.prompt(t('hud.copyInvitePrompt'), inviteUrl);
        }
        closeMenu();
      }),
      menuItem('hud.changeName', async () => {
        closeMenu();
        const renamed = await promptForName({ state, initial: viewer.displayName });
        // The name is snapshotted onto the fish records, so pull a fresh
        // tank rather than leaving the old one over your own fish.
        if (renamed) onReload?.();
      }),
      localized('div', 'menu__note', 'hud.facePrivacy'),
      menuItem('hud.signOut', async () => {
        closeMenu();
        await api.signOut();
        state.setViewer(null);
        onSignedOut?.();
        toast('hud.signedOut');
      }),
      menuItem(
        'hud.deleteData',
        async () => {
          closeMenu();
          const confirmed = await confirmModal({
            titleKey: 'hud.deleteTitle',
            bodyKey: 'hud.deleteBody',
            confirmKey: 'hud.deleteConfirm',
            danger: true,
          });
          if (!confirmed) return;
          await api.deleteAccount();
          state.removeFish({ ownerUserId: viewer.id });
          state.setViewer(null);
          onSignedOut?.();
          toast('hud.deleted');
        },
        'menu__item menu__item--danger',
      ),
    );

    anchor.append(menu);
    document.addEventListener('pointerdown', onOutside, true);
    menu.querySelector('button')?.focus();
  }

  function menuItem(key, onClick, className = 'menu__item') {
    const button = localized('button', className, key);
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.addEventListener('click', onClick);
    return button;
  }

  function render() {
    const { viewer, fish, members, tank, connection } = state.get();

    subtitle.textContent =
      connection === 'reconnecting'
        ? t('hud.reconnecting')
        : t('hud.summary', {
            fishCount: fish.length,
            onlineCount: members.filter((m) => m.online).length,
          });
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
      const join = localized('button', 'btn btn--ghost btn--small', 'hud.whoAreYou');
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
    subscribeLocale(render),
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
      const label = localized('label', 'field__label', 'name.label');
      label.htmlFor = 'ffa-name';
      input.id = 'ffa-name';
      field.append(label, input);

      const error = el('p', 'modal__error');
      error.hidden = true;
      let errorKey = 'error.generic';
      bindText(error, () => errorKey);

      const submit = localized('button', 'btn btn--primary', initial ? 'name.save' : 'name.join');
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
          errorKey = err?.code && `api.${err.code}`;
          error.textContent = apiErrorMessage(err);
          error.hidden = false;
          submit.disabled = false;
        }
      });

      dialog.append(
        localized('h2', 'modal__title', initial ? 'name.changeTitle' : 'name.joinTitle'),
        localized('p', 'modal__body', 'name.body'),
        form,
      );
      input.focus();
      input.select();
    },
  });
}
