/**
 * Server-Sent Events hub, one channel per tank.
 *
 * Spec §8 lists WebSocket / SSE / realtime DB as options. SSE is enough here:
 * every realtime message is server -> client, and client -> server actions are
 * ordinary POSTs. It also survives proxies and reconnects on its own.
 */
export function createRealtime({ heartbeatMs = 25_000 } = {}) {
  /** @type {Map<string, Set<{res: import('http').ServerResponse, meta: object}>>} */
  const channels = new Map();

  const heartbeat = setInterval(() => {
    for (const clients of channels.values()) {
      for (const client of clients) client.res.write(': ping\n\n');
    }
  }, heartbeatMs);
  heartbeat.unref?.();

  function subscribe(tankId, res, meta = {}) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    const client = { res, meta };
    if (!channels.has(tankId)) channels.set(tankId, new Set());
    channels.get(tankId).add(client);

    return () => {
      const clients = channels.get(tankId);
      if (!clients) return;
      clients.delete(client);
      if (clients.size === 0) channels.delete(tankId);
    };
  }

  function publish(tankId, event, data) {
    const clients = channels.get(tankId);
    if (!clients) return;
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      try {
        client.res.write(frame);
      } catch {
        clients.delete(client);
      }
    }
  }

  function close() {
    clearInterval(heartbeat);
    for (const clients of channels.values()) {
      for (const client of clients) client.res.end();
    }
    channels.clear();
  }

  return { subscribe, publish, close };
}
