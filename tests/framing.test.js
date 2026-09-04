import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHoldTimer,
  framingHint,
  boundsOf,
  HOLD_MS,
  GRACE_MS,
} from '../client/src/creator/framing.js';

/** A rectangular blob of landmarks, in the normalized frame coordinates. */
const face = ({ x, y, w, h }) => [
  { x, y },
  { x: x + w, y },
  { x, y: y + h },
  { x: x + w, y: y + h },
];

const centred = (w, h) => face({ x: 0.5 - w / 2, y: 0.5 - h / 2, w, h });

test('bounds are taken across every landmark', () => {
  assert.deepEqual(boundsOf(centred(0.4, 0.5)), {
    minX: 0.3,
    minY: 0.25,
    maxX: 0.7,
    maxY: 0.75,
  });
});

test('a normally framed face is accepted', () => {
  assert.equal(framingHint(centred(0.4, 0.5), 1), null);
});

test('a face on a cover-cropped portrait phone is accepted', () => {
  // The bug this replaces: the stream was forced to landscape and then
  // cover-cropped into a portrait stage, so a face filling the visible screen
  // measured only ~0.16 wide against the full frame and the old 0.18 floor
  // parked the user on "Come a bit closer" forever.
  assert.equal(framingHint(centred(0.16, 0.42), 1), null);
});

test('a forehead cropped by the top edge is still accepted', () => {
  // Normal when a phone is held close; it is not a reason to refuse the shot.
  assert.equal(framingHint(face({ x: 0.3, y: -0.04, w: 0.4, h: 0.5 }), 1), null);
});

test('a genuinely tiny face is asked to come closer', () => {
  assert.match(framingHint(centred(0.06, 0.08), 1), /closer/);
});

test('a face off at the edge is asked to centre', () => {
  assert.match(framingHint(face({ x: 0.86, y: 0.4, w: 0.2, h: 0.3 }), 1), /Center/);
});

test('a second face is a warning, not a rejection of the first', () => {
  assert.match(framingHint(centred(0.4, 0.5), 2), /one face/);
});

// --------------------------------------------------------------- hold timer

test('the hold completes on elapsed time, not on a frame count', () => {
  // The old rule wanted 22 consecutive good frames. At a phone's ~12fps that is
  // over two seconds; on a desktop at 60fps it is a third of one. Time is the
  // same everywhere.
  const hold = createHoldTimer();
  let now = 1000;

  hold.good(now);
  assert.equal(hold.isComplete(now), false);

  // Four slow frames — a phone's whole budget — still get there.
  for (const step of [120, 250, 300, 300]) {
    now += step;
    hold.good(now);
  }
  assert.ok(now - 1000 >= HOLD_MS);
  assert.equal(hold.isComplete(now), true);
});

test('a single bad frame does not restart the countdown', () => {
  const hold = createHoldTimer();
  let now = 0;

  hold.good(now);
  now += 800; // nearly there
  hold.good(now);

  now += 30; // one stray frame, well inside the grace window
  hold.bad(now);

  now += 100;
  hold.good(now);
  assert.equal(hold.isComplete(now), true, 'a blink should not cost the hold');
});

test('framing that stays bad does restart the countdown', () => {
  const hold = createHoldTimer();
  let now = 0;

  hold.good(now);
  now += 800;
  hold.good(now);

  // Look away for longer than the grace period.
  for (let i = 0; i < 5; i += 1) {
    now += GRACE_MS / 2;
    hold.bad(now);
  }

  now += 10;
  hold.good(now);
  assert.equal(hold.isComplete(now), false, 'the hold should have been abandoned');

  now += HOLD_MS;
  hold.good(now);
  assert.equal(hold.isComplete(now), true, 'and then start again cleanly');
});

test('the countdown only runs while the framing is good', () => {
  const hold = createHoldTimer();
  assert.equal(hold.remaining(0), HOLD_MS, 'nothing held yet');

  hold.good(0);
  assert.equal(hold.remaining(450), HOLD_MS - 450);
  assert.equal(hold.remaining(HOLD_MS + 500), 0, 'never goes negative');
});

test('reset abandons the hold outright', () => {
  const hold = createHoldTimer();
  hold.good(0);
  hold.reset();
  assert.equal(hold.isComplete(HOLD_MS * 2), false);
});
