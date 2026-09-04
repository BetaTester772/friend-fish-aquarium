import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffa-gate-'));
process.env.FFA_DATA_DIR = tmpDir;

// config.js reads FFA_PASSPHRASE at import time, so it has to be set first.
const PASSPHRASE = 'a-decent-shared-passphrase';
process.env.FFA_PASSPHRASE = PASSPHRASE;

const { createNodeApp } = await import('../server/node.js');
const { assertUsablePassphrase } = await import('../server/gate.js');
const { config } = await import('../server/config.js');

let server;
let base;

before(async () => {
  const app = createNodeApp({ file: path.join(tmpDir, 'gate.db') });
  server = app.server;
  server.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const get = (url, cookie) =>
  fetch(`${base}${url}`, { headers: cookie ? { Cookie: cookie } : {} });

async function unlock(passphrase) {
  const res = await fetch(`${base}/api/gate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passphrase }),
  });
  return { res, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? null };
}

test('a private tank refuses reads, not just writes', async () => {
  // Seeing the tank means seeing everyone's face, so GET is gated too.
  for (const url of ['/api/tanks/default', '/api/rules', '/faces/face_x.png']) {
    const res = await get(url);
    assert.equal(res.status, 401, url);
    assert.equal((await res.json()).error, 'gate_required', url);
  }
});

test('the healthcheck stays reachable without the passphrase', async () => {
  const res = await get('/api/health');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});

test('the SPA shell is still served, so the prompt can render', async () => {
  const res = await get('/');
  assert.ok(res.status === 200 || res.status === 404, `got ${res.status}`);
  assert.notEqual(res.status, 401, 'the page itself must load to ask for the passphrase');
});

test('a wrong passphrase is rejected and sets no cookie', async () => {
  const { res, cookie } = await unlock('not-the-passphrase');
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'wrong_passphrase');
  assert.equal(cookie, null);
});

test('a wrong guess is slowed down', async () => {
  const started = Date.now();
  await unlock('still-wrong');
  assert.ok(
    Date.now() - started >= 250,
    'failures should pause, to keep guessing to a few per second',
  );
});

test('the right passphrase opens the tank', async () => {
  const { res, cookie } = await unlock(PASSPHRASE);
  assert.equal(res.status, 200);
  assert.ok(cookie, 'a gate cookie is issued');

  const tank = await get('/api/tanks/default', cookie);
  assert.equal(tank.status, 200);
  assert.ok((await tank.json()).tank.id);
});

test('the gate cookie is httpOnly and long-lived', async () => {
  const res = await fetch(`${base}/api/gate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passphrase: PASSPHRASE }),
  });
  const header = res.headers.get('set-cookie');
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Max-Age=\d{7,}/);
});

test('a forged gate cookie does not get in', async () => {
  const forged = 'ffa_gate=' + 'a'.repeat(64);
  const res = await get('/api/tanks/default', forged);
  assert.equal(res.status, 401);
});

test('an empty or missing passphrase is not treated as a match', async () => {
  for (const candidate of ['', null, undefined, 0, {}]) {
    const res = await fetch(`${base}/api/gate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase: candidate }),
    });
    assert.equal(res.status, 403, JSON.stringify(candidate));
  }
});

test('startup refuses a passphrase short enough to guess', () => {
  assert.deepEqual(assertUsablePassphrase(), { enabled: true });

  const original = config.gate.passphrase;
  try {
    config.gate.passphrase = 'short';
    assert.throws(() => assertUsablePassphrase(), /at least 8 characters/);

    // Unset means "open tank", which is a choice, not a misconfiguration.
    config.gate.passphrase = null;
    assert.deepEqual(assertUsablePassphrase(), { enabled: false });
  } finally {
    config.gate.passphrase = original;
  }
});
