/**
 * Server-Sent Events hub, one channel per tank.
 *
 * Spec §8 lists WebSocket / SSE / realtime DB as options. SSE is enough here:
 * every realtime message is server -> client, and client -> server actions are
 * ordinary POSTs. It reconnects on its own and needs no protocol upgrade.
 *
 * It is written against Web streams, matching the Response the router returns.
 */
export function createSseHub({ heartbeatMs = 25_000 } = {}) {
  /** @type {Map<string, Set<{enqueue: (frame: string) => void, close: () => void}>>} */
  const channels = new Map();
  const encoder = new TextEncoder();

  const heartbeat = setInterval(() => {
    // A comment line keeps reverse proxies from closing an idle stream.
    for (const clients of channels.values()) {
      for (const client of clients) client.enqueue(': ping\n\n');
    }
  }, heartbeatMs);
  heartbeat.unref?.();

  /** @returns {Response} an open text/event-stream */
  function subscribe(channel, { signal } = {}) {
    let client;

    const stream = new ReadableStream({
      start(controller) {
        client = {
          enqueue(frame) {
            try {
              controller.enqueue(encoder.encode(frame));
            } catch {
              remove(channel, client);
            }
          },
          close() {
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          },
        };

        if (!channels.has(channel)) channels.set(channel, new Set());
        channels.get(channel).add(client);

        client.enqueue('retry: 3000\n\n');
      },
      cancel() {
        remove(channel, client);
      },
    });

    // Node's http server signals a dropped connection through the abort signal
    // rather than by cancelling the stream.
    signal?.addEventListener('abort', () => remove(channel, client), { once: true });

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    });
  }

  function publish(channel, event, data) {
    const clients = channels.get(channel);
    if (!clients) return;
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) client.enqueue(frame);
  }

  function remove(channel, client) {
    const clients = channels.get(channel);
    if (!clients || !client) return;
    clients.delete(client);
    client.close();
    if (clients.size === 0) channels.delete(channel);
  }

  function close() {
    clearInterval(heartbeat);
    for (const clients of channels.values()) {
      for (const client of clients) client.close();
    }
    channels.clear();
  }

  /** Number of open streams, across all channels or for one. */
  const size = (channel) =>
    channel === undefined
      ? [...channels.values()].reduce((total, set) => total + set.size, 0)
      : (channels.get(channel)?.size ?? 0);

  return { subscribe, publish, close, size };
}

/**
 * Realtime backed by a hub in this process. Used by the Node server, where a
 * single process holds every connection.
 */
export function createLocalRealtime(options) {
  const hub = createSseHub(options);
  return {
    subscribe: (tankId, { request } = {}) =>
      hub.subscribe(tankId, { signal: request?.signal }),
    publish: async (tankId, event, data) => hub.publish(tankId, event, data),
    close: () => hub.close(),
  };
}
