import './styles.css';
import { api, ApiError } from './api.js';
import { track } from './analytics.js';
import { createState } from './state.js';
import { connectRealtime } from './realtime.js';
import { createAquarium } from './scene/aquarium.js';
import { createFishLabels } from './ui/labels.js';
import { createFishCard } from './ui/fish-card.js';
import { createActivityFeed } from './ui/activity-feed.js';
import { createHud, promptForName } from './ui/hud.js';
import { toast } from './ui/toast.js';
import { promptForPassphrase, unlockFromLink, inviteLink } from './ui/gate.js';

/**
 * Wires the tank together: load a snapshot, render it, keep it in sync, and
 * route every interaction (click a fish, add a fish, feed a fish) through the
 * shared state so the 3D scene, the name tags and the activity feed never
 * disagree.
 */
async function main() {
  const state = createState();

  // An invite link carrying the share token admits the visitor before the first
  // request, so they never see the passphrase prompt at all.
  await unlockFromLink();

  const snapshot = await loadTank();
  if (!snapshot) return;
  state.hydrate(snapshot);

  track('tank_viewed', {
    tank_id: snapshot.tank.id,
    fish_count: snapshot.fish.length,
    current_user_has_fish: Boolean(snapshot.viewer?.fishId),
  });

  // A tank with no WebGL is not a degraded tank, it is a blank page — three.js
  // throws on context creation and takes the HUD down with it. Catch it here
  // and say what happened, rather than leaving someone staring at empty blue.
  let aquarium;
  try {
    aquarium = createAquarium({ canvas: document.getElementById('tank-canvas') });
  } catch (err) {
    console.error(err);
    track('webgl_unavailable', { browser: navigator.userAgent });
    showFatal(
      'This browser cannot draw the tank — it has no WebGL. Turn on hardware ' +
        'acceleration in your browser settings, or open the tank on another ' +
        'device.',
    );
    return;
  }
  await aquarium.syncFish(snapshot.fish);

  // The scene mirrors state; state is never derived from the scene.
  state.on('fish', (fish) => aquarium.syncFish(fish));

  // --------------------------------------------------------------- realtime

  const realtime = connectRealtime({
    state,
    tankId: snapshot.tank.id,
    heartbeatMs: snapshot.rules.presenceHeartbeatMs,
  });

  state.on('connection', (connection) => {
    if (connection === 'reconnecting') {
      toast('Lost the tank — reconnecting', { tone: 'warn', duration: 1800 });
    }
  });


  createFishLabels({
    container: document.getElementById('fish-labels'),
    aquarium,
    state,
  });

  createActivityFeed({
    container: document.getElementById('activity'),
    state,
  });

  const signIn = async () => {
    const user = await promptForName({ state });
    if (user) realtime.announce();
    return user;
  };

  /** Shared entry point for the creator: sign in first if we don't know you. */
  async function addFish() {
    if (!state.get().viewer && !(await signIn())) return;

    // The face detector and its model are only pulled once someone actually
    // opens the creator — visitors who just come to look never download them.
    const { openFishCreator } = await import('./creator/index.js');

    const fish = await openFishCreator({
      tankId: state.get().tank.id,
      // Handed to the "open in Chrome" escape hatch, so a visitor stuck in a
      // chat app's browser lands back inside the tank, not at the prompt.
      shareUrl: inviteLink({
        inviteCode: state.get().tank.inviteCode,
        shareKey: state.get().gate?.shareKey,
      }),
      onCreated: (created) => {
        state.upsertFish(created);
        state.setViewer({ ...state.get().viewer, fishId: created.id });
      },
    });
    if (fish) state.select(fish.id);
  }

  createFishCard({
    state,
    aquarium,
    onRequestJoin: signIn,
  });

  createHud({
    container: document.getElementById('hud'),
    state,
    onAddFish: addFish,
    onSignIn: signIn,
    onSignedOut: () => state.select(null),
    onReload: () => realtime.resync(),
  });

  // ------------------------------------------------------------ pointer input

  const canvas = aquarium.canvas;

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return; // no hover on touch
    aquarium.setHovered(aquarium.fishIdAtPointer(event.clientX, event.clientY));
  });

  canvas.addEventListener('pointerdown', (event) => {
    const fishId = aquarium.fishIdAtPointer(event.clientX, event.clientY);
    // Clicking empty water dismisses the card; clicking a fish selects it.
    state.select(fishId);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') state.select(null);
  });

  // Fullness decays continuously on the server. Re-pull every few minutes so a
  // tab left open overnight doesn't show yesterday's bars (spec §6).
  setInterval(() => {
    if (!document.hidden) realtime.resync();
  }, 5 * 60 * 1000);

  if (state.get().viewer) realtime.announce();
}

/**
 * Opens the tank named by `?tank=<inviteCode>`, falling back to the shared
 * default tank (spec AC-01: the link alone is enough to see the fish).
 */
async function loadTank() {
  const inviteCode = new URLSearchParams(location.search).get('tank');
  const fetchTank = () =>
    inviteCode ? api.tankByInvite(inviteCode) : api.defaultTank();

  try {
    return await fetchTank();
  } catch (err) {
    // A private tank answers everything with 401 until the passphrase is in,
    // so ask for it and start over rather than showing an error.
    if (err instanceof ApiError && err.code === 'gate_required') {
      await promptForPassphrase();
      return loadTank();
    }
    if (err instanceof ApiError && err.status === 404) {
      showFatal('That tank link does not exist (any more).');
    } else {
      showFatal('Could not reach the tank. Is the server running?');
    }
    return null;
  }
}

function showFatal(message) {
  const banner = document.createElement('div');
  banner.className = 'modal-backdrop';
  banner.innerHTML = '<div class="modal"></div>';
  const dialog = banner.firstElementChild;

  const title = document.createElement('h2');
  title.className = 'modal__title';
  title.textContent = 'The tank is closed';

  const body = document.createElement('p');
  body.className = 'modal__body';
  body.textContent = message;

  const retry = document.createElement('button');
  retry.className = 'btn btn--primary';
  retry.type = 'button';
  retry.textContent = 'Reload';
  retry.addEventListener('click', () => location.reload());

  const actions = document.createElement('div');
  actions.className = 'modal__actions';
  actions.append(retry);

  dialog.append(title, body, actions);
  document.getElementById('modal-root').append(banner);
}

main().catch((err) => {
  console.error(err);
  showFatal('Something went wrong setting up the tank.');
});
