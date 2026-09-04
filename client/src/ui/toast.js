const container = () => document.getElementById('toasts');

/**
 * Transient message. The feed results the Reel implies — full, ignored,
 * cooldown — all surface here so the player always learns what happened
 * (spec AC-09).
 */
export function toast(message, { tone = 'neutral', duration = 2600 } = {}) {
  const root = container();
  if (!root) return;

  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.tone = tone;
  el.textContent = message;
  root.append(el);

  setTimeout(() => {
    el.style.transition = 'opacity 0.25s ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
  }, duration);
}
