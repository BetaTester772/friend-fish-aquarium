import { config } from './config.js';

/** Minimal cookie parsing — the app sets exactly one cookie. */
export function readCookie(req, name) {
  const header = req.headers.cookie;
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

export function setSessionCookie(res, token) {
  const attrs = [
    `${config.session.cookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(config.session.maxAgeMs / 1000)}`,
  ];
  if (process.env.NODE_ENV === 'production' && process.env.FFA_INSECURE_COOKIE !== '1') {
    attrs.push('Secure');
  }
  res.append('Set-Cookie', attrs.join('; '));
}

export function clearSessionCookie(res) {
  res.append(
    'Set-Cookie',
    `${config.session.cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

/**
 * Attaches `req.user` when a valid session cookie is present. Never rejects —
 * the aquarium is readable by anyone holding the tank link (spec AC-01).
 */
export function attachUser(store) {
  return (req, _res, next) => {
    const token = readCookie(req, config.session.cookieName);
    const session = store.sessionByToken(token);
    req.user = session?.user ?? null;
    req.sessionToken = session?.token ?? null;
    next();
  };
}

export function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'not_signed_in',
      message: 'Pick a name to join the tank first.',
    });
  }
  next();
}
