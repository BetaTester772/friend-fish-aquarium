/**
 * Copies the MediaPipe vision wasm runtime out of node_modules into
 * public/mediapipe-wasm so the face landmarker loads entirely from our own
 * origin — no third-party CDN, which keeps the camera pipeline self-contained
 * (spec §12). Vite then copies public/ into dist/ at build time.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const to = path.join(root, 'public/mediapipe-wasm');

if (!fs.existsSync(from)) {
  console.error('[copy-wasm] @mediapipe/tasks-vision is not installed; run npm install');
  process.exit(1);
}

fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(path.dirname(to), { recursive: true });
fs.cpSync(from, to, { recursive: true });
console.log(`[copy-wasm] ${path.relative(root, to)} <- @mediapipe/tasks-vision`);
