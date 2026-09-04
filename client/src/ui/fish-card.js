import { api, ApiError } from '../api.js';
import { track } from '../analytics.js';
import { toast } from './toast.js';
import { confirmModal, el } from './modal.js';

/**
 * The popover that opens when a fish is picked: who it is, how full it is, and
 * the Feed button (spec S1 "Interaction", FR-012).
 *
 * Feeding is fully resolved by the server, so this only reports the outcome —
 * accepted / full / ignored / cooldown (spec AC-08, AC-09).
 */
export function createFishCard({ state, aquarium, onRequestJoin }) {
  const card = el('div', 'fish-card');
  card.hidden = true;

  const face = document.createElement('img');
  face.className = 'fish-card__face';
  face.alt = '';

  const name = el('div', 'fish-card__name');
  const status = el('div', 'fish-card__status');
  const head = el('div', 'fish-card__head');
  const identity = el('div');
  identity.append(name, status);
  head.append(face, identity);

  const bar = el('div', 'fish-card__bar');
  const fill = el('span', 'fish-card__fill');
  bar.append(fill);

  const hint = el('p', 'fish-card__hint');

  const action = el('button', 'btn btn--primary btn--small');
  action.type = 'button';

  const secondary = el('button', 'btn btn--ghost btn--small');
  secondary.type = 'button';

  const actions = el('div', 'modal__actions');
  actions.append(secondary, action);

  card.append(head, bar, hint, actions);
  document.body.append(card);

  let feeding = false;
  /** Per-fish timestamp of our last accepted feed, for the local cooldown. */
  const lastFedAt = new Map();

  function selectedFish() {
    const id = state.get().selectedFishId;
    return id ? state.fishById(id) : null;
  }

  function cooldownLeft(fishId) {
    const cooldown = state.get().rules?.feedCooldownMs ?? 8000;
    const last = lastFedAt.get(fishId);
    return last ? Math.max(0, cooldown - (Date.now() - last)) : 0;
  }

  function render() {
    const fish = selectedFish();
    if (!fish) {
      card.hidden = true;
      aquarium.setSelected(null);
      return;
    }

    const { viewer, rules } = state.get();
    const max = rules?.fullness.max ?? 100;
    const mine = viewer?.id === fish.ownerUserId;

    card.hidden = false;
    card.dataset.status = fish.status;
    aquarium.setSelected(fish.id);

    face.src = fish.faceAssetUrl;
    name.textContent = `${fish.ownerName}${mine ? ' (you)' : ''}`;
    status.textContent = `${fish.status} · ${Math.round(fish.fullness)}/${max}`;
    fill.style.width = `${Math.round((fish.fullness / max) * 100)}%`;

    secondary.hidden = !mine;
    secondary.textContent = 'Remove my fish';

    if (!viewer) {
      hint.textContent = 'Pick a name to start feeding your friends.';
      action.textContent = 'Join the tank';
      action.disabled = false;
      return;
    }

    if (mine && !rules?.allowSelfFeed) {
      hint.textContent = 'This one is yours. Wait for a friend to feed it.';
      action.textContent = 'Feed';
      action.disabled = true;
      return;
    }

    if (fish.status === 'full') {
      hint.textContent = `${fish.ownerName} is full. Come back when they've digested.`;
      action.textContent = 'Feed';
      action.disabled = true;
      return;
    }

    const waiting = cooldownLeft(fish.id);
    hint.textContent = waiting
      ? `Hold on — ${Math.ceil(waiting / 1000)}s`
      : `One feed is worth ${rules?.fullness.feedAmount ?? 15} fullness.`;
    action.textContent = feeding ? 'Feeding…' : 'Feed';
    action.disabled = feeding || waiting > 0;
  }

  /** Anchor the card to its fish every frame so it tracks as the fish swims. */
  function reposition() {
    const fish = selectedFish();
    if (!fish || card.hidden) return;

    const point = aquarium.projectFish(fish.id);
    if (!point) {
      card.style.opacity = '0';
      return;
    }
    card.style.opacity = '1';

    const rect = card.getBoundingClientRect();
    const x = clamp(point.x - rect.width / 2, 8, innerWidth - rect.width - 8);
    const y = clamp(point.y - rect.height - 46, 8, innerHeight - rect.height - 8);
    card.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    card.style.left = '0';
    card.style.top = '0';
  }

  async function feed(fish) {
    track('fish_feed_attempted', { target_fish_id: fish.id });
    feeding = true;
    render();

    try {
      const { result, fish: updated } = await api.feed(fish.id);
      track('fish_feed_result', { result, target_fish_id: fish.id });

      state.upsertFish(updated);
      aquarium.updateFishData(updated);

      if (result === 'accepted') {
        lastFedAt.set(fish.id, Date.now());
        aquarium.dropFood(fish.id);
        toast(`Fed ${fish.ownerName}`, { tone: 'good' });
      } else if (result === 'full') {
        toast(`${fish.ownerName} is full`, { tone: 'warn' });
      } else if (result === 'ignored') {
        lastFedAt.set(fish.id, Date.now());
        toast(`${fish.ownerName} ignored you`, { tone: 'warn' });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        // Server-side cooldown. Mirror it locally so the button stays disabled
        // for the rest of the window instead of inviting another rejection.
        const wait = err.body.retryAfterMs ?? 0;
        const cooldown = state.get().rules?.feedCooldownMs ?? 8000;
        lastFedAt.set(fish.id, Date.now() - (cooldown - wait));
        track('fish_feed_result', { result: 'cooldown', target_fish_id: fish.id });
        toast('Slow down', { tone: 'warn' });
      } else if (err instanceof ApiError && err.status === 404) {
        // The fish was deleted between render and click (spec §10).
        state.removeFish({ id: fish.id });
        toast('That fish just left the tank', { tone: 'warn' });
      } else {
        track('fish_feed_result', { result: 'error', target_fish_id: fish.id });
        toast('Could not feed right now', { tone: 'warn' });
      }
    } finally {
      feeding = false;
      render();
    }
  }

  action.addEventListener('click', async () => {
    const fish = selectedFish();
    if (!fish) return;
    if (!state.get().viewer) {
      await onRequestJoin();
      render();
      return;
    }
    feed(fish);
  });

  secondary.addEventListener('click', async () => {
    const fish = selectedFish();
    if (!fish) return;

    const confirmed = await confirmModal({
      title: 'Remove your fish?',
      body:
        'Your fish leaves the tank and the face image we stored for it is ' +
        'deleted from the server. You can always make a new one.',
      confirmLabel: 'Remove it',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await api.deleteFish(fish.id);
      state.removeFish({ id: fish.id });
      state.select(null);
      // The "Add your fish" CTA reappears on its own now that the viewer
      // has no fish in this tank.
      toast('Your fish is gone', { tone: 'neutral' });
    } catch {
      toast('Could not remove your fish', { tone: 'warn' });
    }
  });

  // Ticking once a second keeps the cooldown countdown honest.
  const cooldownTimer = setInterval(() => {
    if (!card.hidden) render();
  }, 1000);

  const stopSelection = state.on('selection', render);
  const stopFish = state.on('fish', render);
  const stopViewer = state.on('viewer', render);
  const stopFrame = aquarium.onFrame(reposition);

  return {
    destroy() {
      clearInterval(cooldownTimer);
      stopSelection();
      stopFish();
      stopViewer();
      stopFrame();
      card.remove();
    },
  };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
