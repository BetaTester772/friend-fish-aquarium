import { api } from './api.js';

/** Consecutive stream failures before we give up on SSE for this session. */
const SSE_FAILURE_LIMIT = 3;
const POLL_INTERVAL_MS = 5_000;

/**
 * Realtime sync (spec FR-018) over SSE, plus the presence heartbeat that
 * produces "{user} is here" (FR-019).
 *
 * EventSource reconnects on its own; when it does we refetch the whole tank so
 * anything that happened while we were offline is picked up rather than lost
 * (spec §10 "Realtime disconnect").
 *
 * If the stream cannot be kept open at all — a proxy that buffers
 * `text/event-stream`, or a host where the Durable Object hub is unavailable —
 * we fall back to polling the tank snapshot. Spec §8 explicitly allows this for
 * a small friend group, and it means the tank always works even where SSE does
 * not.
 */
export function connectRealtime({ state, tankId, heartbeatMs = 20_000 }) {
  let source = null;
  let heartbeatTimer = null;
  let pollTimer = null;
  let failures = 0;
  let sawOpen = false;
  let stopped = false;

  async function resync() {
    try {
      state.hydrate(await api.tank(tankId));
      return true;
    } catch {
      return false; // the next tick will try again
    }
  }

  // ------------------------------------------------------------------- SSE

  function openStream() {
    if (stopped) return;
    source = new EventSource(`/api/tanks/${tankId}/events`);

    source.addEventListener('open', () => {
      failures = 0;
      state.setConnection('live');
      // Only resync after a *re*connect; the initial snapshot is already fresh.
      if (sawOpen) resync();
      sawOpen = true;
    });

    source.addEventListener('error', () => {
      state.setConnection('reconnecting');
      failures += 1;
      if (failures >= SSE_FAILURE_LIMIT) {
        source.close();
        source = null;
        startPolling();
      }
    });

    source.addEventListener('tank.fish.created', (event) => {
      state.upsertFish(JSON.parse(event.data).fish);
    });

    source.addEventListener('tank.fish.deleted', (event) => {
      state.removeFish(JSON.parse(event.data));
    });

    source.addEventListener('fish.status.updated', (event) => {
      state.updateFishStatus(JSON.parse(event.data));
    });

    source.addEventListener('activity.created', (event) => {
      state.addActivity(JSON.parse(event.data));
    });

    source.addEventListener('presence.updated', (event) => {
      state.setMembers(JSON.parse(event.data).members);
    });
  }

  // --------------------------------------------------------------- polling

  function startPolling() {
    if (pollTimer || stopped) return;
    console.info('[ffa] event stream unavailable — falling back to polling');
    pollTimer = setInterval(async () => {
      if (document.hidden) return;
      state.setConnection((await resync()) ? 'polling' : 'reconnecting');
    }, POLL_INTERVAL_MS);
    resync().then((ok) => state.setConnection(ok ? 'polling' : 'reconnecting'));
  }

  // ------------------------------------------------------------- heartbeat

  async function beat() {
    if (document.hidden || !state.get().viewer) return;
    try {
      await api.heartbeat(tankId);
    } catch {
      /* presence is best-effort */
    }
  }

  // Coming back to the tab is exactly when the tank is most likely stale.
  const onVisibility = () => {
    if (document.hidden) return;
    beat();
    resync();
  };
  document.addEventListener('visibilitychange', onVisibility);

  openStream();
  beat();
  heartbeatTimer = setInterval(beat, heartbeatMs);

  return {
    /** Call after sign-in so the first heartbeat announces the new user. */
    announce: beat,
    resync,
    close() {
      stopped = true;
      clearInterval(heartbeatTimer);
      clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      source?.close();
    },
  };
}
