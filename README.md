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

`npm test` runs the game-rule unit tests and the API integration tests.

---

## Deploying it

**HTTPS is not optional.** Browsers refuse `getUserMedia` on an insecure
origin, so on plain http nobody can add a fish — the tank renders and feeding
works, but the camera flow dies at the first step. `localhost` is exempt, which
is why development works without a certificate. Plan on a domain name.

### Docker (recommended)

`compose.yaml` runs the app behind [Caddy](https://caddyserver.com), which
obtains and renews a Let's Encrypt certificate on its own.

```sh
cp .env.example .env      # then set FFA_EMAIL and FFA_PASSPHRASE
docker compose up -d --build

# put the demo fish in, if you want them
docker compose exec app node scripts/seed.js
```

`.env` is gitignored on purpose: this repository is public, and an address or a
passphrase committed to it is no longer either. `FFA_DOMAIN` defaults to the
deployed hostname; `FFA_EMAIL` and `FFA_PASSPHRASE` have no defaults, so compose
fails fast with a readable message rather than starting an unprotected tank.

Ports 80 and 443 must be reachable from the internet for the certificate
challenge to succeed, and the hostname must already resolve to the host.

### Without Docker

```sh
npm ci
npm run build
FFA_DATA_DIR=/var/lib/friend-fish-aquarium \
  FFA_TRUST_PROXY=1 \
  FFA_PASSPHRASE='something you can say out loud' \
  npm start
```

`deploy/friend-fish-aquarium.service` is a systemd unit for this; it reads the
passphrase from `/etc/friend-fish-aquarium.env` (`chmod 600`) rather than from
the unit file, which is world-readable. Put a
TLS-terminating reverse proxy in front of it either way; `deploy/Caddyfile` is
a working example, and the one setting that matters for any proxy is that
**`/api/tanks/*/events` must not be buffered** — it is a Server-Sent Events
stream, and a proxy that buffers it will make the activity feed appear frozen
until the connection drops. In nginx that means `proxy_buffering off;` on that
location.

### Configuration

| Variable | Default | |
| --- | --- | --- |
| `PORT` | `8787` | |
| `FFA_DATA_DIR` | `./data` | Holds `aquarium.db`. The only thing to back up. |
| `FFA_TRUST_PROXY` | unset | Set to `1` **only** when a reverse proxy you control is definitely in front. It makes the app believe `X-Forwarded-Proto`, which anyone can send — without a proxy to overwrite it, that would let a client talk the app out of marking the session cookie `Secure`. |
| `FFA_PASSPHRASE` | unset | The shared passphrase for the tank. Unset means an open tank. See below. |

### Who can get in

A hostname stops being a secret the moment a certificate is issued for it —
Certificate Transparency logs are public and scanners read them within minutes.
So "nobody knows the URL" is not access control, and an open tank means any
passer-by can see your friends' faces and upload their own.

`FFA_PASSPHRASE` gates the whole tank behind one shared passphrase. It covers
reads, not just writes, because seeing the tank *is* seeing everyone's face.
Anyone with the passphrase is in; there are no per-person accounts, which suits
a group who will read it out over a chat thread.

- Minimum 8 characters. The server refuses to start with less rather than
  quietly protecting nothing.
- The gate cookie is an HMAC of a fixed message keyed by the passphrase, so
  there is no second secret to manage, cookies survive restarts, and changing
  the passphrase logs everybody out at once.
- A wrong guess costs a fixed 300ms, which holds guessing to a few attempts a
  second without any per-IP bookkeeping (behind a proxy that would mean trusting
  a header anyone can forge).
- `/api/health` stays open so the healthcheck works, and the page itself still
  loads — otherwise there would be nothing to render the prompt in.

This is a shared passphrase, not authentication: it keeps strangers out, and it
does not stop someone who has it from passing it on. For a friend group that is
the right trade; if you ever need more, the invite-code plumbing
(`?tank=<code>`) is already in the data model.

Game rules (fullness decay, feed amount, cooldowns, the ignore chance) all live
in `server/config.js` and are meant to be tuned.

### Backups

The database holds everything, including the stored face images, so one file is
the whole backup:

```sh
./deploy/backup.sh /path/to/backups          # keeps the last 14
```

It uses SQLite's `.backup`, which is safe to run against a live server — a
plain `cp` of a WAL-mode database is not.

---

## What's here

| Spec | Where |
| --- | --- |
| S1 Aquarium scene, fish motion, name + status bar | `client/src/scene/`, `client/src/ui/labels.js` |
| S2-S4 Add your fish → camera → face mesh → preview | `client/src/creator/` |
| S5 Activity feed pills | `client/src/ui/activity-feed.js` |
| §6 Fullness / feed / ignore rules | `server/game.js`, `server/config.js` |
| §7 Data model | `migrations/0001_init.sql` |
| §8 API + realtime | `server/router.js`, `server/sse.js` |
| §9 Face → fish pipeline | `client/src/creator/face-detector.js`, `face-cutout.js` |
| §11 Analytics events | `client/src/analytics.js` |
| §12 Privacy & performance | see below |

### Stack

- **Server** — Node, no framework. `server/router.js` is the whole API, written
  against Web `Request`/`Response`; `server/node.js` is the ~60 lines of
  `node:http` plumbing plus static file serving. SQLite via `better-sqlite3`,
  Server-Sent Events for realtime.
- **Client** — Vite, three.js for the tank, MediaPipe Face Landmarker for face
  detection. Plain DOM for the UI; the only "framework" is a ~130-line pub/sub
  store in `client/src/state.js`.
- **Shared** — `shared/` holds the fish variants and the activity-log copy, so
  the client and server can never disagree about what a fish can look like or
  what a log line says.

The schema in `migrations/` is applied on boot and every statement is
idempotent, so deploying is "start the new version" — there is no migration
step to forget.

---

## Product decisions

The spec flags a lot of things as `[추정]` (inferred) or `[확인 필요]` (needs a
decision). Here is what this implementation decided, and why. Everything
numeric lives in `server/config.js`.

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
  from this app's own origin, not a CDN. No third party sees that you opened
  the camera.
- Raw video **never leaves the device**. What is uploaded is a single derived
  PNG: the frame cropped to the detected face oval, masked, and downscaled to
  384px. The server re-validates the PNG magic bytes and size before storing it.
- The camera stream is stopped the moment it is no longer needed — after a
  capture, on cancel, and on every error path.
- Consent is explicit: the creator will not open the camera until you tick the
  box explaining what is stored.
- **Delete my fish** removes the row and the stored image. **Delete my fish and
  data** additionally erases the account, its sessions and its memberships.
  Both are in the menu behind your name.

Face images are rows in the database rather than files on disk, so deleting a
fish deletes its image in the same transaction — there is no orphaned-file path
to get wrong, and no CDN cache to purge.

## Accessibility & performance (§12)

- Every fish carries a real `<button>` name tag projected from the 3D scene, so
  the tank is fully operable by keyboard and screen reader — clicking the mesh
  is a shortcut, not the only way in.
- Modals trap focus and close on Escape. `prefers-reduced-motion` disables the
  UI animation.
- The renderer caps device pixel ratio at 2, fits the fish's swimmable box to
  the visible frustum so a phone in portrait still sees the whole cast, and
  shares geometry across every fish. Textures are generated on a canvas at boot,
  so the first frame waits on no network request.

## API

| Method | Path | |
| --- | --- | --- |
| `GET` | `/api/tanks/default` | tank, members, fish, recent activity, rules |
| `GET` | `/api/tanks/by-invite/:code` | same, by invite code |
| `GET` | `/api/tanks/:id/events` | SSE: `tank.fish.created`, `tank.fish.deleted`, `fish.status.updated`, `activity.created`, `presence.updated` |
| `POST` | `/api/tanks/:id/fish` | register a fish (replaces yours if you have one) |
| `POST` | `/api/tanks/:id/presence` | heartbeat; produces "{user} is here" |
| `POST` | `/api/fish/:id/feed` | returns `accepted` \| `full` \| `ignored` \| `cooldown` |
| `DELETE` | `/api/fish/:id` | remove your fish and its stored image |
| `POST` | `/api/session` | sign in with a display name |
| `DELETE` | `/api/me` | erase account, fish and stored faces |
| `GET` | `/api/health` | liveness probe |
| `GET` | `/faces/:id.png` | a stored face cutout |

The feed result is decided entirely on the server. A client cannot talk its way
past the full guard, the cooldown or the ignore roll.

If the event stream cannot be held open — a proxy that buffers
`text/event-stream`, say — the client notices after three failures and falls
back to polling the tank every 5s, which spec §8 explicitly allows for a small
group. Fixing the proxy is better, but the tank never simply stops updating.

## Known gaps

- Fish look (colour, body, fins) is rolled randomly with a "Shuffle look"
  button. There is no explicit customiser — the Reel doesn't show one, and
  spec S4 lists it as unobserved.
- One tank per deployment in the UI. The schema supports more.
- Analytics are written to SQLite, not forwarded anywhere.
- `Dockerfile` and `compose.yaml` are written but were not built here (no Docker
  daemon in the authoring environment). The runtime file set they produce was
  verified by running the server from exactly those paths.
