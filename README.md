# friend fish aquarium

> "makes a site where my friends can add themselves as fish and we feed each
> other like tamagotchis"

A shared 3D tank. Everyone puts their own face on a fish, the fish swim around
together, and you keep each other fed. Checking in on your friends, as a chore
you might actually do.

This is an implementation of `friend_fish_aquarium_spec_ko.md` — the MVP defined
in §16, with the full functional requirement list from §5 covered.

```
npm install
npm run seed     # optional: fills the tank with demo fish so it isn't empty
npm run dev      # API on :8787, client on :5173
open http://localhost:5173
```

For a production build: `npm run build && npm start` (the server then serves
`dist/` itself on `:8787`).

`npm test` runs the game-rule unit tests and the API integration tests.

---

## What's here

| Spec | Where |
| --- | --- |
| S1 Aquarium scene, fish motion, name + status bar | `client/src/scene/`, `client/src/ui/labels.js` |
| S2-S4 Add your fish → camera → face mesh → preview | `client/src/creator/` |
| S5 Activity feed pills | `client/src/ui/activity-feed.js` |
| §6 Fullness / feed / ignore rules | `server/game.js`, `server/config.js` |
| §7 Data model | `server/db.js` |
| §8 API + realtime | `server/api.js`, `server/realtime.js` |
| §9 Face → fish pipeline | `client/src/creator/face-detector.js`, `face-cutout.js` |
| §11 Analytics events | `client/src/analytics.js` |
| §12 Privacy & performance | see below |

### Stack

- **Server** — Node + Express, SQLite (`better-sqlite3`), Server-Sent Events for
  realtime. No build step, no external services.
- **Client** — Vite, three.js for the tank, MediaPipe Face Landmarker for face
  detection. Plain DOM for the UI; the only "framework" is a ~130-line pub/sub
  store in `client/src/state.js`.
- **Shared** — `shared/` holds the fish variants and the activity-log copy, so
  the client and server can never disagree about what a fish can look like or
  what a log line says.

---

## Product decisions

The spec flags a lot of things as `[추정]` (inferred) or `[확인 필요]` (needs a
decision). Here is what this implementation decided, and why. Everything
numeric lives in `server/config.js` and is meant to be tuned.

**One tank, joined by link (§15).** The Reel only ever shows a single shared
tank, so that is what this builds: the server creates one on first boot, and
`?tank=<inviteCode>` opens it. The data model already carries multiple tanks, so
adding a "create a tank" flow later is a route, not a migration.

**Auth is a nickname plus the link (§15).** No password, no email, no OAuth. You
type a name, you get an httpOnly session cookie, you are in. For a group of
friends sharing a link, an account system would be all cost and no benefit — and
the less we know about people whose faces we are storing, the better.

**The bar is fullness (§15).** Not health, not energy. 0-100, shown under the
name, colour-coded hungry / okay / full.

**Fullness decays, ~100 points per 24 hours (§6).** Without decay there is no
reason to come back, and the tamagotchi joke stops working. Decay is computed
lazily from `fullness` + `fullness_updated_at` at read time, so it keeps ticking
while the server is off and needs no scheduler.

**One feed is worth 15, with an 8-second per-person cooldown (§6, §10).** So
roughly five feeds take a starving fish to full, and no one can hold down the
button.

**"Ignored" is a reaction, not noise (§15).** The Reel shows `beandog ignored
clare` right after three feeds and an `is full`, so ignoring reads as a response
to being pestered. Base chance 15%, +25% if the same person fed this fish in the
last two minutes, +20% if it is nearly sated, capped at 60%. An ignored feed
changes nothing but still writes the log line.

**Fish size is decoration, not growth (§15).** Scale, body shape, fin shape and
colour are rolled at creation. The Reel's wildly different fish sizes are the
joke; tying size to fullness would make everyone converge on the same fish.
Fullness does change how a fish *moves* — a full fish is visibly lazier.

**Self-feeding is allowed (§10).** Otherwise the first person in an empty tank
has nothing to do. It is recorded as a distinct interaction type so analytics
can separate it, it cannot trigger the "ignored" reaction, and it can be turned
off with one flag in `config.js`.

**The activity feed keeps 7 days, shows the last 6 (§15).** Expandable to 40.
The tank has to stay visible behind it.

**Auto-capture, but only when the face is steady (S3 vs §10).** The Reel has no
shutter button, so the creator captures on its own once a well-framed face has
held still for about 20 frames — never on an empty or badly framed one. A manual
Capture button is always there too.

---

## Privacy (§12, FR-020, AC-11)

The camera pipeline runs entirely in the browser:

- The MediaPipe wasm runtime and the `face_landmarker.task` model are served
  from this app's own origin (`public/`), not a CDN. No third party sees that
  you opened the camera.
- Raw video **never leaves the device**. What is uploaded is a single derived
  PNG: the frame cropped to the detected face oval, masked, and downscaled to
  512px. The server re-validates the PNG magic bytes and size before storing it.
- The camera stream is stopped the moment it is no longer needed — after a
  capture, on cancel, and on every error path.
- Consent is explicit: the creator will not open the camera until you tick the
  box explaining what is stored.
- **Delete my fish** removes the row and the PNG from disk. **Delete my fish and
  data** additionally erases the account, its sessions and its memberships.
  Both are in the menu behind your name.

## Accessibility & performance (§12)

- Every fish carries a real `<button>` name tag projected from the 3D scene, so
  the tank is fully operable by keyboard and screen reader — clicking the mesh
  is a shortcut, not the only way in.
- Modals trap focus and close on Escape. `prefers-reduced-motion` disables the
  UI animation.
- The renderer caps device pixel ratio at 2, widens the field of view on tall
  phones, and shares geometry across every fish. Textures are generated on a
  canvas at boot, so the first frame waits on no network request.

## Data model

`users`, `tanks`, `tank_members`, `fish`, `interactions`, `activity_events` —
as in spec §7, plus `sessions` for the cookie auth and `analytics_events` for
§11. Schema is in `server/db.js`; it is created on first boot.

Everything lives under `data/` (override with `FFA_DATA_DIR`): `aquarium.db`
and `faces/`.

## API

| Method | Path | |
| --- | --- | --- |
| `GET` | `/api/tanks/default` | tank, members, fish, recent activity, rules |
| `GET` | `/api/tanks/by-invite/:code` | same, by invite code |
| `GET` | `/api/tanks/:id/events` | SSE: `tank.fish.created`, `tank.fish.deleted`, `fish.status.updated`, `activity.created`, `presence.updated` |
| `POST` | `/api/tanks/:id/fish` | register a fish (replaces yours if you have one) |
| `POST` | `/api/tanks/:id/presence` | heartbeat; produces "{user} is here" |
| `POST` | `/api/fish/:id/feed` | returns `accepted` \| `full` \| `ignored` \| `cooldown` |
| `DELETE` | `/api/fish/:id` | remove your fish and its face asset |
| `POST` | `/api/session` | sign in with a display name |
| `DELETE` | `/api/me` | erase account, fish and stored faces |

The feed result is decided entirely on the server. A client cannot talk its way
past the full guard, the cooldown or the ignore roll.

## Known gaps

- Fish look (colour, body, fins) is rolled randomly with a "Shuffle look"
  button. There is no explicit customiser — the Reel doesn't show one, and
  spec S4 lists it as unobserved.
- One tank per deployment in the UI. The schema supports more.
- Analytics are written to SQLite, not forwarded anywhere.
