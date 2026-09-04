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
 * Bounds that a few bad landmarks cannot dictate.
 *
 * The detector on at least one Android browser returns a handful of wild
 * values among otherwise sane ones — a point at 794 where the rest sit between
 * 0.3 and 0.7. A plain min/max then describes the outliers rather than the
 * face, which is how a perfectly centred face came to report its centre at
 * (0.11, 0.02): the box was being stretched to the strays.
 *
 * Trimming a couple of percent from each end throws those away. A face mesh has
 * hundreds of points, so losing the extreme few costs nothing real.
 */
export function boundsOf(landmarks, trim = 0.02) {
  const xs = [];
  const ys = [];
  for (const point of landmarks) {
    if (Number.isFinite(point.x)) xs.push(point.x);
    if (Number.isFinite(point.y)) ys.push(point.y);
  }
  if (xs.length === 0 || ys.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const cut = (list) => Math.min(Math.floor(list.length * trim), Math.floor((list.length - 1) / 2));

  const cx = cut(xs);
  const cy = cut(ys);
  return {
    minX: xs[cx],
    maxX: xs[xs.length - 1 - cx],
    minY: ys[cy],
    maxY: ys[ys.length - 1 - cy],
  };
}

/** Raw extremes, for reporting what the detector actually produced. */
export function rawBoundsOf(landmarks) {
  return boundsOf(landmarks, 0);
}

/**
 * Coerces landmarks into the [0,1] space the rest of the pipeline assumes.
 *
 * The task API documents normalized coordinates and that is what desktop
 * returns. Judgement uses the trimmed bounds, not the raw maximum: keying off a
 * single stray value meant one outlier could convince this that a properly
 * normalized frame was in pixels, and dividing by the frame size then collapsed
 * every real landmark to near zero — which took the mesh, the crop and the
 * framing rules down together.
 */
export function normalizeLandmarks(landmarks, frameWidth, frameHeight) {
  if (!landmarks?.length || !frameWidth || !frameHeight) return landmarks;

  const { maxX, maxY } = boundsOf(landmarks);
  if (maxX <= 1.5 && maxY <= 1.5) return landmarks;

  return landmarks.map((point) => ({
    ...point,
    x: point.x / frameWidth,
    y: point.y / frameHeight,
  }));
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
/**
 * Whether a detection is physically possible.
 *
 * A face in front of the camera lands inside the frame, give or take an ear off
 * the edge. Landmarks strewn a third of a frame beyond it are not a badly
 * framed face, they are a detector returning noise — which is what a jumping
 * mesh looks like from the inside. The trimmed bounds are used so that one
 * stray point cannot condemn an otherwise good frame.
 */
export function isPlausible(landmarks) {
  if (!landmarks?.length) return false;
  const { minX, minY, maxX, maxY } = boundsOf(landmarks);
  const inFrame = (v) => v > -0.25 && v < 1.25;
  if (![minX, minY, maxX, maxY].every(inFrame)) return false;
  const width = maxX - minX;
  const height = maxY - minY;
  return width > 0.02 && height > 0.02;
}

/**
 * The part of a camera frame an `object-fit: cover` box actually shows.
 *
 * A 4:3 camera in a 3:4 box shows only the middle 56% of the picture, so a face
 * centred on screen is nowhere near centred in the frame the detector reads.
 * Returning the crop explicitly lets the preview, the mesh and the framing
 * advice all work in the coordinates the user can actually see.
 */
export function coverCrop(frameWidth, frameHeight, boxWidth, boxHeight) {
  if (!frameWidth || !frameHeight || !boxWidth || !boxHeight) return null;
  const scale = Math.max(boxWidth / frameWidth, boxHeight / frameHeight);
  const sw = Math.min(frameWidth, boxWidth / scale);
  const sh = Math.min(frameHeight, boxHeight / scale);
  return { sx: (frameWidth - sw) / 2, sy: (frameHeight - sh) / 2, sw, sh };
}

/** Re-normalizes landmarks against the visible crop rather than the full frame. */
export function toCropSpace(landmarks, crop, frameWidth, frameHeight) {
  if (!crop || !landmarks?.length) return landmarks;
  return landmarks.map((point) => ({
    ...point,
    x: (point.x * frameWidth - crop.sx) / crop.sw,
    y: (point.y * frameHeight - crop.sy) / crop.sh,
  }));
}

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
