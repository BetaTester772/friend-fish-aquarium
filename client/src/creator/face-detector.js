import { DrawingUtils, FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

/**
 * MediaPipe Face Landmarker (spec FR-006, §9).
 *
 * Both the wasm runtime and the model are served from our own origin, so the
 * camera pipeline runs entirely in the browser and never calls a third-party
 * host — which is what lets us promise that raw video never leaves the device
 * (spec §12).
 */
let landmarkerPromise = null;

export function loadFaceLandmarker() {
  landmarkerPromise ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks('/mediapipe-wasm');
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: '/models/face_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 2, // enough to notice a second person in frame
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
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
 */
export function drawFaceMesh(ctx, landmarks) {
  const utils = new DrawingUtils(ctx);
  utils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
    color: 'rgba(255, 255, 255, 0.34)',
    lineWidth: 0.6,
  });
  utils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, {
    color: 'rgba(120, 231, 255, 0.95)',
    lineWidth: 2.5,
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
 * Is the face usable? Too small means "come closer", off the edge means the
 * cutout would be clipped. Returns a hint string when it isn't (spec §10).
 */
export function framingHint(landmarks, faceCount) {
  if (faceCount > 1) return 'Just one face please — using the closest one.';

  const { minX, minY, maxX, maxY } = boundsOf(landmarks);
  const width = maxX - minX;
  const height = maxY - minY;

  if (width < 0.18 || height < 0.22) return 'Come a bit closer.';
  if (width > 0.92 || height > 0.96) return 'A little further back.';
  if (minX < 0.02 || maxX > 0.98 || minY < 0.02 || maxY > 0.98) {
    return 'Center your face in the frame.';
  }
  return null;
}
