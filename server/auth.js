import { config } from './config.js';

/** Minimal cookie parsing — the app sets exactly one cookie. */
export function readCookie(request, name) {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

export const sessionCookieName = config.session.cookieName;

/**
 * `Secure` is set whenever the request arrived over https, which covers the
 * deployed Worker without breaking `http://localhost` in development.
 */
export function sessionCookie(request, token) {
  const attrs = [
    `${config.session.cookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(config.session.maxAgeMs / 1000)}`,
  ];
  if (new URL(request.url).protocol === 'https:') attrs.push('Secure');
  return attrs.join('; ');
}

export function clearedSessionCookie() {
  return `${config.session.cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
