import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFishingRound,
  fishingPhase,
  reelFishing,
} from '../client/src/fishing-game.js';

test('a fishing round picks a deterministic target and bite window', () => {
  const values = [0.6, 0.25];
  const round = createFishingRound(
    [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    { now: 1000, random: () => values.shift() },
  );

  assert.deepEqual(round, {
    targetFishId: 'b',
    biteAt: 3000,
    deadline: 3900,
  });
});

test('a fishing round needs at least one fish', () => {
  assert.equal(createFishingRound([], { now: 1000, random: () => 0 }), null);
});

test('the phase moves from waiting to bite to missed at exact boundaries', () => {
  const round = { targetFishId: 'a', biteAt: 2000, deadline: 2900 };
  assert.equal(fishingPhase(round, 1999), 'waiting');
  assert.equal(fishingPhase(round, 2000), 'bite');
  assert.equal(fishingPhase(round, 2900), 'bite');
  assert.equal(fishingPhase(round, 2901), 'missed');
});

test('reeling distinguishes an early tap, a catch, and a late tap', () => {
  const round = { targetFishId: 'a', biteAt: 2000, deadline: 2900 };
  assert.equal(reelFishing(round, 1999), 'early');
  assert.equal(reelFishing(round, 2500), 'caught');
  assert.equal(reelFishing(round, 2901), 'late');
});
