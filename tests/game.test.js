import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../server/config.js';
import {
  decayedFullness,
  clampFullness,
  statusFor,
  ignoreChance,
  resolveFeed,
  FeedResult,
  FishStatus,
} from '../server/game.js';

const HOUR = 3_600_000;
const never = () => 1; // random() = 1 never triggers the ignore roll
const always = () => 0; // random() = 0 always does

test('status thresholds follow the spec table', () => {
  assert.equal(statusFor(0), FishStatus.HUNGRY);
  assert.equal(statusFor(39.9), FishStatus.HUNGRY);
  assert.equal(statusFor(40), FishStatus.OKAY);
  assert.equal(statusFor(79.9), FishStatus.OKAY);
  assert.equal(statusFor(80), FishStatus.FULL);
  assert.equal(statusFor(100), FishStatus.FULL);
});

test('fullness decays over time and never goes negative', () => {
  const now = 1_000_000_000;
  assert.equal(decayedFullness(100, now, now), 100);

  const afterAnHour = decayedFullness(100, now, now + HOUR);
  assert.ok(Math.abs(afterAnHour - (100 - config.fullness.decayPerHour)) < 1e-9);

  // A full fish empties in about a day, and stays at the floor after that.
  assert.equal(decayedFullness(100, now, now + 48 * HOUR), 0);
});

test('a clock that jumps backwards does not inflate fullness', () => {
  const now = 1_000_000_000;
  assert.equal(decayedFullness(50, now, now - 10 * HOUR), 50);
});

test('feeding a hungry fish is accepted and raises fullness', () => {
  const outcome = resolveFeed({ fullness: 20, random: never });
  assert.equal(outcome.result, FeedResult.ACCEPTED);
  assert.equal(outcome.fullness, 20 + config.fullness.feedAmount);
  assert.equal(outcome.becameFull, false);
});

test('the feed that crosses the threshold reports becameFull', () => {
  const below = config.fullness.fullThreshold - 1;
  const outcome = resolveFeed({ fullness: below, random: never });
  assert.equal(outcome.result, FeedResult.ACCEPTED);
  assert.equal(outcome.fullness, below + config.fullness.feedAmount);
  assert.equal(outcome.becameFull, true, 'this is the "{target} is full" line');
});

test('fullness is clamped to the configured range', () => {
  assert.equal(clampFullness(config.fullness.max + 40), config.fullness.max);
  assert.equal(clampFullness(config.fullness.min - 40), config.fullness.min);
});

test('a full fish refuses more food and its fullness is unchanged', () => {
  const outcome = resolveFeed({ fullness: 85, random: never });
  assert.equal(outcome.result, FeedResult.FULL);
  assert.equal(outcome.fullness, 85);
});

test('the full guard wins over the ignore roll', () => {
  // Even with random() = 0, a full fish reports "full", not "ignored" — that is
  // the sequence the Reel shows: fed, fed, fed, is full, ignored.
  const outcome = resolveFeed({ fullness: 90, random: always });
  assert.equal(outcome.result, FeedResult.FULL);
});

test('the cooldown wins over everything', () => {
  const outcome = resolveFeed({
    fullness: 10,
    msSinceSameActorFed: config.feed.cooldownMs - 1,
    random: always,
  });
  assert.equal(outcome.result, FeedResult.COOLDOWN);
  assert.equal(outcome.fullness, 10);
});

test('past the cooldown the feed is judged normally', () => {
  const outcome = resolveFeed({
    fullness: 10,
    msSinceSameActorFed: config.feed.cooldownMs + 1,
    random: never,
  });
  assert.equal(outcome.result, FeedResult.ACCEPTED);
});

test('a fish can ignore a feed it would otherwise accept', () => {
  const outcome = resolveFeed({ fullness: 10, random: always });
  assert.equal(outcome.result, FeedResult.IGNORED);
  assert.equal(outcome.fullness, 10, 'ignoring leaves the fish unchanged');
});

test('you cannot be snubbed by your own fish', () => {
  const outcome = resolveFeed({ fullness: 10, isSelf: true, random: always });
  assert.equal(outcome.result, FeedResult.ACCEPTED);
});

test('pestering and being sated both raise the ignore chance', () => {
  const base = ignoreChance({ fullness: 10, msSinceSameActorFed: null });
  assert.equal(base, config.feed.ignoreBaseChance);

  const pestered = ignoreChance({ fullness: 10, msSinceSameActorFed: 1000 });
  assert.ok(pestered > base);

  const sated = ignoreChance({ fullness: 75, msSinceSameActorFed: null });
  assert.ok(sated > base);

  const both = ignoreChance({ fullness: 75, msSinceSameActorFed: 1000 });
  assert.ok(both >= pestered && both >= sated);
  assert.ok(both <= config.feed.ignoreMaxChance);
});

test('ignore chance never exceeds its cap', () => {
  for (const fullness of [0, 40, 70, 79]) {
    for (const since of [null, 0, 1000, 119_000]) {
      assert.ok(
        ignoreChance({ fullness, msSinceSameActorFed: since }) <=
          config.feed.ignoreMaxChance,
      );
    }
  }
});

test('repeated feeding walks a hungry fish to full', () => {
  // The core tamagotchi loop: enough feeds and the fish stops accepting.
  let fullness = 0;
  let accepted = 0;
  for (let i = 0; i < 20; i += 1) {
    const outcome = resolveFeed({ fullness, random: never });
    if (outcome.result === FeedResult.FULL) break;
    fullness = outcome.fullness;
    accepted += 1;
  }
  assert.equal(statusFor(fullness), FishStatus.FULL);
  assert.ok(accepted >= 5 && accepted <= 8, `took ${accepted} feeds`);
});
