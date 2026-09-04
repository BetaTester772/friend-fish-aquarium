import { config } from './config.js';

/**
 * Shared-passphrase gate.
 *
 * The tank is deployed at a public hostname, and a hostname becomes public
 * knowledge the moment a certificate is issued for it (Certificate Transparency
 * logs are indexed by scanners within minutes). Without a gate, a stranger who
 * finds the URL can see everyone's face and upload their own. So when
 * FFA_PASSPHRASE is set, *reads* are gated too, not just writes.
 *
 * Leaving it unset disables the gate entirely, which is what local development
 * and the test suite run with.
 */
const GATE_COOKIE = 'ffa_gate';
const GATE_MESSAGE = 'friend-fish-aquarium/gate/v1';

/** Paths that stay reachable without the passphrase. */
const OPEN_PATHS = new Set(['/api/health', '/api/gate']);

let cachedToken = null;

/**
 * The cookie value proving someone knew the passphrase.
 *
 * It is an HMAC of a fixed message keyed by the passphrase itself, so there is
 * no second secret to manage, the value survives restarts, and changing the
 * passphrase invalidates every issued cookie at once. Anyone able to compute it
 * already knows the passphrase, which is exactly the set of people allowed in.
 */
export async function gateToken(passphrase = config.gate.passphrase) {
  if (!passphrase) return null;
  if (cachedToken?.passphrase === passphrase) return cachedToken.token;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(GATE_MESSAGE),
  );

  const token = [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  cachedToken = { passphrase, token };
  return token;
}

export const gateEnabled = () => Boolean(config.gate.passphrase);

export const isOpenPath = (pathname) => OPEN_PATHS.has(pathname);

/** Does this request carry a valid gate cookie? */
export async function hasPassed(request) {
  if (!gateEnabled()) return true;
  const presented = readGateCookie(request);
  if (!presented) return false;
  return constantTimeEqual(presented, await gateToken());
}

/**
 * Is this a valid share token? The token is the same value as the cookie, so a
 * link carrying it grants exactly the access a typed passphrase does — but it
 * never reveals the passphrase itself, and rotating the passphrase kills every
 * outstanding link along with every cookie.
 */
export async function tokenMatches(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  return constantTimeEqual(candidate, await gateToken());
}

/** Is this the right passphrase? Compared as hashes, so length never leaks. */
export async function passphraseMatches(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  const expected = await gateToken();
  const presented = await gateToken(candidate);
  return constantTimeEqual(presented, expected);
}

export function gateCookie(request, token) {
  const attrs = [
    `${GATE_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(config.gate.maxAgeMs / 1000)}`,
  ];
  if (new URL(request.url).protocol === 'https:') attrs.push('Secure');
  return attrs.join('; ');
}

function readGateCookie(request) {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === GATE_COOKIE) return part.slice(idx + 1).trim();
  }
  return null;
}

/** Both values are fixed-length hex here, so comparing lengths first is safe. */
function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Refuses to start with a passphrase weak enough to guess. The gate is the only
 * thing between the internet and a folder of your friends' faces, so a typo'd
 * two-character value should stop the deploy rather than quietly protect
 * nothing.
 */
export function assertUsablePassphrase() {
  const passphrase = config.gate.passphrase;
  if (passphrase === null) return { enabled: false };
  if (passphrase.length < config.gate.minLength) {
    throw new Error(
      `FFA_PASSPHRASE must be at least ${config.gate.minLength} characters ` +
        `(got ${passphrase.length}). Unset it to run an open tank.`,
    );
  }
  return { enabled: true };
}
