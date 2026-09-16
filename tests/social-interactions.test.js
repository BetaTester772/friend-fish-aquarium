import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REACTION_EMOJIS,
  cooldownRemaining,
  isReactionEmoji,
} from '../shared/social-interactions.js';

test('only the four supported emoji reactions are accepted', () => {
  assert.deepEqual(REACTION_EMOJIS, ['❤️', '😂', '😮', '👏']);
  for (const emoji of REACTION_EMOJIS) assert.equal(isReactionEmoji(emoji), true);
  for (const value of ['🔥', '', null, 7]) assert.equal(isReactionEmoji(value), false);
});

test('cooldown reports the remaining window without going below zero', () => {
  assert.equal(cooldownRemaining(null, 1500, 750), 0);
  assert.equal(cooldownRemaining(1000, 1500, 750), 250);
  assert.equal(cooldownRemaining(1000, 1750, 750), 0);
  assert.equal(cooldownRemaining(1000, 2000, 750), 0);
});
