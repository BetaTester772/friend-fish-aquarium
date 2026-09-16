import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityItems,
  isNearBottom,
} from '../client/src/ui/activity-feed-state.js';

const events = (count) =>
  Array.from({ length: count }, (_, index) => ({ id: `event-${index + 1}` }));

test('hiding the activity log removes every event from the visible list', () => {
  assert.deepEqual(activityItems(events(8), { visible: false }), []);
});

test('an open activity log keeps the newest forty events in chronological order', () => {
  const shown = activityItems(events(45), { visible: true });
  assert.equal(shown.length, 40);
  assert.equal(shown[0].id, 'event-6');
  assert.equal(shown.at(-1).id, 'event-45');
});

test('auto-scroll follows new events only while the reader is near the bottom', () => {
  assert.equal(
    isNearBottom({ scrollTop: 275, clientHeight: 200, scrollHeight: 500 }),
    true,
  );
  assert.equal(
    isNearBottom({ scrollTop: 150, clientHeight: 200, scrollHeight: 500 }),
    false,
  );
});
