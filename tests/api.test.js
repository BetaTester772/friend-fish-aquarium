import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

// The sqlite adapter resolves its data directory at import time.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffa-test-'));
process.env.FFA_DATA_DIR = tmpDir;

const { createNodeApp } = await import('../server/node.js');
const { config } = await import('../server/config.js');

let dbCounter = 0;

/**
 * Boots the Node adapter on an ephemeral port with its own database file and
 * returns a small cookie-aware client. Pass the same `db` name twice to
 * simulate a restart against the same data.
 */
async function boot({ db = `test-${(dbCounter += 1)}` } = {}) {
  const app = createNodeApp({ file: path.join(tmpDir, `${db}.db`) });
  app.server.listen(0);
  await new Promise((resolve) => app.server.once('listening', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;

  const makeClient = () => {
    let cookie = null;
    return async function call(method, url, body) {
      const res = await fetch(`${base}${url}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const text = await res.text();
      return {
        status: res.status,
        headers: res.headers,
        body: text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text,
      };
    };
  };

  return {
    base,
    store: app.store,
    client: makeClient(),
    newClient: makeClient,
    async close() {
      app.realtime.close();
      await new Promise((resolve) => app.server.close(resolve));
      app.db.close();
    },
  };
}

/** A minimal valid 1x1 PNG data URL — enough to pass the asset validator. */
function tinyPngDataUrl() {
  const raw = Buffer.from([0, 255, 0, 0, 255]); // filter byte + one RGBA pixel
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crcBuf]);
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

/** Signs in a fresh client and puts a fish in the tank for it. */
async function joinWithFish(app, tankId, name) {
  const client = app.newClient();
  await client('POST', '/api/session', { displayName: name });
  const created = await client('POST', `/api/tanks/${tankId}/fish`, {
    faceImage: tinyPngDataUrl(),
  });
  return { client, fish: created.body.fish };
}

const defaultTank = async (app) => (await app.client('GET', '/api/tanks/default')).body.tank;

test('a visitor with no session can still see the tank (AC-01)', async (t) => {
  const app = await boot();
  t.after(() => app.close());

  const { status, body } = await app.client('GET', '/api/tanks/default');
  assert.equal(status, 200);
  assert.ok(body.tank.id);
  assert.equal(body.viewer, null);
  assert.deepEqual(body.fish, []);
  assert.ok(body.rules.fullness.fullThreshold);
});

test('signing in with a name creates a session (FR-011)', async (t) => {
  const app = await boot();
  t.after(() => app.close());

  const bad = await app.client('POST', '/api/session', { displayName: '  ' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'invalid_name');

  const ok = await app.client('POST', '/api/session', { displayName: 'clare' });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.user.displayName, 'clare');

  const session = await app.client('GET', '/api/session');
  assert.equal(session.body.user.displayName, 'clare');
});

test('adding a fish needs a session and shows up in the tank (FR-009, AC-06)', async (t) => {
  const app = await boot();
  t.after(() => app.close());

  const tank = await defaultTank(app);

  const anonymous = await app.client('POST', `/api/tanks/${tank.id}/fish`, {
    faceImage: tinyPngDataUrl(),
  });
  assert.equal(anonymous.status, 401);

  const { fish } = await joinWithFish(app, tank.id, 'beandog');
  assert.equal(fish.ownerName, 'beandog');
  assert.equal(fish.fullness, config.fullness.initial);
  assert.match(fish.faceAssetUrl, /^\/faces\/face_\w+\.png$/);

  const after = (await app.client('GET', `/api/tanks/${tank.id}`)).body;
  assert.equal(after.fish.length, 1);
  assert.equal(after.activity.at(-1).type, 'joined');
});

test('the stored face is served back as a PNG', async (t) => {
  const app = await boot();
  t.after(() => app.close());

  const tank = await defaultTank(app);
  const { fish } = await joinWithFish(app, tank.id, 'beandog');

  const res = await fetch(`${app.base}${fish.faceAssetUrl}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);

  const missing = await fetch(`${app.base}/faces/face_nope.png`);
  assert.equal(missing.status, 404);
});

test('a non-PNG face asset is rejected and nothing is stored', async (t) => {
  const app = await boot();
  t.after(() => app.close());

  const tank = await defaultTank(app);
  await app.client('POST', '/api/session', { displayName: 'midd' });

  const res = await app.client('POST', `/api/tanks/${tank.id}/fish`, {
    faceImage: 'data:image/png;base64,bm90IGEgcG5n',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'invalid_face_image');
  assert.equal((await app.client('GET', `/api/tanks/${tank.id}`)).body.fish.length, 0);
});

test('re-creating a fish replaces the old one rather than adding a second', async (t) => {
  const app = await boot();
  t.after(() => app.close());

  const tank = await defaultTank(app);
  const { client, fish } = await joinWithFish(app, tank.id, 'dhof');

  const again = await client('POST', `/api/tanks/${tank.id}/fish`, {
    faceImage: tinyPngDataUrl(),
  });
  assert.equal(again.status, 201);
  assert.notEqual(again.body.fish.id, fish.id);

  const after = (await app.client('GET', `/api/tanks/${tank.id}`)).body;
  assert.equal(after.fish.length, 1, 'one fish per user per tank');

  // The replaced fish's face image goes with it.
  assert.equal((await fetch(`${app.base}${fish.faceAssetUrl}`)).status, 404);
});

test('feeding a friend raises fullness and logs it (FR-012, FR-013, AC-08)', async (t) => {
  const app = await boot();
  t.after(() => app.close());

  const tank = await defaultTank(app);
  const target = await joinWithFish(app, tank.id, 'beandog');
  const actor = await joinWithFish(app, tank.id, 'clare');

  // Start the target hungry so the feed is definitely accepted.
  await app.store.setFullness(target.fish.id, 10);

  let accepted = null;
  // The ignore roll is probabilistic, so retry past the cooldown until one lands.
  for (let attempt = 0; attempt < 40 && !accepted; attempt += 1) {
    await app.store.db.run('DELETE FROM interactions WHERE target_fish_id = ?', [
      target.fish.id,
    ]);
    const res = await actor.client('POST', `/api/fish/${target.fish.id}/feed`);
    if (res.body.result === 'accepted') accepted = res.body;
  }

  assert.ok(accepted, 'a feed should be accepted within 40 attempts');
  assert.ok(accepted.fish.fullness > 10);

  const { activity } = (await app.client('GET', `/api/tanks/${tank.id}/activity`)).body;
  const fed = activity.filter((event) => event.type === 'fed');
  assert.ok(fed.length >= 1);
  assert.equal(fed.at(-1).payload.actorName, 'clare');
  assert.equal(fed.at(-1).payload.targetName, 'beandog');
});

test('a full fish rejects food and the log says so (FR-014, AC-09)', async (t) => {
  const app = await boot();
  t.after(() => app.close());

  const tank = await defaultTank(app);
  const target = await joinWithFish(app, tank.id, 'shahruz');
  const actor = await joinWithFish(app, tank.id, 'courtney');

  await app.store.setFullness(target.fish.id, config.fullness.max);

  const res = await actor.client('POST', `/api/fish/${target.fish.id}/feed`);
  assert.equal(res.status, 200);
  assert.equal(res.body.result, 'full');
  assert.equal(res.body.fish.fullness, config.fullness.max);

  const { activity } = (await app.client('GET', `/api/tanks/${tank.id}/activity`)).body;
  const full = activity.filter((event) => event.type === 'full');
  assert.ok(full.length >= 1);
  assert.equal(full.at(-1).payload.targetName, 'shahruz');
});

test('a rapid second feed is rate limited (spec §10)', async (t) => {
  const app = await boot();
  t.after(() => app.close());

  const tank = await defaultTank(app);
  const target = await joinWithFish(app, tank.id, 'beandog');
  const actor = await joinWithFish(app, tank.id, 'clare');
  await app.store.setFullness(target.fish.id, 10);

  const first = await actor.client('POST', `/api/fish/${target.fish.id}/feed`);
  assert.ok(['accepted', 'ignored'].includes(first.body.result));

  const second = await actor.client('POST', `/api/fish/${target.fish.id}/feed`);
  assert.equal(second.status, 429);
  assert.equal(second.body.result, 'cooldown');
  assert.ok(second.body.retryAfterMs > 0);
});

test('feeding a fish that no longer exists fails safely', async (t) => {
  const app = await boot();
  t.after(() => app.close());

  const tank = await defaultTank(app);
  const actor = await joinWithFish(app, tank.id, 'clare');

  const res = await actor.client('POST', '/api/fish/fsh_missing/feed');
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'fish_not_found');
});

test('you can only delete your own fish (FR-020)', async (t) => {
  const app = await boot();
  t.after(() => app.close());

  const tank = await defaultTank(app);
  const mine = await joinWithFish(app, tank.id, 'beandog');
  const other = await joinWithFish(app, tank.id, 'clare');

  const forbidden = await other.client('DELETE', `/api/fish/${mine.fish.id}`);
  assert.equal(forbidden.status, 403);
  assert.equal((await fetch(`${app.base}${mine.fish.faceAssetUrl}`)).status, 200);

  const removed = await mine.client('DELETE', `/api/fish/${mine.fish.id}`);
  assert.equal(removed.status, 204);
  assert.equal(
    (await fetch(`${app.base}${mine.fish.faceAssetUrl}`)).status,
    404,
    'the face image is deleted with the fish',
  );
});

test('deleting the account removes the fish, the image and the session (AC-11)', async (t) => {
  const app = await boot();
  t.after(() => app.close());

  const tank = await defaultTank(app);
  const { client, fish } = await joinWithFish(app, tank.id, 'beandog');

  const res = await client('DELETE', '/api/me');
  assert.equal(res.status, 204);
  assert.equal((await fetch(`${app.base}${fish.faceAssetUrl}`)).status, 404);
  assert.equal((await app.client('GET', `/api/tanks/${tank.id}`)).body.fish.length, 0);
  assert.equal((await client('GET', '/api/session')).body.user, null);
  assert.deepEqual(
    (await app.client('GET', `/api/tanks/${tank.id}`)).body.members,
    [],
    'membership goes too',
  );
});

test('presence announces once, then goes quiet (FR-019)', async (t) => {
  const app = await boot();
  t.after(() => app.close());

  const tank = await defaultTank(app);
  await app.client('POST', '/api/session', { displayName: 'beandog' });

  const first = await app.client('POST', `/api/tanks/${tank.id}/presence`);
  assert.equal(first.body.announced, true);

  const second = await app.client('POST', `/api/tanks/${tank.id}/presence`);
  assert.equal(second.body.announced, false, 'heartbeats do not spam the log');

  const { activity } = (await app.client('GET', `/api/tanks/${tank.id}/activity`)).body;
  const presence = activity.filter((event) => event.type === 'presence');
  assert.equal(presence.length, 1);
  assert.equal(presence[0].payload.actorName, 'beandog');
});

test('the tank and its fish survive a restart (FR-017, AC-10)', async (t) => {
  const app = await boot({ db: 'restart' });
  const tank = await defaultTank(app);
  const { fish } = await joinWithFish(app, tank.id, 'beandog');
  await app.store.setFullness(fish.id, 33);
  await app.close();

  const restarted = await boot({ db: 'restart' });
  t.after(() => restarted.close());

  const after = (await restarted.client('GET', `/api/tanks/${tank.id}`)).body;
  assert.equal(after.fish.length, 1);
  assert.equal(after.fish[0].id, fish.id);
  assert.ok(Math.abs(after.fish[0].fullness - 33) < 1);
  assert.equal(
    (await fetch(`${restarted.base}${fish.faceAssetUrl}`)).status,
    200,
    'the face image survives too',
  );
});

test('the default tank is stable across concurrent first requests', async (t) => {
  const app = await boot();
  t.after(() => app.close());

  const results = await Promise.all(
    Array.from({ length: 6 }, () => app.client('GET', '/api/tanks/default')),
  );
  const ids = new Set(results.map((r) => r.body.tank.id));
  assert.equal(ids.size, 1, 'every caller sees the same tank');
});

test('the invite code opens the same tank', async (t) => {
  const app = await boot();
  t.after(() => app.close());

  const tank = await defaultTank(app);
  const byInvite = await app.client('GET', `/api/tanks/by-invite/${tank.inviteCode}`);
  assert.equal(byInvite.status, 200);
  assert.equal(byInvite.body.tank.id, tank.id);

  const missing = await app.client('GET', '/api/tanks/by-invite/nope');
  assert.equal(missing.status, 404);
});

test('realtime subscribers receive fish and activity events (FR-018)', async (t) => {
  const app = await boot();
  t.after(() => app.close());

  const tank = await defaultTank(app);

  const controller = new AbortController();
  const stream = await fetch(`${app.base}/api/tanks/${tank.id}/events`, {
    signal: controller.signal,
  });
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);

  const reader = stream.body.getReader();
  const decoder = new TextDecoder();

  // Give the subscription a moment to register before triggering an event.
  await new Promise((resolve) => setTimeout(resolve, 50));
  await joinWithFish(app, tank.id, 'beandog');

  let received = '';
  while (!received.includes('tank.fish.created')) {
    const { value, done } = await reader.read();
    if (done) break;
    received += decoder.decode(value, { stream: true });
  }
  controller.abort();

  assert.match(received, /event: tank\.fish\.created/);
  assert.match(received, /"ownerName":"beandog"/);
});

test('an unknown API path is a 404, not the SPA shell', async (t) => {
  const app = await boot();
  t.after(() => app.close());

  const res = await app.client('GET', '/api/nope');
  assert.equal(res.status, 404);
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
