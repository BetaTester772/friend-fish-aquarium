/**
 * Product analytics from spec §11. Events are queued and flushed with
 * `sendBeacon` where available so a navigation away never drops them, and a
 * failure never surfaces to the user.
 */
const queue = [];
let flushTimer = null;

function flush() {
  flushTimer = null;
  while (queue.length) {
    const event = queue.shift();
    const body = JSON.stringify(event);
    const sent =
      navigator.sendBeacon?.(
        '/api/analytics',
        new Blob([body], { type: 'application/json' }),
      ) ?? false;
    if (sent) continue;
    fetch('/api/analytics', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  }
}

export function track(name, props = {}) {
  queue.push({ name, props });
  flushTimer ??= setTimeout(flush, 400);
}

window.addEventListener('pagehide', flush);
