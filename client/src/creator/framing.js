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

/**
 * Coerces landmarks into the [0,1] space the rest of the pipeline assumes.
 *
 * The task API documents normalized coordinates, and on desktop that is what
 * arrives. An Android WebView in the field returned pixel coordinates instead —
 * a face measured 1186 wide in a 1707px frame — which quietly broke everything
 * downstream at once: the framing rules compared 1186 against 0.98 and refused
 * the shot, the mesh was drawn about 1700x off-canvas so nothing appeared, and
 * the cutout multiplied by the frame size again and cropped nowhere near the
 * face.
 *
 * Normalized values can drift slightly outside [0,1] on a face at the frame
 * edge, but never past 1.5, so that is a safe line between the two.
 */
export function normalizeLandmarks(landmarks, frameWidth, frameHeight) {
  if (!landmarks?.length || !frameWidth || !frameHeight) return landmarks;

  let maxX = 0;
  let maxY = 0;
  for (const point of landmarks) {
    if (Number.isFinite(point.x) && point.x > maxX) maxX = point.x;
    if (Number.isFinite(point.y) && point.y > maxY) maxY = point.y;
  }
  if (maxX <= 1.5 && maxY <= 1.5) return landmarks;

  return landmarks.map((point) => ({
    ...point,
    x: point.x / frameWidth,
    y: point.y / frameHeight,
  }));
}

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

  // There is no "too close" rule. A large face is not a problem worth refusing
  // a photo over — the cutout crops to the face bounds anyway, so the worst
  // case is a tighter crop — and in the field this rule fired on faces that
  // filled barely half the frame, which nobody could act on.

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
