/** Thin fetch wrapper around the tank API. Every call carries the session cookie. */

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message ?? body?.error ?? `Request failed (${status})`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error ?? 'unknown';
    this.body = body ?? {};
  }
}

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return null;

  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, payload);
  return payload;
}

export const api = {
  /** Exchange the shared passphrase for a gate cookie. */
  unlock: (passphrase) => request('POST', '/gate', { passphrase }),

  session: () => request('GET', '/session'),
  signIn: (displayName) => request('POST', '/session', { displayName }),
  signOut: () => request('DELETE', '/session'),
  deleteAccount: () => request('DELETE', '/me'),

  defaultTank: () => request('GET', '/tanks/default'),
  tankByInvite: (code) => request('GET', `/tanks/by-invite/${encodeURIComponent(code)}`),
  tank: (tankId) => request('GET', `/tanks/${tankId}`),
  heartbeat: (tankId) => request('POST', `/tanks/${tankId}/presence`),
  activity: (tankId) => request('GET', `/tanks/${tankId}/activity`),

  createFish: (tankId, payload) => request('POST', `/tanks/${tankId}/fish`, payload),
  deleteFish: (fishId) => request('DELETE', `/fish/${fishId}`),
  feed: (fishId) => request('POST', `/fish/${fishId}/feed`),
};
