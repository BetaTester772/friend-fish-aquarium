/**
 * Single source of truth for the tank, plus a tiny pub/sub so the scene, the
 * name tags and the activity feed all react to the same updates — whether they
 * came from our own request or from another friend over the realtime stream.
 */
export function createState(initial = {}) {
  let state = {
    tank: null,
    rules: null,
    gate: null,
    viewer: null,
    fish: [],
    members: [],
    activity: [],
    selectedFishId: null,
    connection: 'connecting',
    ...initial,
  };

  const listeners = new Map();

  function emit(topic, payload) {
    for (const fn of listeners.get(topic) ?? []) fn(payload, state);
    for (const fn of listeners.get('*') ?? []) fn({ topic, payload }, state);
  }

  return {
    get: () => state,

    on(topic, fn) {
      if (!listeners.has(topic)) listeners.set(topic, new Set());
      listeners.get(topic).add(fn);
      return () => listeners.get(topic)?.delete(fn);
    },

    /** Replace everything from a `GET /tanks/:id` snapshot. */
    hydrate(snapshot) {
      state = {
        ...state,
        tank: snapshot.tank,
        rules: snapshot.rules,
        gate: snapshot.gate,
        viewer: snapshot.viewer,
        fish: snapshot.fish,
        members: snapshot.members,
        activity: snapshot.activity,
      };
      emit('hydrated', state);
      emit('fish', state.fish);
      emit('activity', state.activity);
      emit('members', state.members);
      emit('viewer', state.viewer);
    },

    setViewer(viewer) {
      state = { ...state, viewer };
      emit('viewer', viewer);
    },

    setConnection(connection) {
      if (state.connection === connection) return;
      state = { ...state, connection };
      emit('connection', connection);
    },

    upsertFish(fish) {
      const next = state.fish.filter((f) => f.id !== fish.id);
      next.push(fish);
      state = { ...state, fish: next };
      emit('fish', state.fish);
      emit('fish:upsert', fish);
    },

    removeFish({ id, ownerUserId }) {
      const gone = state.fish.filter(
        (f) => (id && f.id === id) || (ownerUserId && f.ownerUserId === ownerUserId),
      );
      if (gone.length === 0) return;
      const ids = new Set(gone.map((f) => f.id));
      state = {
        ...state,
        fish: state.fish.filter((f) => !ids.has(f.id)),
        selectedFishId: ids.has(state.selectedFishId) ? null : state.selectedFishId,
      };
      emit('fish', state.fish);
      for (const fish of gone) emit('fish:removed', fish);
      emit('selection', state.selectedFishId);
    },

    updateFishStatus({ id, fullness, status }) {
      let changed = false;
      const fish = state.fish.map((f) => {
        if (f.id !== id) return f;
        changed = true;
        return { ...f, fullness, status };
      });
      if (!changed) return;
      state = { ...state, fish };
      emit('fish', state.fish);
      emit('fish:status', { id, fullness, status });
    },

    addActivity(event) {
      if (state.activity.some((e) => e.id === event.id)) return; // realtime + refetch overlap
      state = { ...state, activity: [...state.activity, event].slice(-100) };
      emit('activity', state.activity);
      emit('activity:new', event);
    },

    setActivity(activity) {
      state = { ...state, activity };
      emit('activity', activity);
    },

    setMembers(members) {
      state = { ...state, members };
      emit('members', members);
    },

    select(fishId) {
      if (state.selectedFishId === fishId) return;
      state = { ...state, selectedFishId: fishId };
      emit('selection', fishId);
    },

    fishById: (id) => state.fish.find((f) => f.id === id) ?? null,
    myFish: () =>
      state.viewer
        ? state.fish.find((f) => f.ownerUserId === state.viewer.id) ?? null
        : null,
  };
}
