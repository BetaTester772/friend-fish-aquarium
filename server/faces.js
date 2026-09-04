import { config } from './config.js';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export class FaceAssetError extends Error {}

/**
 * Decodes and validates the face cutout the browser uploaded.
 *
 * Per spec §12 the raw camera stream never reaches the server: the client sends
 * a single already-masked PNG. We re-validate the magic bytes and the size
 * rather than trusting the declared MIME type. Returns bytes — the caller
 * decides where they are stored.
 */
export function decodeFaceAsset(dataUrl) {
  if (typeof dataUrl !== 'string') {
    throw new FaceAssetError('faceImage must be a data URL string');
  }
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) {
    throw new FaceAssetError('faceImage must be a base64 image/png data URL');
  }

  let bytes;
  try {
    bytes = base64ToBytes(match[1]);
  } catch {
    throw new FaceAssetError('faceImage is not valid base64');
  }

  if (bytes.length > config.faceAsset.maxBytes) {
    throw new FaceAssetError(
      `faceImage is too large (max ${Math.round(config.faceAsset.maxBytes / 1024)} KB)`,
    );
  }
  if (!PNG_MAGIC.every((byte, i) => bytes[i] === byte)) {
    throw new FaceAssetError('faceImage is not a PNG');
  }
  return bytes;
}

/** `atob` rather than `Buffer`, to keep this module free of Node built-ins. */
function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Stored faces are immutable and addressed by a random id. */
export const faceAssetUrl = (assetId) => `/faces/${assetId}.png`;

export function faceAssetIdFromUrl(url) {
  const match = /^\/faces\/(face_[a-z0-9]+)\.png$/.exec(url ?? '');
  return match ? match[1] : null;
}
