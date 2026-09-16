export const REACTION_EMOJIS = ['❤️', '😂', '😮', '👏'];

export const isReactionEmoji = (value) => REACTION_EMOJIS.includes(value);

export function cooldownRemaining(lastAt, now, cooldownMs) {
  if (!Number.isFinite(lastAt)) return 0;
  return Math.max(0, cooldownMs - (now - lastAt));
}
