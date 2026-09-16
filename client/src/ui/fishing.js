import { api, ApiError } from '../api.js';
import { createFishingRound, fishingPhase, reelFishing } from '../fishing-game.js';
import { apiErrorKey, subscribeLocale, t } from '../i18n.js';
import { track } from '../analytics.js';
import { toast } from './toast.js';

/** A tiny timing game that catches one visible fish without changing its data. */
export function createFishing({ state, effects }) {
  const root = document.createElement('section');
  root.className = 'fishing';

  const status = document.createElement('span');
  status.className = 'fishing__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--primary btn--small fishing__button';
  root.append(status, button);
  document.body.append(root);

  let round = null;
  let timer = null;
  let submitting = false;

  function eligibleFish() {
    return state.get().fish;
  }

  function targetFish() {
    return round ? state.fishById(round.targetFishId) : null;
  }

  function cancel() {
    round = null;
    submitting = false;
    clearTimeout(timer);
    timer = null;
    render();
  }

  function render() {
    const signedIn = Boolean(state.get().viewer);
    root.hidden = !signedIn || eligibleFish().length === 0;
    if (root.hidden) return;

    if (!round) {
      status.textContent = t('fishing.idle');
      button.textContent = t('fishing.cast');
      button.disabled = false;
      return;
    }

    const fish = targetFish();
    if (!fish) {
      toast('fishing.targetGone', { tone: 'warn' });
      cancel();
      return;
    }

    const phase = fishingPhase(round, Date.now());
    status.textContent = phase === 'waiting'
      ? t('fishing.waiting', { name: fish.ownerName })
      : phase === 'bite'
        ? t('fishing.bite')
        : t('fishing.missed');
    button.textContent = t(phase === 'bite' ? 'fishing.reel' : 'fishing.wait');
    button.disabled = submitting || phase === 'missed';
  }

  function scheduleRender(delay) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      render();
      if (round && fishingPhase(round, Date.now()) === 'bite') {
        scheduleRender(Math.max(0, round.deadline - Date.now() + 20));
      } else if (round && fishingPhase(round, Date.now()) === 'missed') {
        toast('fishing.tooLate', { tone: 'warn' });
        timer = setTimeout(cancel, 900);
      }
    }, delay);
  }

  function cast() {
    round = createFishingRound(eligibleFish());
    if (!round) return;
    track('fishing_cast', { target_fish_id: round.targetFishId });
    render();
    scheduleRender(Math.max(0, round.biteAt - Date.now() + 10));
  }

  async function reel() {
    const result = reelFishing(round, Date.now());
    if (result !== 'caught') {
      toast(result === 'early' ? 'fishing.tooEarly' : 'fishing.tooLate', { tone: 'warn' });
      track('fishing_result', { result, target_fish_id: round.targetFishId });
      cancel();
      return;
    }

    const fish = targetFish();
    const targetFishId = round.targetFishId;
    clearTimeout(timer);
    timer = null;
    submitting = true;
    render();
    try {
      const response = await api.catchFish(targetFishId);
      effects.show(response.effect);
      track('fishing_result', { result: 'caught', target_fish_id: targetFishId });
      toast('fishing.caught', { tone: 'good', variables: { name: fish?.ownerName ?? '' } });
    } catch (err) {
      toast(err instanceof ApiError ? apiErrorKey(err) : 'fishing.error', { tone: 'warn' });
    } finally {
      cancel();
    }
  }

  button.addEventListener('click', () => {
    if (!round) cast();
    else reel();
  });

  const stopViewer = state.on('viewer', () => {
    if (!state.get().viewer) cancel();
    else render();
  });
  const stopFish = state.on('fish', render);
  const stopLocale = subscribeLocale(render);
  render();

  return {
    cancel,
    destroy() {
      cancel();
      stopViewer();
      stopFish();
      stopLocale();
      root.remove();
    },
  };
}
