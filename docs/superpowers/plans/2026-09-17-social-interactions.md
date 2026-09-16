# Social Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add localized emoji reactions, playful nudging, and a non-destructive fishing timing game with realtime effects.

**Architecture:** Specific HTTP routes validate and record accepted actions, then publish a shared `fish.effect` SSE payload. Pure helpers own cooldown and fishing-round decisions; DOM/Three.js adapters only render effects and controls.

**Tech Stack:** Node.js Web APIs, SQLite, Server-Sent Events, plain DOM, Three.js, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-17-social-interactions-design.md`

## Global Constraints

- Effects never change fullness, fish ownership, or persisted fish data.
- Supported reactions are exactly `❤️`, `😂`, `😮`, and `👏`.
- Cooldowns are 750ms for reactions, 5s for hits, and 15s for catches.
- All user-visible copy must exist in both English and Korean catalogs.
- No new runtime dependency or database migration.

---

### Task 1: Social action rules and server routes

**Files:**
- Create: `shared/social-interactions.js`
- Modify: `server/config.js`, `server/store.js`, `server/router.js`
- Test: `tests/social-interactions.test.js`, `tests/api.test.js`

**Interfaces:**
- Produces: `REACTION_EMOJIS`, `isReactionEmoji(value)`, `cooldownRemaining(lastAt, now, cooldownMs)`.
- Produces: store method `msSinceInteraction({ tankId, actorUserId, targetFishId?, type })`.
- Produces: `POST /api/fish/:fishId/reactions`, `/hit`, and `/catch`, returning `{ ok: true, effect }`.

- [ ] **Step 1: Write failing rule tests**

```js
assert.equal(isReactionEmoji('❤️'), true);
assert.equal(isReactionEmoji('🔥'), false);
assert.equal(cooldownRemaining(1000, 1500, 750), 250);
assert.equal(cooldownRemaining(null, 1500, 750), 0);
```

- [ ] **Step 2: Run `node --test tests/social-interactions.test.js` and verify missing exports fail**

- [ ] **Step 3: Implement the shared allowlist and cooldown helper, then rerun until green**

- [ ] **Step 4: Add failing API tests**

```js
const bad = await actor.client('POST', `/api/fish/${target.fish.id}/reactions`, { emoji: '🔥' });
assert.equal(bad.body.error, 'invalid_reaction');
const hitSelf = await actor.client('POST', `/api/fish/${actor.fish.id}/hit`);
assert.equal(hitSelf.body.error, 'cannot_hit_self');
const caught = await actor.client('POST', `/api/fish/${target.fish.id}/catch`);
assert.equal(caught.body.effect.kind, 'catch');
```

- [ ] **Step 5: Run the focused API tests and verify the routes fail with 404**

- [ ] **Step 6: Implement route validation, interaction persistence, cooldown responses, and `fish.effect` publishing**

- [ ] **Step 7: Run rule and API tests; confirm accepted actions, 429 retry values, authorization, and SSE payloads pass**

- [ ] **Step 8: Commit**

```bash
git add shared/social-interactions.js server/config.js server/store.js server/router.js tests/social-interactions.test.js tests/api.test.js
git commit -m "feat: add social interaction API"
```

### Task 2: Fishing state machine and client API

**Files:**
- Create: `client/src/fishing-game.js`
- Modify: `client/src/api.js`
- Test: `tests/fishing-game.test.js`

**Interfaces:**
- Produces: `createFishingRound(fish, { now, random }) -> { targetFishId, biteAt, deadline } | null`.
- Produces: `fishingPhase(round, now) -> 'waiting' | 'bite' | 'missed'` and `reelFishing(round, now) -> 'early' | 'caught' | 'late'`.
- Produces: `api.react`, `api.hit`, and `api.catchFish`.

- [ ] **Step 1: Write failing deterministic timing and target tests**

```js
const round = createFishingRound([{ id: 'a' }, { id: 'b' }], { now: 1000, random: () => 0 });
assert.equal(round.targetFishId, 'a');
assert.equal(fishingPhase(round, round.biteAt), 'bite');
assert.equal(reelFishing(round, round.deadline + 1), 'late');
```

- [ ] **Step 2: Run `node --test tests/fishing-game.test.js` and verify the missing module fails**

- [ ] **Step 3: Implement the pure state machine and thin API methods; rerun the focused tests**

- [ ] **Step 4: Commit**

```bash
git add client/src/fishing-game.js client/src/api.js tests/fishing-game.test.js
git commit -m "feat: add fishing game state"
```

### Task 3: Realtime visual effects and controls

**Files:**
- Create: `client/src/ui/fish-effects.js`, `client/src/ui/fishing.js`
- Modify: `client/src/realtime.js`, `client/src/scene/aquarium.js`, `client/src/ui/fish-card.js`, `client/src/main.js`, `client/src/styles.css`

**Interfaces:**
- Consumes: `fish.effect` and the client API methods from Tasks 1–2.
- Produces: `createFishEffects({ aquarium })` with `show(effect)` and `destroy()`.
- Produces: `createFishing({ state, aquarium, effects })` with `destroy()`.
- Produces: `aquarium.playHit(fishId)` and `aquarium.playCatch(fishId)`.

- [ ] **Step 1: Wire realtime `fish.effect` through an `onFishEffect` callback and create a deduplicating effect controller keyed by `effect.id`**

- [ ] **Step 2: Add the four reaction buttons and Nudge button to the fish card, with pending-state guards and localized API failure toasts**

- [ ] **Step 3: Add the fishing HUD control, timers, Escape/visibility/fish-removal cancellation, local response playback, and status announcements**

- [ ] **Step 4: Add anchored emoji/splash/hook DOM effects and restrained aquarium motion; provide reduced-motion fallbacks**

- [ ] **Step 5: Run focused tests and `npm run build`, fixing only integration errors introduced here**

- [ ] **Step 6: Commit**

```bash
git add client/src/ui/fish-effects.js client/src/ui/fishing.js client/src/realtime.js client/src/scene/aquarium.js client/src/ui/fish-card.js client/src/main.js client/src/styles.css
git commit -m "feat: add realtime social interaction controls"
```

### Task 4: Localization, full verification, and PR

**Files:**
- Modify: `client/src/i18n.js`, `tests/i18n.test.js`

- [ ] **Step 1: Add a failing catalog-parity assertion by referencing all new English and Korean keys in behavior tests**

- [ ] **Step 2: Add localized reaction labels, nudge/fishing states, misses, cooldowns, and API errors; run `node --test tests/i18n.test.js`**

- [ ] **Step 3: Run `npm test` with local-port permission and verify zero failures**

- [ ] **Step 4: Run `npm run build` and `git diff --check`**

- [ ] **Step 5: Browser-test Korean and English reaction, nudge, fishing success/miss, mobile layout, keyboard controls, and console errors**

- [ ] **Step 6: Commit, push `feat/social-interactions`, and open a PR against `main` with verification evidence**
