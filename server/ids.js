import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Short, URL-safe, sortable-enough id. Prefixed so ids are self-describing in logs. */
export function newId(prefix) {
  const bytes = randomBytes(12);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${out}`;
}

/** Invite codes are read aloud and typed, so avoid look-alike characters. */
export function newInviteCode() {
  const readable = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(8);
  let out = '';
  for (const b of bytes) out += readable[b % readable.length];
  return out;
}

export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}
