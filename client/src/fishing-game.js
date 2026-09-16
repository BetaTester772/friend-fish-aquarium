export const FISHING_WAIT_MIN_MS = 1_500;
export const FISHING_WAIT_RANGE_MS = 2_000;
export const FISHING_BITE_WINDOW_MS = 900;

export function createFishingRound(fish, { now = Date.now(), random = Math.random } = {}) {
  if (!fish.length) return null;
  const target = fish[Math.min(fish.length - 1, Math.floor(random() * fish.length))];
  const wait = FISHING_WAIT_MIN_MS + random() * FISHING_WAIT_RANGE_MS;
  const biteAt = now + Math.round(wait);
  return {
    targetFishId: target.id,
    biteAt,
    deadline: biteAt + FISHING_BITE_WINDOW_MS,
  };
}

export function fishingPhase(round, now = Date.now()) {
  if (now < round.biteAt) return 'waiting';
  return now <= round.deadline ? 'bite' : 'missed';
}

export function reelFishing(round, now = Date.now()) {
  const phase = fishingPhase(round, now);
  if (phase === 'waiting') return 'early';
  return phase === 'bite' ? 'caught' : 'late';
}
