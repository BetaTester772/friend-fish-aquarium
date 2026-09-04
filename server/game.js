/**
 * Pure game rules. No I/O, no clock, no randomness of its own — the caller
 * injects `now` and `random` so every branch is testable and reproducible.
 */
import { config } from './config.js';

const { fullness: F, feed: FEED } = config;

export const FishStatus = {
  HUNGRY: 'hungry',
  OKAY: 'okay',
  FULL: 'full',
};

export const FeedResult = {
  ACCEPTED: 'accepted',
  FULL: 'full',
  IGNORED: 'ignored',
  COOLDOWN: 'cooldown',
};

export const clampFullness = (value) =>
  Math.min(F.max, Math.max(F.min, value));

/**
 * Fullness decays continuously, but we only ever store a value plus the instant
 * it was written. Decay is resolved lazily at read time, so it keeps ticking
 * while the server is down and needs no scheduler (spec FR-017).
 */
export function decayedFullness(storedFullness, updatedAtMs, nowMs) {
  const elapsedHours = Math.max(0, nowMs - updatedAtMs) / 3_600_000;
  return clampFullness(storedFullness - elapsedHours * F.decayPerHour);
}

export function statusFor(fullness) {
  if (fullness >= F.fullThreshold) return FishStatus.FULL;
  if (fullness < F.hungryThreshold) return FishStatus.HUNGRY;
  return FishStatus.OKAY;
}

/**
 * Chance the fish ignores this particular feed attempt.
 *
 * The Reel shows "beandog ignored clare" right after three feeds in a row and an
 * "is full", so ignoring reads as a reaction to being pestered and to being
 * sated rather than as pure noise. Spec §15 leaves the exact rule open; this is
 * the documented choice.
 */
export function ignoreChance({ fullness, msSinceSameActorFed }) {
  let chance = FEED.ignoreBaseChance;
  if (
    msSinceSameActorFed !== null &&
    msSinceSameActorFed < FEED.ignorePesteredWindowMs
  ) {
    chance += FEED.ignorePesteredChance;
  }
  if (fullness >= FEED.ignoreSatedFullness) {
    chance += FEED.ignoreSatedChance;
  }
  return Math.min(FEED.ignoreMaxChance, chance);
}

/**
 * Resolve one feed attempt.
 *
 * @param {object} input
 * @param {number} input.fullness            decayed fullness of the target, 0-100
 * @param {number|null} input.msSinceSameActorFed  null when this actor never fed it
 * @param {boolean} input.isSelf             actor owns the target fish
 * @param {() => number} input.random        injectable RNG in [0, 1)
 * @returns {{result: string, fullness: number, becameFull: boolean}}
 */
export function resolveFeed({
  fullness,
  msSinceSameActorFed = null,
  isSelf = false,
  random = Math.random,
}) {
  const unchanged = (result) => ({ result, fullness, becameFull: false });

  if (
    msSinceSameActorFed !== null &&
    msSinceSameActorFed < FEED.cooldownMs
  ) {
    return unchanged(FeedResult.COOLDOWN);
  }

  if (statusFor(fullness) === FishStatus.FULL) {
    return unchanged(FeedResult.FULL);
  }

  // Self-feeding never triggers the social "ignored" reaction — you can't snub
  // yourself — but it is still subject to the full guard and the cooldown.
  if (!isSelf && random() < ignoreChance({ fullness, msSinceSameActorFed })) {
    return unchanged(FeedResult.IGNORED);
  }

  const next = clampFullness(fullness + F.feedAmount);
  return {
    result: FeedResult.ACCEPTED,
    fullness: next,
    becameFull: statusFor(next) === FishStatus.FULL,
  };
}
