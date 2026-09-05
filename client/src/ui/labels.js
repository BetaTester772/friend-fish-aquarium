/**
 * The floating name + status bar over every fish (spec FR-002 / FR-003).
 *
 * These are HTML buttons projected from the 3D scene rather than sprites: they
 * stay crisp at any pixel ratio, and — more importantly — they make the tank
 * operable with a keyboard and with assistive tech, which a canvas alone is
 * not (spec §12).
 */
export function createFishLabels({ container, aquarium, state }) {
  /** @type {Map<string, {root: HTMLButtonElement, name: HTMLElement, fill: HTMLElement}>} */
  const labels = new Map();

  function build(fish) {
    const root = document.createElement('button');
    root.type = 'button';
    root.className = 'fish-label';
    root.dataset.fishId = fish.id;

    const name = document.createElement('span');
    name.className = 'fish-label__name';

    const bar = document.createElement('span');
    bar.className = 'fish-label__bar';
    const fill = document.createElement('span');
    fill.className = 'fish-label__fill';
    bar.append(fill);

    root.append(name, bar);
    root.addEventListener('click', (event) => {
      event.stopPropagation();
      state.select(fish.id);
    });
    root.addEventListener('pointerenter', () => aquarium.setHovered(fish.id));
    root.addEventListener('pointerleave', () => aquarium.setHovered(null));
    root.addEventListener('focus', () => aquarium.setHovered(fish.id));
    root.addEventListener('blur', () => aquarium.setHovered(null));

    container.append(root);
    const entry = { root, name, fill };
    labels.set(fish.id, entry);
    return entry;
  }

  function render(fishList) {
    const viewer = state.get().viewer;
    const max = state.get().rules?.fullness.max ?? 100;
    const seen = new Set();

    for (const fish of fishList) {
      seen.add(fish.id);
      const entry = labels.get(fish.id) ?? build(fish);
      const mine = viewer?.id === fish.ownerUserId;

      entry.name.textContent = fish.ownerName;
      entry.fill.style.width = `${Math.round((fish.fullness / max) * 100)}%`;
      entry.root.dataset.status = fish.status;
      entry.root.dataset.mine = String(mine);
      entry.root.setAttribute(
        'aria-label',
        t('fish.aria', {
          name: fish.ownerName,
          mine: mine ? t('fish.mineSuffix') : '',
          status: translateStatus(fish.status),
          fullness: Math.round(fish.fullness),
          max,
        }),
      );
    }

    for (const [id, entry] of labels) {
      if (seen.has(id)) continue;
      entry.root.remove();
      labels.delete(id);
    }
  }

  /**
   * Runs every rendered frame. Position is written as a transform so the
   * browser never reflows, and the tag is hidden outright when its fish is
   * off-screen or behind the camera.
   */
  function reposition() {
    for (const [id, entry] of labels) {
      const point = aquarium.projectFish(id);
      if (!point) {
        entry.root.style.visibility = 'hidden';
        continue;
      }
      entry.root.style.visibility = 'visible';
      entry.root.style.transform = `translate3d(${Math.round(point.x)}px, ${Math.round(
        point.y,
      )}px, 0) translate(-50%, -100%)`;
      // Far-away tags dim so a crowded tank stays readable.
      entry.root.classList.toggle('fish-label--occluded', point.distance > 26);
    }
  }

  render(state.get().fish);
  const stopRender = state.on('fish', render);
  const stopLocale = subscribeLocale(() => render(state.get().fish));
  const stopFrame = aquarium.onFrame(reposition);

  return {
    destroy() {
      stopRender();
      stopLocale();
      stopFrame();
      for (const entry of labels.values()) entry.root.remove();
      labels.clear();
    },
  };
}
import { subscribeLocale, t, translateStatus } from '../i18n.js';
