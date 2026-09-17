import { api, ApiError } from '../api.js';
import {
  createFishingRound,
  fishingPhase,
  reelFishing,
} from '../fishing-game.js';
import { fishingDock, responsiveFishingLayout } from '../responsive-layout.js';
import { apiErrorKey, subscribeLocale, t } from '../i18n.js';
import { track } from '../analytics.js';
import { toast } from './toast.js';

/** A tiny timing game that catches one visible fish without changing its data. */
export function createFishing({ state, effects }) {
  const root = document.createElement('section');
  root.className = 'fishing';

  const copy = document.createElement('div');
  copy.className = 'fishing__copy';

  const status = document.createElement('strong');
  status.className = 'fishing__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const hint = document.createElement('span');
  hint.className = 'fishing__hint';
  copy.append(status, hint);

  const rod = document.createElement('button');
  rod.type = 'button';
  rod.className = 'fishing__rod';
  rod.innerHTML = `
    <span class="fishing__rod-shaft" aria-hidden="true"></span>
    <span class="fishing__line" aria-hidden="true"></span>
    <span class="fishing__bobber" aria-hidden="true"></span>
    <span class="fishing__rod-label"></span>
  `;
  const rodLabel = rod.querySelector('.fishing__rod-label');

  root.append(copy, rod);
  document.body.append(root);

  let round = null;
  let timer = null;
  let submitting = false;

  function renderLayout() {
    const { viewer, fish } = state.get();
    const hasOwnFish = Boolean(
      viewer && fish.some((candidate) => candidate.ownerUserId === viewer.id),
    );
    root.dataset.layout = responsiveFishingLayout(innerWidth, innerHeight);
    root.dataset.dock = fishingDock(innerWidth, innerHeight, { hasOwnFish });
  }

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
    renderLayout();
    const signedIn = Boolean(state.get().viewer);
    root.hidden = !signedIn || eligibleFish().length === 0;
    if (root.hidden) return;

    if (!round) {
      root.dataset.phase = 'idle';
      status.textContent = t('fishing.idle');
      hint.textContent = t('fishing.idleHint');
      rodLabel.textContent = t('fishing.cast');
      rod.setAttribute('aria-label', t('fishing.castAria'));
      rod.disabled = false;
      return;
    }

    const fish = targetFish();
    if (!fish) {
      toast('fishing.targetGone', { tone: 'warn' });
      cancel();
      return;
    }

    const phase = fishingPhase(round, Date.now());
    root.dataset.phase = phase;
    status.textContent = phase === 'waiting'
      ? t('fishing.waiting', { name: fish.ownerName })
      : phase === 'bite'
        ? t('fishing.bite')
        : t('fishing.missed');
    hint.textContent = t(phase === 'bite' ? 'fishing.biteHint' : 'fishing.waitHint');
    rodLabel.textContent = t(phase === 'bite' ? 'fishing.reel' : 'fishing.wait');
    rod.setAttribute('aria-label', t(phase === 'bite' ? 'fishing.reelAria' : 'fishing.waitAria'));
    rod.disabled = submitting || phase === 'missed';
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

  rod.addEventListener('click', () => {
    if (!round) cast();
    else reel();
  });

  const stopViewer = state.on('viewer', () => {
    if (!state.get().viewer) cancel();
    else render();
  });
  const stopFish = state.on('fish', render);
  const stopLocale = subscribeLocale(render);
  window.addEventListener('resize', renderLayout);
  render();

  return {
    cancel,
    destroy() {
      cancel();
      stopViewer();
      stopFish();
      stopLocale();
      window.removeEventListener('resize', renderLayout);
      root.remove();
    },
  };
}
