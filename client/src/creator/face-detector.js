import { DrawingUtils, FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { boundsOf } from './framing.js';

/**
 * MediaPipe Face Landmarker (spec FR-006, §9).
 *
 * Both the wasm runtime and the model are served from our own origin, so the
 * camera pipeline runs entirely in the browser and never calls a third-party
 * host — which is what lets us promise that raw video never leaves the device
 * (spec §12).
 */
let landmarkerPromise = null;

/** Which delegate we ended up on, for the analytics event. */
export let activeDelegate = null;

function createWith(fileset, delegate) {
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: '/models/face_landmarker.task',
      delegate,
    },
    runningMode: 'VIDEO',
    numFaces: 2, // enough to notice a second person in frame
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}

/**
 * The GPU delegate needs working WebGL2. Plenty of real devices do not have it
 * — older Android, a browser with hardware acceleration switched off, a locked
 * down Firefox — and there the GPU path throws on creation. Falling back to CPU
 * is slower but it works, which beats telling someone their browser is not good
 * enough.
 */
export function loadFaceLandmarker() {
  landmarkerPromise ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks('/mediapipe-wasm');
    try {
      const landmarker = await createWith(fileset, 'GPU');
      activeDelegate = 'GPU';
      return landmarker;
    } catch (err) {
      console.warn('[ffa] GPU face detection unavailable, falling back to CPU', err);
      const landmarker = await createWith(fileset, 'CPU');
      activeDelegate = 'CPU';
      return landmarker;
    }
  })().catch((err) => {
    landmarkerPromise = null; // let a retry re-attempt the load
    throw err;
  });

  return landmarkerPromise;
}

/** Ordered outline of the face, derived from the model's FACE_OVAL connections. */
export function faceOvalIndices() {
  const connections = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
  const next = new Map(connections.map((c) => [c.start, c.end]));

  const start = connections[0].start;
  const ordered = [start];
  let current = next.get(start);
  while (current !== undefined && current !== start && ordered.length < 200) {
    ordered.push(current);
    current = next.get(current);
  }
  return ordered;
}

/**
 * Draws the wireframe mesh over the live preview — the visual cue from the Reel
 * that tells the user the app has actually found their face (spec S3).
 *
 * Line widths are in canvas-bitmap pixels, and the bitmap is the camera's full
 * resolution while the element is only as wide as the phone. At 1280 bitmap
 * pixels shown across 390 CSS pixels, a 0.6px line renders as 0.18px — which is
 * to say, invisible, which is exactly what people reported. `coverScale` is the
 * screen pixels per bitmap pixel, so dividing by it keeps the strokes a fixed
 * width on screen no matter the camera resolution.
 *
 * @param {number} coverScale screen px per bitmap px, from the cover fit
 */
export function drawFaceMesh(ctx, landmarks, coverScale = 1) {
  const px = (cssPixels) => cssPixels / (coverScale || 1);
  const utils = new DrawingUtils(ctx);

  utils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
    color: 'rgba(255, 255, 255, 0.4)',
    lineWidth: px(0.7),
  });
  utils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, {
    color: 'rgba(120, 231, 255, 0.95)',
    lineWidth: px(3),
  });
}

/**
 * Picks the face to use when several are in frame: the biggest one, i.e. the
 * person actually holding the phone (spec §10 "Multiple faces").
 */
export function primaryFace(faceLandmarks) {
  if (!faceLandmarks?.length) return null;
  let best = null;
  let bestArea = 0;
  for (const landmarks of faceLandmarks) {
    const box = boundsOf(landmarks);
    const area = (box.maxX - box.minX) * (box.maxY - box.minY);
    if (area > bestArea) {
      bestArea = area;
      best = landmarks;
    }
  }
  return best;
}


