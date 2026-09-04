import { api, ApiError } from '../api.js';
import { track } from '../analytics.js';
import { openModal, el } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { randomLook } from '../../../shared/fish-variants.js';
import {
  activeDelegate,
  drawFaceMesh,
  framingHint,
  loadFaceLandmarker,
  primaryFace,
} from './face-detector.js';
import {
  androidChromeUrl,
  canJumpToRealBrowser,
  inAppBrowser,
} from './in-app-browser.js';
import { cutOutFace } from './face-cutout.js';
import { createFishPreview } from './preview-scene.js';

/** Consecutive good frames before we capture on our own. */
const STABLE_FRAMES = 22;

/**
 * "Add your fish": consent -> camera -> face mesh -> preview -> Add to tank
 * (spec S2-S4, FR-004 through FR-010).
 *
 * The camera stream is torn down the instant it is no longer needed — after a
 * capture, on cancel, and on any error path (spec §9 step 9).
 */
export function openFishCreator({ tankId, shareUrl, onCreated }) {
  track('add_fish_clicked', { tank_id: tankId });

  return openModal({
    wide: true,
    dismissible: false,
    render: ({ dialog, close, onClose }) => {
      const state = {
        stage: 'consent',
        stream: null,
        landmarker: null,
        rafId: null,
        capture: null, // { canvas, dataUrl }
        look: randomLook(),
        submitting: false,
      };

      function stopCamera() {
        if (state.rafId) cancelAnimationFrame(state.rafId);
        state.rafId = null;
        for (const track_ of state.stream?.getTracks() ?? []) track_.stop();
        state.stream = null;
      }

      onClose(() => {
        stopCamera();
        state.preview?.dispose();
      });

      const cancel = () => {
        // Cancel must leave nothing behind (spec FR-010 / AC-05).
        state.capture = null;
        close(null);
      };

      // ------------------------------------------------------- stage: consent

      function renderConsent(error) {
        dialog.replaceChildren();

        const consented = el('input');
        consented.type = 'checkbox';
        consented.id = 'ffa-consent';

        const label = el('label', 'creator__consent');
        label.htmlFor = 'ffa-consent';
        label.append(
          consented,
          el(
            'span',
            null,
            'I understand my camera runs in this browser only. The tank stores ' +
              'one cropped picture of my face so friends can recognise my fish, ' +
              'and I can delete it at any time.',
          ),
        );

        const trapped = inAppBrowser();
        if (trapped) track('in_app_browser_detected', { app: trapped });

        const start = el(
          'button',
          'btn btn--primary',
          trapped ? 'Try the camera anyway' : 'Turn on camera',
        );
        start.type = 'button';
        start.disabled = true;
        consented.addEventListener('change', () => {
          start.disabled = !consented.checked;
        });
        start.addEventListener('click', () => startCamera());

        const cancelBtn = el('button', 'btn btn--ghost', 'Cancel');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', cancel);

        const actions = el('div', 'modal__actions');
        actions.append(cancelBtn, start);

        dialog.append(
          el('h2', 'modal__title', 'Add your fish'),
          el(
            'p',
            'modal__body',
            'Point the camera at your face. We find it, cut it out, and stick it ' +
              'on a fish. Nothing is recorded — only the still cut-out is saved.',
          ),
          ...(error ? [el('p', 'modal__error', error)] : []),
          ...(trapped ? [escapeHatch(trapped)] : []),
          label,
          actions,
        );
      }

      /**
       * The way out of an in-app browser. Shown before the camera is requested,
       * because inside one the request usually fails no matter what the visitor
       * taps.
       */
      function escapeHatch(appName) {
        const box = el('p', 'modal__error');
        box.append(
          el(
            'span',
            null,
            `${appName}'s built-in browser usually blocks the camera. ` +
              'Open this page in Chrome and it will work.',
          ),
        );

        // Carries the share token, so the visitor lands inside the tank rather
        // than at the passphrase prompt.
        const target = shareUrl ?? location.href;

        const row = el('div', 'modal__actions');
        row.style.justifyContent = 'flex-start';
        row.style.marginTop = '8px';

        if (canJumpToRealBrowser()) {
          const jump = el('a', 'btn btn--primary btn--small', 'Open in Chrome');
          jump.href = androidChromeUrl(target);
          jump.addEventListener('click', () => track('in_app_browser_escape', { app: appName }));
          row.append(jump);
        }

        const copy = el('button', 'btn btn--ghost btn--small', 'Copy the link');
        copy.type = 'button';
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(target);
            copy.textContent = 'Copied — paste it in Chrome';
          } catch {
            window.prompt('Copy this link into Chrome', target);
          }
        });
        row.append(copy);

        box.append(row);
        return box;
      }

      // -------------------------------------------------------- stage: camera

      async function startCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
          track('camera_permission_result', {
            result: 'unsupported',
            browser: navigator.userAgent,
          });
          renderConsent(
            'This browser will not give us a camera. Try Safari or Chrome on a device with a front camera.',
          );
          return;
        }

        renderCameraShell('Starting camera…');

        try {
          state.stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'user',
              width: { ideal: 960 },
              height: { ideal: 720 },
            },
            audio: false,
          });
          track('camera_permission_result', {
            result: 'granted',
            browser: navigator.userAgent,
          });
        } catch (err) {
          track('camera_permission_result', {
            result: 'denied',
            browser: navigator.userAgent,
          });
          renderPermissionDenied(err);
          return;
        }

        // Attach and explicitly start playback. `autoplay` alone is not enough:
        // Safari on iOS refuses it in Low Power Mode, and by this point the
        // user's click has been through two awaits so the gesture context is
        // gone. Without this the video stays black, readyState never reaches 2,
        // and the loop below spins forever on "Starting camera…".
        state.video.srcObject = state.stream;
        try {
          await state.video.play();
        } catch (err) {
          track('camera_playback_blocked', { browser: navigator.userAgent });
          renderTapToStart();
          return;
        }

        try {
          state.landmarker = await loadFaceLandmarker();
        } catch (err) {
          track('face_detector_failed', {
            browser: navigator.userAgent,
            message: String(err?.message ?? err).slice(0, 200),
          });
          stopCamera();
          renderConsent(
            'The face detector would not start on this device. ' +
              'Try a different browser, or ask for a hand.',
          );
          return;
        }

        track('face_detector_ready', { delegate: activeDelegate });
        runDetectionLoop();
      }

      /**
       * Playback was refused — almost always iOS Low Power Mode. One tap, this
       * time inside a real gesture, generally fixes it.
       */
      function renderTapToStart() {
        const start = el('button', 'btn btn--primary', 'Tap to start the camera');
        start.type = 'button';
        start.addEventListener('click', async () => {
          try {
            await state.video.play();
          } catch {
            return;
          }
          try {
            state.landmarker = await loadFaceLandmarker();
          } catch {
            stopCamera();
            renderConsent('The face detector would not start on this device.');
            return;
          }
          state.hint.textContent = 'Center your face in the frame.';
          runDetectionLoop();
        });

        const cancelBtn = el('button', 'btn btn--ghost', 'Cancel');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', cancel);

        const actions = state.video.closest('.modal').querySelector('.modal__actions');
        actions.replaceChildren(cancelBtn, start);
        state.hint.textContent = 'Your browser paused the camera.';
      }

      function renderCameraShell(hintText) {
        dialog.replaceChildren();

        const stage = el('div', 'creator__stage');
        const video = document.createElement('video');
        video.className = 'creator__video';
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;

        const overlay = document.createElement('canvas');
        overlay.className = 'creator__overlay';
        overlay.style.transform = 'scaleX(-1)'; // match the mirrored video

        const hint = el('div', 'creator__hint', hintText);
        stage.append(video, overlay, hint);

        const capture = el('button', 'btn btn--primary', 'Capture');
        capture.type = 'button';
        capture.disabled = true;
        capture.addEventListener('click', () => takeShot());

        const cancelBtn = el('button', 'btn btn--ghost', 'Cancel');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', cancel);

        const actions = el('div', 'modal__actions');
        actions.append(cancelBtn, capture);

        dialog.append(
          el('h2', 'modal__title', 'Line up your face'),
          stage,
          actions,
        );

        state.video = video;
        state.overlay = overlay;
        state.hint = hint;
        state.captureBtn = capture;
        state.stage = 'camera';
      }

      function renderPermissionDenied(err) {
        stopCamera();
        dialog.replaceChildren();

        const retry = el('button', 'btn btn--primary', 'Try again');
        retry.type = 'button';
        retry.addEventListener('click', () => startCamera());

        const cancelBtn = el('button', 'btn btn--ghost', 'Cancel');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', cancel);

        const actions = el('div', 'modal__actions');
        actions.append(cancelBtn, retry);

        const blocked = err?.name === 'NotAllowedError';
        const trapped = inAppBrowser();

        dialog.append(
          el('h2', 'modal__title', 'We need the camera'),
          el(
            'p',
            'modal__body',
            trapped
              ? `${trapped}'s built-in browser will not hand over the camera, ` +
                  'however many times you allow it. Open this page in Chrome.'
              : blocked
                ? 'The camera is blocked for this site. Allow it in your ' +
                    'browser or phone settings, then try again. The video stays ' +
                    'on your device — we only keep the cropped face.'
                : 'No camera was available. Check that nothing else is using ' +
                    'it, then try again.',
          ),
          ...(trapped ? [escapeHatch(trapped)] : []),
          actions,
        );
      }

      // ------------------------------------------ detection loop + auto-capture

      function runDetectionLoop() {
        const { video, overlay, hint, captureBtn } = state;

        let stable = 0;
        let stalled = false;
        const loopStarted = performance.now();
        let attempts = 0;
        let lastTimestamp = -1;
        const detectStarted = performance.now();
        let reportedDetection = false;

        const tick = () => {
          state.rafId = requestAnimationFrame(tick);

          if (video.readyState < 2 || !state.landmarker) {
            // A camera that never delivers a frame used to leave the user
            // staring at "Starting camera…" with nothing to act on. Say so
            // instead of spinning silently.
            if (!stalled && performance.now() - loopStarted > 6000) {
              stalled = true;
              track('camera_stalled', { browser: navigator.userAgent });
              setHint('The camera is not sending a picture. Try reopening this.');
            }
            return;
          }
          stalled = false;

          if (overlay.width !== video.videoWidth) {
            overlay.width = video.videoWidth;
            overlay.height = video.videoHeight;
          }

          // MediaPipe rejects a repeated timestamp, which happens whenever the
          // display refreshes faster than the camera produces frames.
          const timestamp = performance.now();
          if (timestamp <= lastTimestamp) return;
          lastTimestamp = timestamp;

          let result;
          try {
            result = state.landmarker.detectForVideo(video, timestamp);
          } catch {
            return;
          }

          const ctx = overlay.getContext('2d');
          ctx.clearRect(0, 0, overlay.width, overlay.height);

          const landmarks = primaryFace(result.faceLandmarks);
          attempts += 1;

          if (!landmarks) {
            stable = 0;
            captureBtn.disabled = true;
            setHint('Center your face in the frame.');
            return;
          }

          if (!reportedDetection) {
            reportedDetection = true;
            track('face_detected', {
              detection_ms: Math.round(performance.now() - detectStarted),
              attempts,
            });
          }

          drawFaceMesh(ctx, landmarks);
          state.landmarks = landmarks;

          const problem = framingHint(landmarks, result.faceLandmarks.length);
          if (problem) {
            stable = 0;
            // "Too many faces" is a warning, not a blocker — we already picked
            // the biggest one, so let them shoot it manually if they want.
            const crowded = result.faceLandmarks.length > 1;
            captureBtn.disabled = !crowded;
            setHint(problem);
            return;
          }

          captureBtn.disabled = false;
          stable += 1;
          setHint(
            stable >= STABLE_FRAMES ? 'Got it!' : 'Hold still…',
            stable >= STABLE_FRAMES ? 'ready' : undefined,
          );

          // Auto-capture only once the face has been steady and well framed;
          // never on an empty frame (spec S3 / §10).
          if (stable >= STABLE_FRAMES) takeShot();
        };

        function setHint(text, tone) {
          hint.textContent = text;
          if (tone) hint.dataset.tone = tone;
          else delete hint.dataset.tone;
        }

        state.rafId = requestAnimationFrame(tick);
      }

      function takeShot() {
        if (!state.landmarks || state.stage !== 'camera') return;
        const started = performance.now();

        let capture;
        try {
          capture = cutOutFace(state.video, state.landmarks);
        } catch {
          stopCamera();
          renderGenerationFailed();
          return;
        }

        // The camera has done its job — release it before rendering anything.
        stopCamera();
        state.capture = capture;
        state.stage = 'preview';
        track('fish_preview_shown', {
          body_variant: state.look.bodyVariant,
          generation_ms: Math.round(performance.now() - started),
        });
        renderPreview();
      }

      function renderGenerationFailed() {
        dialog.replaceChildren();

        const retry = el('button', 'btn btn--primary', 'Try again');
        retry.type = 'button';
        retry.addEventListener('click', () => startCamera());

        const cancelBtn = el('button', 'btn btn--ghost', 'Cancel');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', cancel);

        const actions = el('div', 'modal__actions');
        actions.append(cancelBtn, retry);

        dialog.append(
          el('h2', 'modal__title', 'That one did not work'),
          el(
            'p',
            'modal__body',
            'We could not cut your face out of that frame. Nothing was saved — ' +
              'give it another go.',
          ),
          actions,
        );
      }

      // ------------------------------------------------------- stage: preview

      function renderPreview(error) {
        state.preview?.dispose();
        dialog.replaceChildren();

        const stage = el('div', 'creator__stage');
        const canvas = document.createElement('canvas');
        canvas.className = 'creator__preview';
        stage.append(canvas);

        const shuffle = el('button', 'btn btn--ghost btn--small', 'Shuffle look');
        shuffle.type = 'button';
        shuffle.addEventListener('click', () => {
          state.look = randomLook();
          state.preview.rebuild(state.look);
        });

        const retake = el('button', 'btn btn--ghost', 'Retake');
        retake.type = 'button';
        retake.addEventListener('click', () => {
          state.capture = null;
          state.preview?.dispose();
          state.preview = null;
          startCamera();
        });

        const cancelBtn = el('button', 'btn btn--ghost', 'Cancel');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', cancel);

        const add = el('button', 'btn btn--primary', 'Add to tank');
        add.type = 'button';
        add.disabled = state.submitting;
        add.addEventListener('click', () => submit(add));

        const actions = el('div', 'modal__actions');
        actions.append(cancelBtn, retake, add);

        // Shuffle sits on its own row, left aligned, away from the commit
        // buttons — the Reel only shows Cancel / Add to tank, so re-rolling the
        // look must not compete with them.
        const looks = el('div', 'modal__actions');
        looks.style.justifyContent = 'flex-start';
        looks.append(shuffle);

        dialog.append(
          el('h2', 'modal__title', 'Meet your fish'),
          stage,
          ...(error ? [el('p', 'modal__error', error)] : []),
          looks,
          actions,
        );

        state.preview = createFishPreview({
          canvas,
          look: state.look,
          faceCanvas: state.capture.canvas,
        });
      }

      async function submit(button) {
        if (state.submitting || !state.capture) return;
        state.submitting = true;
        button.disabled = true;
        button.textContent = 'Adding…';

        try {
          const { fish } = await api.createFish(tankId, {
            faceImage: state.capture.dataUrl,
            ...state.look,
          });
          track('fish_added', { tank_id: tankId, fish_id: fish.id });
          onCreated?.(fish);
          close(fish);
          toast('You are in the tank', { tone: 'good' });
        } catch (err) {
          state.submitting = false;
          const message =
            err instanceof ApiError
              ? err.message
              : 'Could not reach the tank. Check your connection and try again.';
          renderPreview(message);
        }
      }

      renderConsent();
    },
  });
}
