/** Id helpers built on the global WebCrypto, available since Node 18. */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** Short, URL-safe id. Prefixed so ids are self-describing in logs. */
export function newId(prefix) {
  let out = '';
  for (const byte of randomBytes(12)) out += ALPHABET[byte % ALPHABET.length];
  return `${prefix}_${out}`;
}

/** Invite codes are read aloud and typed, so avoid look-alike characters. */
export function newInviteCode() {
  const readable = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (const byte of randomBytes(8)) out += readable[byte % readable.length];
  return out;
}

export function newSessionToken() {
  let out = '';
  for (const byte of randomBytes(32)) out += byte.toString(16).padStart(2, '0');
  return out;
}
