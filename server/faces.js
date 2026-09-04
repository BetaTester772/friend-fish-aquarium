import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { faceDir } from './db.js';
import { newId } from './ids.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class FaceAssetError extends Error {}

/**
 * Stores the *derived* face cutout only.
 *
 * Per spec §12 the raw camera stream never reaches the server: the client sends
 * a small, already-masked PNG. We re-validate the magic bytes and size rather
 * than trusting the declared MIME type.
 */
export function saveFaceAsset(dataUrl) {
  if (typeof dataUrl !== 'string') {
    throw new FaceAssetError('faceImage must be a data URL string');
  }
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) {
    throw new FaceAssetError('faceImage must be a base64 image/png data URL');
  }

  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.length > config.faceAsset.maxBytes) {
    throw new FaceAssetError('faceImage is too large');
  }
  if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new FaceAssetError('faceImage is not a PNG');
  }

  fs.mkdirSync(faceDir, { recursive: true });
  const name = `${newId('face')}.png`;
  fs.writeFileSync(path.join(faceDir, name), bytes);
  return `/assets/faces/${name}`;
}
