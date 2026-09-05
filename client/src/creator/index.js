import { api, ApiError } from '../api.js';
import { track } from '../analytics.js';
import { openModal, el } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { randomLook } from '../../../shared/fish-variants.js';
import {
  activeDelegate,
  drawFaceMesh,
  loadFaceLandmarker,
  primaryFace,
  useCpuDelegate,
} from './face-detector.js';
import {
  boundsOf,
  coverCrop,
  createHoldTimer,
  framingHint,
  isPlausible,
  normalizeLandmarks,
  rawBoundsOf,
} from './framing.js';
import {
  androidChromeUrl,
  canJumpToRealBrowser,
  inAppBrowser,
  isDesktop,
} from './in-app-browser.js';
import { cutOutFace } from './face-cutout.js';
import { createFishPreview } from './preview-scene.js';
import { bindText, t } from '../i18n.js';

const localized = (tag, className, key, variables) => {
  const node = el(tag, className);
  bindText(node, key, variables);
  return node;
};

/** Two decimals is plenty for a framing measurement. */
const round = (value) => Math.round(value * 100) / 100;

/**
 * `?debug=1` puts the detector's live numbers on the screen.
 *
 * Diagnosing this flow by screenshot and analytics has taken five rounds, none
 * of which could see the device. Reading the figures off the phone directly is
 * faster than any of them.
 */
const DEBUG = new URLSearchParams(location.search).has('debug');

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

      function renderConsent(errorKey) {
        dialog.replaceChildren();

        const consented = el('input');
        consented.type = 'checkbox';
        consented.id = 'ffa-consent';

        const label = el('label', 'creator__consent');
        label.htmlFor = 'ffa-consent';
        label.append(
          consented,
          localized('span', null, 'creator.consent'),
        );

        const start = localized('button', 'btn btn--primary', 'creator.turnOnCamera');
        start.type = 'button';
        start.disabled = true;
        consented.addEventListener('change', () => {
          start.disabled = !consented.checked;
        });
        start.addEventListener('click', () => startCamera());

        const cancelBtn = localized('button', 'btn btn--ghost', 'common.cancel');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', cancel);

        const actions = el('div', 'modal__actions');
        actions.append(cancelBtn, start);

        dialog.append(
          localized('h2', 'modal__title', 'creator.title'),
          localized('p', 'modal__body', 'creator.intro'),
          ...(errorKey ? [localized('p', 'modal__error', errorKey)] : []),
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
          localized('span', null, 'creator.inAppBrowser', { appName }),
        );

        // Carries the share token, so the visitor lands inside the tank rather
        // than at the passphrase prompt.
        const target = shareUrl ?? location.href;

        const row = el('div', 'modal__actions');
        row.style.justifyContent = 'flex-start';
        row.style.marginTop = '8px';

        if (canJumpToRealBrowser()) {
          const jump = localized('a', 'btn btn--primary btn--small', 'creator.openChrome');
          jump.href = androidChromeUrl(target);
          jump.addEventListener('click', () => track('in_app_browser_escape', { app: appName }));
          row.append(jump);
        }

        let copied = false;
        const copy = localized(
          'button',
          'btn btn--ghost btn--small',
          () => copied ? 'creator.copiedChrome' : 'creator.copyLink',
        );
        copy.type = 'button';
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(target);
            copied = true;
            copy.textContent = t('creator.copiedChrome');
          } catch {
            window.prompt(t('creator.copyChromePrompt'), target);
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
          renderConsent('creator.unsupportedCamera');
          return;
        }

        renderCameraShell('creator.startingCamera');

        try {
          state.stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: 'user',
              // No width/height here on purpose. Asking for 960x720 forced a
              // landscape stream, which a portrait phone then cover-cropped by
              // nearly half — the face looked fine on screen but measured tiny
              // against the frame the detector actually sees.
              width: { ideal: 1280 },
              aspectRatio: { ideal: window.innerHeight > window.innerWidth ? 3 / 4 : 4 / 3 },
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
            error: err?.name ?? 'unknown',
            message: String(err?.message ?? '').slice(0, 120),
            in_app: inAppBrowser() ?? 'no',
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
          renderConsent('creator.detectorFailed');
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
        const start = localized('button', 'btn btn--primary', 'creator.tapStart');
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
            renderConsent('creator.detectorFailedShort');
            return;
          }
          setCameraHint('creator.centerFace');
          runDetectionLoop();
        });

        const cancelBtn = localized('button', 'btn btn--ghost', 'common.cancel');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', cancel);

        const actions = state.video.closest('.modal').querySelector('.modal__actions');
        actions.replaceChildren(cancelBtn, start);
        setCameraHint('creator.browserPaused');
      }

      function setCameraHint(key, variables = {}, tone) {
        state.hintKey = key;
        state.hintVariables = variables;
        if (!state.hint) return;
        state.hint.textContent = t(key, variables);
        if (tone) state.hint.dataset.tone = tone;
        else delete state.hint.dataset.tone;
      }

      function renderCameraShell(hintKey) {
        dialog.replaceChildren();

        const stage = el('div', 'creator__stage');
        const debug = DEBUG ? el('pre', 'creator__debug') : null;
        const video = document.createElement('video');
        video.className = 'creator__video';
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;

        // The canvas paints the picture as well as the mesh, so it is sized
        // and mirrored in `tick` rather than by CSS.
        const overlay = document.createElement('canvas');
        overlay.className = 'creator__overlay';

        state.hintKey = hintKey;
        state.hintVariables = {};
        const hint = localized(
          'div',
          'creator__hint',
          () => state.hintKey,
          () => state.hintVariables,
        );
        stage.append(video, overlay, hint);
        if (debug) stage.append(debug);

        const capture = localized('button', 'btn btn--primary', 'creator.capture');
        capture.type = 'button';
        capture.disabled = true;
        capture.addEventListener('click', () => takeShot());

        const cancelBtn = localized('button', 'btn btn--ghost', 'common.cancel');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', cancel);

        const actions = el('div', 'modal__actions');
        actions.append(cancelBtn, capture);

        dialog.append(
          localized('h2', 'modal__title', 'creator.lineUp'),
          stage,
          actions,
        );

        state.video = video;
        state.overlay = overlay;
        state.hint = hint;
        state.captureBtn = capture;
        state.debug = debug;
        state.stage = 'camera';
      }

      function renderPermissionDenied(err) {
        stopCamera();
        dialog.replaceChildren();

        const retry = localized('button', 'btn btn--primary', 'common.tryAgain');
        retry.type = 'button';
        retry.addEventListener('click', () => startCamera());

        const cancelBtn = localized('button', 'btn btn--ghost', 'common.cancel');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', cancel);

        const actions = el('div', 'modal__actions');
        actions.append(cancelBtn, retry);

        // Every failure used to read the same, which is exactly why "denied"
        // told us nothing. Each of these has a different fix.
        const reason = err?.name;
        const trapped = inAppBrowser();

        const adviceKeys = [];
        if (reason === 'NotFoundError' || reason === 'OverconstrainedError') {
          adviceKeys.push('creator.noCamera');
          if (isDesktop()) {
            adviceKeys.push('creator.checkWebcam');
          }
        } else if (reason === 'NotReadableError' || reason === 'TrackStartError') {
          adviceKeys.push('creator.cameraBusy');
        } else if (isDesktop()) {
          // The Windows case we actually saw: ten straight denials from one
          // desktop Chrome. Both causes look identical to the page.
          adviceKeys.push('creator.desktopPermission', 'creator.windowsPermission');
        } else {
          adviceKeys.push('creator.sitePermission');
        }

        dialog.append(
          localized('h2', 'modal__title', 'creator.permissionTitle'),
          ...adviceKeys.map((key) => localized('p', 'modal__body', key)),
          localized('p', 'modal__body', 'creator.privacyReminder'),
          // Offered, not asserted: some of these browsers work fine.
          ...(trapped ? [escapeHatch(trapped)] : []),
          actions,
        );
      }

      // ------------------------------------------ detection loop + auto-capture

      function runDetectionLoop() {
        const { video, overlay, hint, captureBtn } = state;

        // Times, not frame counts, so a slow phone behaves like a fast laptop.
        const hold = createHoldTimer();

        // The frame the detector reads, drawn by us.
        //
        // Handed the <video> element directly, MediaPipe normalizes its output
        // against dimensions the browser reports for it — and on this phone it
        // came back with the chin 11% below the bottom of a frame the chin was
        // plainly inside. Nothing downstream can recover from coordinates
        // measured against a picture nobody else has. So the video goes into a
        // canvas of our own first, and that canvas is what gets detected,
        // displayed and cut out: one bitmap, whose dimensions are not a matter
        // of opinion.
        const READ_HEIGHT = 640;
        const read = document.createElement('canvas');
        const readCtx = read.getContext('2d');
        let stalled = false;
        const loopStarted = performance.now();
        let attempts = 0;
        let lastTimestamp = -1;
        const detectStarted = performance.now();
        let reportedDetection = false;

        // Report the first framing rejection of this session, with the numbers
        // behind it. Guessing at these from a screenshot is how the last two
        // rounds went; measured values end that.
        let reportedFraming = false;

        // A GPU delegate that returns nonsense rather than failing outright is
        // invisible from here except in its output, so watch the output. A few
        // impossible frames are a person moving past the edge of the picture; a
        // steady run of them is the detector, and the CPU path is the way out.
        let impossibleFrames = 0;
        let swappingDelegate = false;
        function watchForNonsense(landmarks) {
          if (isPlausible(landmarks)) {
            impossibleFrames = 0;
            return;
          }
          impossibleFrames += 1;
          if (impossibleFrames < 20 || swappingDelegate || activeDelegate !== 'GPU') return;

          swappingDelegate = true;
          const box = boundsOf(landmarks);
          track('face_detector_delegate_swapped', {
            from: 'GPU',
            box: `${round(box.minX)},${round(box.minY)} .. ${round(box.maxX)},${round(box.maxY)}`,
          });
          setCameraHint('creator.adjusting');
          useCpuDelegate(state.landmarker)
            .then((cpu) => {
              if (state.stage === 'camera') state.landmarker = cpu;
              impossibleFrames = 0;
            })
            .catch((err) => {
              console.warn('[ffa] could not switch to the CPU detector', err);
            })
            .finally(() => {
              swappingDelegate = false;
            });
        }

        function reportFraming(hint, landmarks) {
          if (reportedFraming) return;
          reportedFraming = true;
          const { minX, minY, maxX, maxY } = boundsOf(landmarks);
          const raw = rawBoundsOf(landmarks);
          track('face_framing_rejected', {
            hint,
            w: round(maxX - minX),
            h: round(maxY - minY),
            cx: round((minX + maxX) / 2),
            cy: round((minY + maxY) / 2),
            // The untrimmed extremes alongside them, so a gap between the two
            // says outliers outright instead of leaving it to be inferred.
            raw: `${round(raw.minX)},${round(raw.minY)} .. ${round(raw.maxX)},${round(raw.maxY)}`,
            points: landmarks.length,
            video: `${video.videoWidth}x${video.videoHeight}`,
            read: `${read.width}x${read.height}`,
            stage: `${overlay.clientWidth}x${overlay.clientHeight}`,
          });
        }

        const tick = () => {
          state.rafId = requestAnimationFrame(tick);

          if (video.readyState < 2 || !state.landmarker) {
            // A camera that never delivers a frame used to leave the user
            // staring at "Starting camera…" with nothing to act on. Say so
            // instead of spinning silently.
            if (!stalled && performance.now() - loopStarted > 6000) {
              stalled = true;
              track('camera_stalled', { browser: navigator.userAgent });
              setCameraHint('creator.cameraStalled');
            }
            return;
          }
          stalled = false;

          // One canvas, one coordinate space.
          //
          // Until now the picture came from the <video> and the mesh from a
          // transparent <canvas> on top, and they lined up only if the browser
          // applied `object-fit: cover` to both replaced elements identically
          // and mirrored both the same way. On the phone they did not, and the
          // mesh landed off the face while every number the detector reported
          // was correct. So the canvas now draws the frame itself and the mesh
          // over it, through the same crop and the same mirror: they cannot
          // disagree, whatever the browser thinks the video's dimensions are.
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const wantWidth = Math.round(overlay.clientWidth * dpr);
          const wantHeight = Math.round(overlay.clientHeight * dpr);
          if (wantWidth && (overlay.width !== wantWidth || overlay.height !== wantHeight)) {
            overlay.width = wantWidth;
            overlay.height = wantHeight;
          }

          // Keep the read canvas the shape of the stage, so the picture the
          // detector sees is the picture the user is framing themselves in.
          const wantRead = Math.round((READ_HEIGHT * overlay.width) / overlay.height);
          if (read.width !== wantRead) {
            read.width = wantRead;
            read.height = READ_HEIGHT;
          }

          const crop = coverCrop(video.videoWidth, video.videoHeight, read.width, read.height);
          if (!crop) return;
          readCtx.drawImage(
            video,
            crop.sx, crop.sy, crop.sw, crop.sh,
            0, 0, read.width, read.height,
          );

          // MediaPipe rejects a repeated timestamp, which happens whenever the
          // display refreshes faster than the camera produces frames.
          const timestamp = performance.now();
          if (timestamp <= lastTimestamp) return;
          lastTimestamp = timestamp;

          let result;
          try {
            result = state.landmarker.detectForVideo(read, timestamp);
          } catch {
            return;
          }

          const ctx = overlay.getContext('2d');
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          // Selfie view. Mirroring the context mirrors the mesh with the
          // picture, instead of hoping two CSS transforms agree.
          ctx.setTransform(-1, 0, 0, 1, overlay.width, 0);
          ctx.drawImage(read, 0, 0, overlay.width, overlay.height);

          // Normalize before anything reads these: one browser hands back
          // pixel coordinates, and every consumer downstream assumes [0,1].
          const landmarks = normalizeLandmarks(
            primaryFace(result.faceLandmarks),
            read.width,
            read.height,
          );
          attempts += 1;

          if (!landmarks) {
            hold.bad(timestamp);
            captureBtn.disabled = true; // nothing to capture
            setCameraHint('creator.centerFace');
            // The no-face case is the one worth reading off the screen: it says
            // whether the camera is even producing frames.
            showDebug(['no face', `frames ${attempts}`]);
            return;
          }

          if (!reportedDetection) {
            reportedDetection = true;
            track('face_detected', {
              detection_ms: Math.round(performance.now() - detectStarted),
              attempts,
            });
          }

          // The landmarks are already in the read canvas's coordinates, which
          // is what is on the screen and what the cut-out will use. There is
          // nothing left to convert between.
          //
          // The bitmap is `dpr` device pixels per CSS pixel, so line widths
          // divide by that to stay a fixed thickness on screen.
          drawFaceMesh(ctx, landmarks, 1 / dpr);
          state.landmarks = landmarks;
          state.frame = read;

          watchForNonsense(landmarks);
          const problem = framingHint(landmarks);

          if (state.debug) {
            const b = boundsOf(landmarks);
            showDebug([
              `points ${landmarks.length}  frames ${attempts}`,
              `read ${read.width}x${read.height}`,
              `crop ${Math.round(crop.sw)}x${Math.round(crop.sh)}+${Math.round(crop.sx)}+${Math.round(crop.sy)}`,
              `face ${round(b.minX)},${round(b.minY)} ${round(b.maxX)},${round(b.maxY)}`,
              problem ? `HINT ${problem}` : 'framing ok',
            ]);
          }
          if (problem) {
            hold.bad(timestamp);
            // The hint is advice, not a veto. Disabling the button here meant
            // one wrong judgement left someone stuck in front of a camera with
            // no way to take the photo themselves. If there is a face, they can
            // always shoot it.
            captureBtn.disabled = false;
            setCameraHint(`creator.framing.${problem}`);
            reportFraming(problem, landmarks);
            return;
          }

          // A good frame: the face is usable right now, so the manual button
          // works even if the hold never completes.
          captureBtn.disabled = false;
          hold.good(timestamp);

          if (hold.isComplete(timestamp)) {
            setCameraHint('creator.gotIt', {}, 'ready');
            takeShot(); // never on an empty frame (spec S3 / §10)
            return;
          }
          // Show the countdown, so a hold that is not completing looks like
          // something the user can influence rather than a dead screen.
          setCameraHint('creator.holdStill', {
            count: Math.ceil(hold.remaining(timestamp) / 300),
          });
        };

        /**
         * Every readout carries the frame geometry, because a wrong scale there
         * is what makes every other number wrong.
         */
        function showDebug(lines) {
          if (!state.debug) return;
          state.debug.textContent = [
            `video ${video.videoWidth}x${video.videoHeight} ${video.readyState}`,
            `stage ${overlay.clientWidth}x${overlay.clientHeight}`,
            `delegate ${activeDelegate ?? '?'}  odd ${impossibleFrames}`,
            ...lines,
          ].join('\n');
        }

        state.rafId = requestAnimationFrame(tick);
      }

      function takeShot() {
        if (!state.landmarks || !state.frame || state.stage !== 'camera') return;
        const started = performance.now();

        let capture;
        try {
          // The same bitmap the landmarks were measured against, so the mask
          // cannot land anywhere but on the face it outlined.
          capture = cutOutFace(state.frame, state.landmarks);
        } catch (err) {
          // Includes the empty-cutout guard: a blank face would otherwise sail
          // through to the tank and become a fish with no face on it.
          track('face_cutout_failed', {
            message: String(err?.message ?? err).slice(0, 120),
            frame: `${state.frame.width}x${state.frame.height}`,
          });
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

        const retry = localized('button', 'btn btn--primary', 'common.tryAgain');
        retry.type = 'button';
        retry.addEventListener('click', () => startCamera());

        const cancelBtn = localized('button', 'btn btn--ghost', 'common.cancel');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', cancel);

        const actions = el('div', 'modal__actions');
        actions.append(cancelBtn, retry);

        dialog.append(
          localized('h2', 'modal__title', 'creator.generationTitle'),
          localized('p', 'modal__body', 'creator.generationBody'),
          actions,
        );
      }

      // ------------------------------------------------------- stage: preview

      function renderPreview(errorKey) {
        state.preview?.dispose();
        dialog.replaceChildren();

        const stage = el('div', 'creator__stage');
        const canvas = document.createElement('canvas');
        canvas.className = 'creator__preview';
        stage.append(canvas);

        const shuffle = localized('button', 'btn btn--ghost btn--small', 'creator.shuffle');
        shuffle.type = 'button';
        shuffle.addEventListener('click', () => {
          state.look = randomLook();
          state.preview.rebuild(state.look);
        });

        const retake = localized('button', 'btn btn--ghost', 'creator.retake');
        retake.type = 'button';
        retake.addEventListener('click', () => {
          state.capture = null;
          state.preview?.dispose();
          state.preview = null;
          startCamera();
        });

        const cancelBtn = localized('button', 'btn btn--ghost', 'common.cancel');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', cancel);

        const add = localized(
          'button',
          'btn btn--primary',
          () => state.submitting ? 'creator.adding' : 'creator.addToTank',
        );
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
          localized('h2', 'modal__title', 'creator.previewTitle'),
          stage,
          ...(errorKey ? [localized('p', 'modal__error', errorKey)] : []),
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
        button.textContent = t('creator.adding');

        try {
          const { fish } = await api.createFish(tankId, {
            faceImage: state.capture.dataUrl,
            ...state.look,
          });
          track('fish_added', { tank_id: tankId, fish_id: fish.id });
          onCreated?.(fish);
          close(fish);
          toast('creator.added', { tone: 'good' });
        } catch (err) {
          state.submitting = false;
          const errorKey = err instanceof ApiError
            ? `api.${err.code}`
            : 'creator.submitError';
          renderPreview(errorKey);
        }
      }

      renderConsent();
    },
  });
}
