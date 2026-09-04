import { api } from './api.js';

/**
 * Realtime sync (spec FR-018) over SSE, plus the presence heartbeat that
 * produces "{user} is here" (FR-019).
 *
 * EventSource reconnects on its own; when it does we refetch the whole tank so
 * anything that happened while we were offline is picked up rather than lost
 * (spec §10 "Realtime disconnect").
 */
export function connectRealtime({ state, tankId, heartbeatMs = 20_000 }) {
  let source = null;
  let heartbeatTimer = null;
  let hadError = false;
  let stopped = false;

  async function resync() {
    try {
      const snapshot = await api.tank(tankId);
      state.hydrate(snapshot);
    } catch {
      /* the next reconnect will try again */
    }
  }

  function open() {
    if (stopped) return;
    source = new EventSource(`/api/tanks/${tankId}/events`);

    source.addEventListener('open', () => {
      state.setConnection('live');
      // Only resync after a *re*connect; the initial snapshot is already fresh.
      if (hadError) {
        hadError = false;
        resync();
      }
    });

    source.addEventListener('error', () => {
      hadError = true;
      state.setConnection('reconnecting');
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

  async function beat() {
    if (document.hidden || !state.get().viewer) return;
    try {
      await api.heartbeat(tankId);
    } catch {
      /* presence is best-effort */
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    beat();
    heartbeatTimer = setInterval(beat, heartbeatMs);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  // Coming back to the tab is exactly when the tank is most likely stale.
  const onVisibility = () => {
    if (document.hidden) return;
    beat();
    resync();
  };
  document.addEventListener('visibilitychange', onVisibility);

  open();
  startHeartbeat();

  return {
    /** Call after sign-in so the first heartbeat announces the new user. */
    announce: beat,
    resync,
    close() {
      stopped = true;
      stopHeartbeat();
      document.removeEventListener('visibilitychange', onVisibility);
      source?.close();
    },
  };
}
