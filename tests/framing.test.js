import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHoldTimer,
  framingHint,
  isPlausible,
  coverCrop,
  toCropSpace,
  boundsOf,
  rawBoundsOf,
  normalizeLandmarks,
  HOLD_MS,
  GRACE_MS,
} from '../client/src/creator/framing.js';

/** A realistic mesh: many points across the face, plus optional strays. */
const mesh = ({ x, y, w, h, points = 468, strays = [] }) => {
  const grid = Array.from({ length: points }, (_, i) => ({
    x: x + (w * ((i * 37) % 100)) / 100,
    y: y + (h * ((i * 53) % 100)) / 100,
  }));
  return [...grid, ...strays];
};

/** A rectangular blob of landmarks, in the normalized frame coordinates. */
const face = ({ x, y, w, h }) => [
  { x, y },
  { x: x + w, y },
  { x, y: y + h },
  { x: x + w, y: y + h },
];

const centred = (w, h) => face({ x: 0.5 - w / 2, y: 0.5 - h / 2, w, h });

test('a few wild landmarks do not get to define the face', () => {
  // One Android browser returns a handful of extreme values among sane ones.
  // Plain min/max then described the strays: a centred face reported its centre
  // at (0.11, 0.02), the crop went off-frame and the cutout came back empty.
  const centredFace = { x: 0.3, y: 0.25, w: 0.4, h: 0.5 };
  const clean = mesh(centredFace);
  const dirty = mesh({
    ...centredFace,
    strays: [{ x: 794, y: -449 }, { x: -392, y: 492 }, { x: 1200, y: 1200 }],
  });

  const good = boundsOf(clean);
  const trimmed = boundsOf(dirty);
  for (const key of ['minX', 'maxX', 'minY', 'maxY']) {
    assert.ok(
      Math.abs(trimmed[key] - good[key]) < 0.02,
      `${key}: strays moved it from ${good[key]} to ${trimmed[key]}`,
    );
  }

  // Untrimmed, the same input is nonsense — which is what shipped.
  const raw = rawBoundsOf(dirty);
  assert.equal(raw.maxX, 1200, 'the worst stray defines the raw edge');
  assert.equal(raw.minY, -449);
  assert.ok(raw.maxX - raw.minX > 1500, 'a face 0.4 wide measured over 1500');

  // And the framing rules now see a perfectly ordinary face.
  assert.equal(framingHint(dirty), null);
  assert.match(framingHint(mesh({ ...centredFace, x: -0.2 })), /Center/);
});

test('normalizing is not fooled into scaling a good frame by one stray', () => {
  // Keying the pixels-or-normalized decision off the raw maximum meant a single
  // outlier divided every real landmark by the frame size, collapsing the whole
  // mesh to near zero.
  const dirty = mesh({ x: 0.3, y: 0.25, w: 0.4, h: 0.5, strays: [{ x: 900, y: 900 }] });
  const out = normalizeLandmarks(dirty, 1707, 1280);
  assert.equal(out, dirty, 'already normalized: leave it alone');

  // Genuine pixel coordinates are still converted.
  const inPixels = mesh({ x: 300, y: 250, w: 700, h: 900 });
  const fixed = normalizeLandmarks(inPixels, 1707, 1280);
  assert.notEqual(fixed, inPixels);
  assert.ok(boundsOf(fixed).maxX <= 1);
});

test('bounds are taken across every landmark', () => {
  assert.deepEqual(rawBoundsOf(centred(0.4, 0.5)), {
    minX: 0.3,
    minY: 0.25,
    maxX: 0.7,
    maxY: 0.75,
  });
});

test('pixel-coordinate landmarks are brought back into [0,1]', () => {
  // An Android WebView returned pixel coordinates where the API documents
  // normalized ones. Everything downstream assumes [0,1]: the framing rules
  // compared 1186 against 0.98 and refused the shot, the mesh was drawn far
  // off-canvas, and the cutout multiplied by the frame size a second time.
  const inPixels = face({ x: 260, y: 170, w: 1186, h: 940 });
  const fixed = normalizeLandmarks(inPixels, 1707, 1280);

  const { minX, maxX, minY, maxY } = boundsOf(fixed);
  assert.ok(Math.abs(minX - 260 / 1707) < 1e-9);
  assert.ok(Math.abs(maxX - 1446 / 1707) < 1e-9);
  assert.ok(Math.abs(minY - 170 / 1280) < 1e-9);
  assert.ok(Math.abs(maxY - 1110 / 1280) < 1e-9);

  // And the framing rules now agree it is a perfectly good face.
  assert.equal(framingHint(fixed), null);
  assert.match(framingHint(inPixels), /Center|back/, 'raw pixels would be refused');
});

test('already-normalized landmarks are left exactly as they are', () => {
  const normalized = centred(0.4, 0.5);
  assert.equal(normalizeLandmarks(normalized, 1707, 1280), normalized);

  // A face at the very edge can drift just past 1 without being pixels.
  const edge = face({ x: 0.9, y: 0.9, w: 0.15, h: 0.15 });
  assert.equal(normalizeLandmarks(edge, 1280, 960), edge);
});

test('normalizing copes with missing inputs rather than throwing', () => {
  assert.equal(normalizeLandmarks([], 1280, 960).length, 0);
  assert.equal(normalizeLandmarks(null, 1280, 960), null);
  const pts = centred(0.4, 0.5);
  assert.equal(normalizeLandmarks(pts, 0, 0), pts, 'no frame size yet');
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

test('a large face is not refused for being too close', () => {
  // This rule fired in the field on a face filling barely half the frame, and
  // there was nothing the person could do about it. A big face is not a problem
  // worth refusing a photo over: the cutout crops to the face bounds anyway.
  assert.equal(framingHint(centred(0.9, 0.95)), null);
  assert.equal(framingHint(face({ x: 0.02, y: 0.02, w: 0.96, h: 0.96 })), null);
});

test('a genuinely tiny face is asked to come closer', () => {
  assert.match(framingHint(centred(0.06, 0.08), 1), /closer/);
});

test('a face off at the edge is asked to centre', () => {
  assert.match(framingHint(face({ x: 0.86, y: 0.4, w: 0.2, h: 0.3 }), 1), /Center/);
});

test('a well-framed face is never refused for being "too many faces"', () => {
  // A spurious second detection used to block the shutter outright, which left
  // people holding still in front of a camera that would never fire. The
  // detector is asked for one face now, and framing says nothing about count.
  assert.equal(framingHint(centred(0.4, 0.5), 2), null);
  assert.equal(framingHint(centred(0.4, 0.5)), null);
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

test('a face in the frame is a possible detection', () => {
  assert.equal(isPlausible(mesh({ x: 0.3, y: 0.25, w: 0.4, h: 0.45 })), true);
  assert.equal(
    isPlausible(mesh({ x: 0.05, y: 0.1, w: 0.3, h: 0.35 })),
    true,
    'off to one side is still a face',
  );
  assert.equal(
    isPlausible(mesh({ x: -0.08, y: 0.1, w: 0.4, h: 0.4 })),
    true,
    'an ear over the edge of the picture is normal',
  );
});

test('landmarks strewn outside the picture are the detector, not the framing', () => {
  // The shape a jumping mesh reports: centred at 0.11, 0.02 and two-thirds of
  // the frame wide, which puts a third of it off the left and top edges.
  const nonsense = mesh({ x: -0.235, y: -0.345, w: 0.69, h: 0.73 });
  assert.equal(isPlausible(nonsense), false);
  assert.equal(isPlausible(null), false);
  assert.equal(isPlausible([]), false);
});

test('a stray point or two does not condemn a good frame', () => {
  const withStrays = mesh({
    x: 0.3,
    y: 0.25,
    w: 0.4,
    h: 0.45,
    strays: [{ x: -4, y: -3 }, { x: 9, y: 8 }],
  });
  assert.equal(isPlausible(withStrays), true, 'the trim absorbs them');
});

test('a landscape camera in a portrait box shows only the middle of the picture', () => {
  // The phone: a 1707x1280 frame in the creator's 3:4 stage.
  const crop = coverCrop(1707, 1280, 254, 338);
  assert.equal(Math.round(crop.sh), 1280, 'the full height is visible');
  assert.equal(Math.round(crop.sw), 962, 'a bit over half the width is');
  assert.equal(Math.round(crop.sx), 373, 'cropped evenly from both sides');
  assert.equal(crop.sy, 0);
});

test('a frame the same shape as the box is not cropped at all', () => {
  const crop = coverCrop(480, 640, 255, 340); // both exactly 3:4
  assert.equal(crop.sx, 0);
  assert.equal(crop.sy, 0);
  assert.equal(crop.sw, 480);
  assert.equal(crop.sh, 640);
});

test('coverCrop has nothing to say about a frame that is not ready', () => {
  assert.equal(coverCrop(0, 0, 254, 338), null);
  assert.equal(coverCrop(1707, 1280, 0, 0), null);
});

test('the visible face is centred even when the frame says otherwise', () => {
  const crop = coverCrop(1707, 1280, 254, 338);
  // Dead centre of the picture on screen is dead centre of the frame.
  const [middle] = toCropSpace([{ x: 0.5, y: 0.5 }], crop, 1707, 1280);
  assert.ok(Math.abs(middle.x - 0.5) < 1e-9);
  assert.ok(Math.abs(middle.y - 0.5) < 1e-9);

  // But a face at the left edge of the frame is off-screen entirely, which is
  // the difference the framing advice was blind to.
  const [edge] = toCropSpace([{ x: 0.15, y: 0.5 }], crop, 1707, 1280);
  assert.ok(edge.x < 0, `frame x 0.15 is off the visible picture, got ${edge.x}`);
});

test('framing advice reads the visible picture, not the discarded frame', () => {
  const crop = coverCrop(1707, 1280, 254, 338);
  // A face filling a third of the frame's width fills over half the screen.
  const face = mesh({ x: 0.34, y: 0.25, w: 0.32, h: 0.45 });
  const shown = toCropSpace(face, crop, 1707, 1280);
  const box = boundsOf(shown);
  assert.ok(box.maxX - box.minX > 0.5, 'wider on screen than in the frame');
  assert.equal(framingHint(shown), null, 'and so it is close enough');
});
