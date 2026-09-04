/**
 * Fills the default tank with demo fish so the aquarium has something in it
 * before any real friend shows up (spec AC-01).
 *
 * The faces are generated placeholders, not photographs — running this never
 * touches a camera and never invents a person.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createStore } from '../server/store.js';
import { faceDir } from '../server/db.js';
import { newId } from '../server/ids.js';
import { randomLook } from '../shared/fish-variants.js';
import { ACTIVITY_TYPES } from '../shared/activity-text.js';
import { config } from '../server/config.js';

const CAST = [
  { name: 'beandog', fullness: 22, skin: [244, 208, 176] },
  { name: 'clare', fullness: 68, skin: [232, 190, 158] },
  { name: 'shahruz', fullness: 91, skin: [198, 152, 112] },
  { name: 'midd', fullness: 47, skin: [166, 122, 88] },
  { name: 'dhof', fullness: 12, skin: [120, 86, 62] },
  { name: 'courtney', fullness: 79, skin: [250, 220, 196] },
];

function seed() {
  const store = createStore();
  const tank = store.defaultTank();

  const existing = new Set(
    store.fishOfTank(tank.id).map((fish) => fish.ownerName),
  );

  let added = 0;
  for (const member of CAST) {
    if (existing.has(member.name)) continue;

    const user = store.createUser(member.name);
    store.joinTank(tank.id, user.id);

    const fish = store.createFish({
      tankId: tank.id,
      ownerUserId: user.id,
      faceAssetUrl: writePlaceholderFace(member.skin),
      ...randomLook(),
    });
    store.setFullness(fish.id, member.fullness);

    store.recordActivity({
      tankId: tank.id,
      type: ACTIVITY_TYPES.JOINED,
      actorId: user.id,
      payload: { actorName: member.name },
    });
    added += 1;
  }

  if (added) {
    // A couple of log lines so the activity feed isn't blank on first paint.
    const [first, second] = store.members(tank.id);
    if (first && second) {
      store.recordActivity({
        tankId: tank.id,
        type: ACTIVITY_TYPES.PRESENCE,
        actorId: first.userId,
        payload: { actorName: first.displayName },
      });
      store.recordActivity({
        tankId: tank.id,
        type: ACTIVITY_TYPES.FED,
        actorId: second.userId,
        payload: { actorName: second.displayName, targetName: first.displayName },
      });
    }
  }

  console.log(
    `seeded ${added} fish into "${tank.name}" (invite code: ${tank.invite_code})`,
  );
  console.log(
    `fullness decays ${config.fullness.decayPerHour.toFixed(1)}/hour — ` +
      'the demo fish will get hungry on their own.',
  );
  store.close();
}

// ---------------------------------------------------------------------------

/**
 * Writes a tiny hand-rolled PNG: a flat skin-tone oval with two dots and a
 * mouth. Enough to read as "a face on a fish" without shipping any real photo
 * or pulling in an image library.
 */
function writePlaceholderFace([r, g, b]) {
  const size = 128;
  const raw = Buffer.alloc(size * (size * 4 + 1)); // +1 filter byte per row

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const i = rowStart + 1 + x * 4;
      const dx = (x - size / 2) / (size * 0.42);
      const dy = (y - size / 2) / (size * 0.5);
      const inFace = dx * dx + dy * dy <= 1;

      if (!inFace) continue;

      const eye =
        (Math.hypot(x - size * 0.37, y - size * 0.42) < 7) ||
        (Math.hypot(x - size * 0.63, y - size * 0.42) < 7);
      const mouth =
        Math.abs(y - size * 0.66) < 3 && Math.abs(x - size * 0.5) < size * 0.14;

      if (eye || mouth) {
        raw[i] = 40;
        raw[i + 1] = 32;
        raw[i + 2] = 30;
      } else {
        // Soft vertical shading so it isn't a dead flat blob.
        const shade = 1 - dy * 0.12;
        raw[i] = clamp8(r * shade);
        raw[i + 1] = clamp8(g * shade);
        raw[i + 2] = clamp8(b * shade);
      }
      raw[i + 3] = 255;
    }
  }

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr(size)),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  fs.mkdirSync(faceDir, { recursive: true });
  const name = `${newId('face')}.png`;
  fs.writeFileSync(path.join(faceDir, name), png);
  return `/assets/faces/${name}`;
}

function clamp8(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function ihdr(size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  return header;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return crc ^ -1;
}

seed();
