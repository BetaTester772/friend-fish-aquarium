/**
 * Framing rules and the auto-capture hold.
 *
 * Deliberately free of any import: this is the logic that decides whether the
 * shutter fires, it broke in the field, and it should be testable without a
 * browser or a camera.
 */

/** How long the face has to stay well framed before we capture on our own. */
export const HOLD_MS = 900;

/** A blink or a wobble should not restart the countdown. */
export const GRACE_MS = 350;

export function boundsOf(landmarks) {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const point of landmarks) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Is the face usable? Returns a hint string when it isn't (spec §10).
 *
 * The thresholds are deliberately loose. They were tight enough before that a
 * phone could sit on "Come a bit closer" forever: the stream was being forced
 * to landscape and then displayed cover-cropped into a portrait box, so a face
 * filling the visible screen still measured small against the full frame.
 *
 * Position is judged by the centre of the face rather than its bounding box,
 * because a forehead cropped by the top edge is normal on a phone held close
 * and is not a reason to refuse the shot.
 *
 * There is deliberately no "too many faces" rule. One used to live here and it
 * blocked the shutter outright, so a single spurious detection — which the
 * detector produced routinely — left people holding still in front of a camera
 * that was never going to fire. The detector is now asked for one face and we
 * use it.
 */
export function framingHint(landmarks) {
  const { minX, minY, maxX, maxY } = boundsOf(landmarks);
  const width = maxX - minX;
  const height = maxY - minY;

  if (width < 0.12 && height < 0.15) return 'Come a bit closer.';
  if (width > 0.98 || height > 1.05) return 'A little further back.';

  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  if (centreX < 0.15 || centreX > 0.85 || centreY < 0.12 || centreY > 0.88) {
    return 'Center your face in the frame.';
  }
  return null;
}

/**
 * Tracks how long the framing has been good.
 *
 * This used to be a count of consecutive good frames, which is not the same
 * thing: 22 frames is a third of a second on a desktop at 60fps, but well over
 * two seconds on a phone where each inference costs 60-100ms — and one bad
 * frame reset it to zero. Wall-clock time behaves the same on every device, and
 * the grace period stops a single stray frame from restarting a countdown the
 * user was nearly through.
 */
export function createHoldTimer({ holdMs = HOLD_MS, graceMs = GRACE_MS } = {}) {
  let goodSince = null;
  let badSince = null;

  return {
    /** A well-framed frame. @returns {number} ms held so far */
    good(now) {
      badSince = null;
      goodSince ??= now;
      return now - goodSince;
    },

    /** A badly framed frame, or no face at all. */
    bad(now) {
      badSince ??= now;
      if (now - badSince > graceMs) goodSince = null;
    },

    isComplete: (now) => goodSince !== null && now - goodSince >= holdMs,

    /** Whole seconds-ish remaining, for the on-screen countdown. */
    remaining: (now) =>
      goodSince === null ? holdMs : Math.max(0, holdMs - (now - goodSince)),

    reset() {
      goodSince = null;
      badSince = null;
    },
  };
}
