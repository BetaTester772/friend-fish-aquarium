import { t } from '../i18n.js';

const EFFECT_LIFETIME_MS = 1_800;
const SEEN_LIFETIME_MS = 30_000;

/** Floating, ephemeral feedback shared by reactions, nudges and fishing. */
export function createFishEffects({ aquarium }) {
  const layer = document.createElement('div');
  layer.className = 'fish-effects';
  layer.setAttribute('aria-live', 'polite');
  document.body.append(layer);

  const active = new Map();
  const seen = new Map();

  function show(effect) {
    if (!effect?.id || !effect.fishId || seen.has(effect.id)) return;
    const now = Date.now();
    seen.set(effect.id, now);

    if (effect.kind === 'hit') aquarium.playHit(effect.fishId);
    if (effect.kind === 'catch') aquarium.playCatch(effect.fishId);

    const node = document.createElement('span');
    node.className = `fish-effect fish-effect--${effect.kind}`;
    node.textContent = effect.kind === 'reaction' ? effect.emoji : effect.kind === 'hit' ? '💦' : '🎣';
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', t(`effect.${effect.kind}Aria`, {
      actor: effect.actorName ?? '',
      emoji: effect.emoji ?? '',
    }));
    layer.append(node);
    active.set(effect.id, { effect, node, createdAt: now });
  }

  function reposition() {
    const now = Date.now();
    for (const [id, item] of active) {
      if (now - item.createdAt >= EFFECT_LIFETIME_MS) {
        item.node.remove();
        active.delete(id);
        continue;
      }
      const point = aquarium.projectFish(item.effect.fishId);
      if (!point) {
        item.node.hidden = true;
        continue;
      }
      item.node.hidden = false;
      item.node.style.transform = `translate3d(${Math.round(point.x)}px, ${Math.round(point.y - 48)}px, 0)`;
    }
    for (const [id, timestamp] of seen) {
      if (now - timestamp > SEEN_LIFETIME_MS) seen.delete(id);
    }
  }

  const stopFrame = aquarium.onFrame(reposition);
  return {
    show,
    destroy() {
      stopFrame();
      layer.remove();
    },
  };
}
