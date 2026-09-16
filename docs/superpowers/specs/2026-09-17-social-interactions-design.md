# Social Interactions Design

## Goal

Add three playful, non-destructive social interactions: emoji reactions, a gentle hit, and a short fishing timing game. They must work in English and Korean, appear live to connected friends, and never change fullness, ownership, or stored fish data.

## User Experience

- A signed-in visitor can react to a selected fish with `❤️`, `😂`, `😮`, or `👏`. The emoji floats above that fish for every connected viewer.
- A signed-in visitor can tap **Nudge / 툭 치기** on another person's fish. The fish wiggles and a splash effect appears. Self-hits are rejected.
- A signed-in visitor can start fishing from the HUD. The client chooses a visible fish, waits a randomized 1.5–3.5 seconds, then opens a 900ms **Reel now / 지금 당기기** window. A correct tap asks the server to catch that fish; an early or late tap is a local miss. The caught fish rises briefly with a hook-line effect and returns unchanged. A user's own fish is eligible so fishing still works in a solo tank.
- Effects are ephemeral and are not added to the activity log, preventing spam. The existing interactions table records accepted server actions for cooldown enforcement and analytics.

## Server Contracts

- `POST /api/fish/:fishId/reactions` with `{ "emoji": "❤️" }` validates the allowlist, session, fish existence, and per-actor reaction cooldown.
- `POST /api/fish/:fishId/hit` validates session, fish existence, non-ownership, and per-actor hit cooldown.
- `POST /api/fish/:fishId/catch` validates session, fish existence, and per-actor fishing cooldown.
- Accepted actions return `{ ok: true, effect }` and publish `fish.effect` on the fish's tank. `effect` contains `kind`, `fishId`, `actorName`, and only the kind-specific `emoji` field.
- Cooldowns are 750ms for reactions, 5s for hits, and 15s for successful catches. A rejected cooldown returns HTTP 429 with `error: interaction_cooldown` and `retryAfterMs`.
- Invalid emojis return HTTP 400 `invalid_reaction`; self-hits return HTTP 400 `cannot_hit_self`. Missing fish and anonymous users keep the existing error contracts.

## Client Architecture

- The API wrapper exposes `react(fishId, emoji)`, `hit(fishId)`, and `catchFish(fishId)`.
- Realtime forwards `fish.effect` to a dedicated effects controller. The controller anchors DOM effects to `aquarium.projectFish()` and asks the aquarium to animate hit/catch motion.
- The fish card owns reaction and hit controls. A fishing controller owns the HUD button, randomized timing state, miss/success feedback, and submission.
- All visible copy is added to both i18n catalogs with identical interpolation variables. Analytics use stable English event names and action codes.

## Failure and Accessibility Behavior

- Controls are disabled while their request is pending. Cooldown, missing-fish, and network errors use localized toasts and never leave the UI stuck.
- Fishing can be cancelled with Escape and is cancelled automatically if the target fish disappears, the viewer signs out, or the tab becomes hidden.
- Reaction buttons have localized accessible names including the emoji and fish owner. Fishing status uses `role="status"`; animation respects `prefers-reduced-motion`.
- Polling fallback preserves the actions but cannot replay already-finished ephemeral effects; the initiating user still sees the local accepted effect from the API response.

## Testing

- Unit tests cover emoji validation and cooldown calculations.
- API integration tests cover authentication, validation, self-hit rejection, accepted effect payloads, persisted interaction records, cooldown responses, and `fish.effect` SSE delivery.
- Client timing logic is extracted as a pure state machine and tested for waiting, early, success-window, late, cancellation, and deterministic target selection.
- The full test suite and production build must pass, followed by browser checks in English and Korean at desktop and mobile widths.
