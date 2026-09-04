import { faceOvalIndices } from './face-detector.js';
import { boundsOf } from './framing.js';

/**
 * Turns one video frame plus its landmarks into the face asset the fish wears
 * (spec FR-007, §9 steps 3-4).
 *
 * The cutout is masked to the detected face oval with a soft edge, cropped
 * square, and downscaled — so what we upload is a small derived image, never
 * the camera frame itself. The size is deliberately modest — the PNG is stored
 * as a row in the database, not as a file.
 */
export function cutOutFace(video, landmarks, { size = 384, padding = 0.18 } = {}) {
  const frameWidth = video.videoWidth;
  const frameHeight = video.videoHeight;
  if (!frameWidth || !frameHeight) {
    throw new Error('Camera frame is not ready yet');
  }

  const oval = faceOvalIndices()
    .map((index) => landmarks[index])
    .filter(Boolean)
    .map((point) => ({ x: point.x * frameWidth, y: point.y * frameHeight }));

  if (oval.length < 8) throw new Error('Face outline was incomplete');

  // The FACE_OVAL outline stops at the hairline; push the top out so the fish
  // gets a forehead instead of a shaved look.
  const centroid = oval.reduce(
    (acc, p) => ({ x: acc.x + p.x / oval.length, y: acc.y + p.y / oval.length }),
    { x: 0, y: 0 },
  );
  const grown = oval.map((point) => ({
    x: centroid.x + (point.x - centroid.x) * 1.06,
    y: centroid.y + (point.y - centroid.y) * (point.y < centroid.y ? 1.18 : 1.04),
  }));

  // Square crop around the face, with breathing room.
  const box = boundsOf(
    landmarks.map((p) => ({ x: p.x, y: p.y })),
  );
  const faceW = (box.maxX - box.minX) * frameWidth;
  const faceH = (box.maxY - box.minY) * frameHeight;
  const side = Math.max(faceW, faceH) * (1 + padding * 2);
  const cx = ((box.minX + box.maxX) / 2) * frameWidth;
  const cy = ((box.minY + box.maxY) / 2) * frameHeight;
  const left = cx - side / 2;
  const top = cy - side / 2;
  const scale = size / side;

  // 1. The frame, cropped.
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const ctx = out.getContext('2d');
  ctx.drawImage(video, left, top, side, side, 0, 0, size, size);

  // 2. A blurred white oval as the alpha mask, in the same coordinate space.
  const mask = document.createElement('canvas');
  mask.width = mask.height = size;
  const maskCtx = mask.getContext('2d');
  maskCtx.filter = `blur(${Math.round(size * 0.018)}px)`;
  maskCtx.fillStyle = '#fff';
  maskCtx.beginPath();
  grown.forEach((point, index) => {
    const x = (point.x - left) * scale;
    const y = (point.y - top) * scale;
    if (index === 0) maskCtx.moveTo(x, y);
    else maskCtx.lineTo(x, y);
  });
  maskCtx.closePath();
  maskCtx.fill();

  // 3. Keep only what the mask covers.
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  return {
    canvas: out,
    dataUrl: out.toDataURL('image/png'),
  };
}
