import * as THREE from 'three';

/**
 * Procedural canvas textures. Keeping the tank asset-free means no image
 * downloads, no CDN, and a first frame that never waits on the network.
 *
 * The look copies the Reel: a chunky stone-block back wall, pale sand, and a
 * sky above the waterline.
 */

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return { canvas, ctx: canvas.getContext('2d') };
}

function toTexture(canvas, { repeat = [1, 1], anisotropy = 4 } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = anisotropy;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Offset brickwork, low contrast so the fish stay the focus. */
export function stoneWallTexture() {
  const { canvas, ctx } = makeCanvas(256);
  ctx.fillStyle = '#8d9a92';
  ctx.fillRect(0, 0, 256, 256);

  const rows = 8;
  const cols = 4;
  const h = 256 / rows;
  const w = 256 / cols;

  for (let row = 0; row < rows; row += 1) {
    const offset = row % 2 ? w / 2 : 0;
    for (let col = -1; col < cols + 1; col += 1) {
      const shade = 0.82 + Math.random() * 0.3;
      const value = Math.floor(146 * shade);
      ctx.fillStyle = `rgb(${value - 6}, ${value + 4}, ${value - 2})`;
      ctx.fillRect(col * w + offset + 2, row * h + 2, w - 4, h - 4);
    }
  }

  // A few darker blocks, like the mossy ones in the Reel.
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 26; i += 1) {
    ctx.fillStyle = '#3d4b45';
    ctx.fillRect(
      Math.floor(Math.random() * cols) * w + (Math.random() < 0.5 ? w / 2 : 0),
      Math.floor(Math.random() * rows) * h,
      w,
      h,
    );
  }
  ctx.globalAlpha = 1;

  return toTexture(canvas, { repeat: [4, 2] });
}

/** Speckled sand for the tank floor. */
export function sandTexture() {
  const { canvas, ctx } = makeCanvas(256);
  ctx.fillStyle = '#e5d5a8';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 2600; i += 1) {
    const light = Math.random() < 0.5;
    ctx.fillStyle = light
      ? 'rgba(255, 249, 226, 0.55)'
      : 'rgba(176, 156, 108, 0.4)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }

  return toTexture(canvas, { repeat: [6, 6] });
}

/** Sky + clouds seen above the waterline. */
export function skyTexture() {
  const { canvas, ctx } = makeCanvas(512);

  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#4ea8e0');
  sky.addColorStop(0.62, '#9ed4ef');
  sky.addColorStop(1, '#d9eef8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  for (let cloud = 0; cloud < 7; cloud += 1) {
    const cx = Math.random() * 512;
    const cy = 90 + Math.random() * 200;
    const scale = 0.6 + Math.random() * 0.9;
    for (let puff = 0; puff < 6; puff += 1) {
      ctx.beginPath();
      ctx.arc(
        cx + (puff - 2.5) * 26 * scale,
        cy + Math.sin(puff) * 12 * scale,
        (26 + Math.random() * 18) * scale,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  return toTexture(canvas, { repeat: [1, 1] });
}

/**
 * Turns a face cutout PNG into a texture. Returns a promise so the caller can
 * hold the fish back until the face is actually decodable.
 */
export function loadFaceTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        resolve(texture);
      },
      undefined,
      () => reject(new Error(`Could not load face texture: ${url}`)),
    );
  });
}
