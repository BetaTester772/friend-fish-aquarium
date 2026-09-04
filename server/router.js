import { config } from './config.js';
import { resolveFeed, FeedResult } from './game.js';
import { decodeFaceAsset, FaceAssetError } from './faces.js';
import { readCookie, sessionCookie, clearedSessionCookie, sessionCookieName } from './auth.js';
import {
  gateEnabled,
  gateToken,
  gateCookie,
  hasPassed,
  isOpenPath,
  passphraseMatches,
  tokenMatches,
} from './gate.js';
import { ACTIVITY_TYPES } from '../shared/activity-text.js';
import {
  randomLook,
  isBodyVariant,
  isFinVariant,
  isBodyColor,
  SCALE_RANGE,
} from '../shared/fish-variants.js';

const MAX_NAME_LENGTH = 24;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * The whole HTTP API, written against the Web `Request`/`Response` types and
 * kept free of Node built-ins, so the transport in `server/node.js` is the only
 * thing that would change to run it elsewhere (spec §8).
 *
 * @param {object} deps
 * @param {object} deps.store     data access
 * @param {object} deps.realtime  `{ subscribe(tankId, meta), publish(tankId, event, data) }`
 * @param {Function} [deps.random]
 */
export function createRouter({ store, realtime, random = Math.random }) {
  // ---------------------------------------------------------------- helpers

  async function emitActivity(tankId, event) {
    const stored = await store.recordActivity({ tankId, ...event });
    await realtime.publish(tankId, 'activity.created', stored);
    return stored;
  }

  const emitFishStatus = (tankId, fish) =>
    realtime.publish(tankId, 'fish.status.updated', {
      id: fish.id,
      fullness: fish.fullness,
      status: fish.status,
    });

  const emitPresence = async (tankId) =>
    realtime.publish(tankId, 'presence.updated', {
      members: await store.members(tankId),
    });

  /** The client renders bars and cooldowns, so it needs the same thresholds. */
  const publicRules = () => ({
    fullness: {
      max: config.fullness.max,
      fullThreshold: config.fullness.fullThreshold,
      hungryThreshold: config.fullness.hungryThreshold,
      feedAmount: config.fullness.feedAmount,
      decayPerHour: config.fullness.decayPerHour,
    },
    feedCooldownMs: config.feed.cooldownMs,
    presenceHeartbeatMs: config.presence.heartbeatMs,
    allowSelfFeed: config.feed.allowSelfFeed,
  });

  async function tankSnapshot(tank, viewer) {
    const [fish, members, activity] = await Promise.all([
      store.fishOfTank(tank.id),
      store.members(tank.id),
      store.activity(tank.id),
    ]);
    return {
      tank: {
        id: tank.id,
        name: tank.name,
        inviteCode: tank.invite_code,
        createdAt: tank.created_at,
      },
      members,
      fish,
      activity,
      viewer: viewer
        ? {
            ...viewer,
            fishId: fish.find((f) => f.ownerUserId === viewer.id)?.id ?? null,
          }
        : null,
      rules: publicRules(),
      // Only reachable once the gate has already been passed, so this tells the
      // holder nothing they do not have. It lets the invite link they copy work
      // on one click instead of dumping a friend at a passphrase prompt.
      gate: gateEnabled()
        ? { enabled: true, shareKey: await gateToken() }
        : { enabled: false, shareKey: null },
    };
  }

  function normalizeName(raw) {
    const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (name.length < 1 || name.length > MAX_NAME_LENGTH) return null;
    // Keep the log readable: no control characters or line breaks.
    if (CONTROL_CHARS.test(name)) return null;
    return name;
  }

  // ------------------------------------------------------------------ routes

  /**
   * Handlers are matched by method plus a path pattern; `:name` segments land
   * in `ctx.params`. Order matters only in that literal segments are declared
   * before the patterns that would also match them.
   */
  const routes = [
    ['GET', '/api/session', ({ user }) => json({ user })],

    /**
     * Sign in. Auth is invite-link + nickname only (spec §15 open question —
     * decision recorded in the README): no password, no third-party identity,
     * and no personal data beyond a display name.
     */
    ['POST', '/api/session', async ({ request, user, body }) => {
      const displayName = normalizeName(body?.displayName);
      if (!displayName) {
        return json(
          {
            error: 'invalid_name',
            message: `Pick a name between 1 and ${MAX_NAME_LENGTH} characters.`,
          },
          400,
        );
      }

      if (user) {
        await store.renameUser(user.id, displayName);
        return json({ user: { ...user, displayName } });
      }

      const created = await store.createUser(displayName);
      const token = await store.createSession(created.id);
      return json(
        { user: { id: created.id, displayName: created.display_name, avatarUrl: null } },
        201,
        { 'set-cookie': sessionCookie(request, token) },
      );
    }],

    ['DELETE', '/api/session', () =>
      new Response(null, { status: 204, headers: { 'set-cookie': clearedSessionCookie() } })],

    /**
     * Erase the account: fish rows, stored face images, memberships and
     * sessions (spec FR-020 / AC-11).
     */
    ['DELETE', '/api/me', requireUser(async ({ user }) => {
      const tankIds = await store.deleteUser(user.id);
      for (const tankId of new Set(tankIds)) {
        await realtime.publish(tankId, 'tank.fish.deleted', { ownerUserId: user.id });
        await emitPresence(tankId);
      }
      return new Response(null, {
        status: 204,
        headers: { 'set-cookie': clearedSessionCookie() },
      });
    })],

    /**
     * Exchange the shared passphrase — or a share token from an invite link —
     * for a gate cookie (see server/gate.js).
     */
    ['POST', '/api/gate', async ({ request, body }) => {
      if (!gateEnabled()) return json({ ok: true, gate: 'disabled' });

      const accepted =
        (await tokenMatches(body?.token)) ||
        (await passphraseMatches(body?.passphrase));

      if (accepted) {
        return json({ ok: true }, 200, {
          'set-cookie': gateCookie(request, await gateToken()),
        });
      }

      await sleep(config.gate.failureDelayMs);
      return json(
        { error: 'wrong_passphrase', message: 'That is not the passphrase.' },
        403,
      );
    }],

    ['GET', '/api/rules', () => json(publicRules())],

    /** Liveness probe for the reverse proxy / container healthcheck. */
    ['GET', '/api/health', async () => {
      await store.defaultTank(); // proves the database is reachable and writable
      return json({ ok: true });
    }],

    ['GET', '/api/tanks/default', async ({ user }) =>
      json(await tankSnapshot(await store.defaultTank(), user))],

    ['GET', '/api/tanks/by-invite/:code', async ({ params, user }) => {
      const tank = await store.tankByInvite(params.code);
      if (!tank) return json({ error: 'tank_not_found' }, 404);
      return json(await tankSnapshot(tank, user));
    }],

    /** Initial load: tank, members, fish and recent activity in one round trip. */
    ['GET', '/api/tanks/:tankId', withTank(async ({ tank, user }) =>
      json(await tankSnapshot(tank, user)))],

    /**
     * Presence heartbeat. The first heartbeat after a quiet period is what
     * produces the "{user} is here" line in the activity feed (spec FR-019).
     */
    ['POST', '/api/tanks/:tankId/presence', requireUser(withTank(async ({ tank, user }) => {
      const wasMember = await store.isMember(tank.id, user.id);
      await store.joinTank(tank.id, user.id);

      const sinceLast = await store.msSinceActivity(
        tank.id,
        ACTIVITY_TYPES.PRESENCE,
        user.id,
      );
      const announced =
        !wasMember ||
        sinceLast === null ||
        sinceLast > config.activity.presenceEventCooldownMs;

      if (announced) {
        await emitActivity(tank.id, {
          type: ACTIVITY_TYPES.PRESENCE,
          actorId: user.id,
          payload: { actorName: user.displayName },
        });
      }
      await emitPresence(tank.id);
      return json({ ok: true, announced });
    }))],

    ['GET', '/api/tanks/:tankId/activity', withTank(async ({ tank, url }) => {
      const limit = Math.min(
        200,
        Math.max(1, Number(url.searchParams.get('limit')) || config.activity.limit),
      );
      return json({ activity: await store.activity(tank.id, limit) });
    })],

    /** Realtime channel: fish created/deleted, status updates, activity, presence. */
    ['GET', '/api/tanks/:tankId/events', withTank(({ tank, user, request }) =>
      realtime.subscribe(tank.id, { userId: user?.id ?? null, request }))],

    /**
     * Register a fish in the tank (spec FR-009). One fish per user per tank;
     * re-creating replaces the previous one and deletes its face image.
     */
    ['POST', '/api/tanks/:tankId/fish', requireUser(withTank(async ({ tank, user, body }) => {
      let faceBytes;
      try {
        faceBytes = decodeFaceAsset(body?.faceImage);
      } catch (err) {
        if (err instanceof FaceAssetError) {
          return json({ error: 'invalid_face_image', message: err.message }, 400);
        }
        throw err;
      }

      const look = randomLook(random);
      if (isBodyVariant(body.bodyVariant)) look.bodyVariant = body.bodyVariant;
      if (isFinVariant(body.finVariant)) look.finVariant = body.finVariant;
      if (isBodyColor(body.bodyColor)) look.bodyColor = body.bodyColor;
      if (Number.isFinite(body.scale)) {
        look.scale = Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, body.scale));
      }

      await store.joinTank(tank.id, user.id);
      const replaced = await store.deleteFishOfOwner(tank.id, user.id);
      if (replaced) {
        await realtime.publish(tank.id, 'tank.fish.deleted', { id: replaced.id });
      }

      const faceAssetId = await store.createFaceAsset(faceBytes);
      const fish = await store.createFish({
        tankId: tank.id,
        ownerUserId: user.id,
        faceAssetId,
        ...look,
      });

      await realtime.publish(tank.id, 'tank.fish.created', { fish });
      if (!replaced) {
        await emitActivity(tank.id, {
          type: ACTIVITY_TYPES.JOINED,
          actorId: user.id,
          payload: { actorName: user.displayName },
        });
      }
      return json({ fish }, 201);
    }))],

    /** Delete your own fish and its stored face image (spec FR-020). */
    ['DELETE', '/api/fish/:fishId', requireUser(async ({ params, user }) => {
      const fish = await store.fishById(params.fishId);
      if (!fish) return json({ error: 'fish_not_found' }, 404);
      if (fish.ownerUserId !== user.id) {
        return json(
          { error: 'not_your_fish', message: 'You can only remove your own fish.' },
          403,
        );
      }

      await store.deleteFish(fish.id);
      await realtime.publish(fish.tankId, 'tank.fish.deleted', { id: fish.id });
      return new Response(null, { status: 204 });
    })],

    /**
     * Feed a fish (spec FR-012/013/014). The server is the only place the
     * result is decided, so a client cannot talk itself past the full guard,
     * the cooldown, or the ignore roll.
     */
    ['POST', '/api/fish/:fishId/feed', requireUser(async ({ params, user }) => {
      const fish = await store.fishById(params.fishId);
      if (!fish) return json({ error: 'fish_not_found' }, 404);

      const isSelf = fish.ownerUserId === user.id;
      if (isSelf && !config.feed.allowSelfFeed) {
        return json(
          {
            error: 'cannot_feed_self',
            message: 'Feeding is for friends. Go bother someone else.',
          },
          400,
        );
      }

      await store.joinTank(fish.tankId, user.id);

      const msSinceSameActorFed = await store.msSinceLastFeed(fish.id, user.id);
      const outcome = resolveFeed({
        fullness: fish.fullness,
        msSinceSameActorFed,
        isSelf,
        random,
      });

      await store.recordInteraction({
        tankId: fish.tankId,
        actorUserId: user.id,
        targetFishId: fish.id,
        type: isSelf ? 'feed_self' : 'feed',
        result: outcome.result,
      });

      // A cooldown hit is a client-side mistake, not a social event: no log line.
      if (outcome.result === FeedResult.COOLDOWN) {
        return json(
          {
            result: outcome.result,
            fish,
            retryAfterMs: config.feed.cooldownMs - msSinceSameActorFed,
          },
          429,
        );
      }

      const names = { actorName: user.displayName, targetName: fish.ownerName };
      let updated = fish;

      if (outcome.result === FeedResult.ACCEPTED) {
        updated = await store.setFullness(fish.id, outcome.fullness);
        await emitActivity(fish.tankId, {
          type: ACTIVITY_TYPES.FED,
          actorId: user.id,
          targetId: fish.id,
          payload: names,
        });
        await emitFishStatus(fish.tankId, updated);
        if (outcome.becameFull) {
          await emitActivity(fish.tankId, {
            type: ACTIVITY_TYPES.FULL,
            targetId: fish.id,
            payload: names,
          });
        }
      } else if (outcome.result === FeedResult.FULL) {
        // Persist the decayed value so the bar the client just saw is the one
        // the next feed is judged against.
        updated = await store.setFullness(fish.id, fish.fullness);
        await emitFishStatus(fish.tankId, updated);
        await emitActivity(fish.tankId, {
          type: ACTIVITY_TYPES.FULL,
          targetId: fish.id,
          payload: names,
        });
      } else if (outcome.result === FeedResult.IGNORED) {
        await emitActivity(fish.tankId, {
          type: ACTIVITY_TYPES.IGNORED,
          actorId: user.id,
          targetId: fish.id,
          payload: names,
        });
      }

      return json({ result: outcome.result, fish: updated });
    })],

    /** Fire-and-forget product analytics (spec §11). */
    ['POST', '/api/analytics', async ({ user, body }) => {
      const name = String(body?.name ?? '').slice(0, 64);
      if (name) {
        await store.recordAnalytics({
          name,
          userId: user?.id ?? null,
          props: body?.props ?? {},
        });
      }
      return new Response(null, { status: 204 });
    }],

    /** Stored face cutouts. Immutable: a face is replaced, never rewritten. */
    ['GET', '/faces/:asset', async ({ params }) => {
      const id = params.asset.replace(/\.png$/, '');
      const bytes = await store.faceAsset(id);
      if (!bytes) return json({ error: 'face_not_found' }, 404);
      return new Response(bytes, {
        headers: {
          'content-type': 'image/png',
          'cache-control': 'public, max-age=31536000, immutable',
        },
      });
    }],
  ].map(([method, pattern, handler]) => ({
    method,
    segments: pattern.split('/').filter(Boolean),
    handler,
  }));

  // ---------------------------------------------------------------- dispatch

  /**
   * @returns {Promise<Response|null>} null when no route matches, so the caller
   *   can fall through to static assets.
   */
  return async function handle(request) {
    const url = new URL(request.url);
    const path = url.pathname.split('/').filter(Boolean);

    for (const route of routes) {
      if (route.method !== request.method) continue;
      const params = matchPath(route.segments, path);
      if (!params) continue;

      // The gate covers reads as well as writes: seeing the tank means seeing
      // everyone's face, which is the part worth protecting.
      if (!isOpenPath(url.pathname) && !(await hasPassed(request))) {
        return json(
          {
            error: 'gate_required',
            message: 'This tank is private. Enter the passphrase to come in.',
          },
          401,
        );
      }

      const session = await store.sessionByToken(
        readCookie(request, sessionCookieName),
      );

      let body;
      if (request.method === 'POST') {
        body = await readJsonBody(request);
        if (body === INVALID_BODY) return json({ error: 'invalid_body' }, 400);
      }

      return route.handler({
        request,
        url,
        params,
        body,
        user: session?.user ?? null,
        store,
      });
    }

    return null;
  };

  // ------------------------------------------------------------- middleware

  function requireUser(handler) {
    return (ctx) =>
      ctx.user
        ? handler(ctx)
        : json(
            {
              error: 'not_signed_in',
              message: 'Pick a name to join the tank first.',
            },
            401,
          );
  }

  function withTank(handler) {
    return async (ctx) => {
      const tank = await store.tankById(ctx.params.tankId);
      if (!tank) return json({ error: 'tank_not_found' }, 404);
      return handler({ ...ctx, tank });
    };
  }
}

// ------------------------------------------------------------------ plumbing

function matchPath(segments, path) {
  if (segments.length !== path.length) return null;
  const params = {};
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (segment.startsWith(':')) params[segment.slice(1)] = decodeURIComponent(path[i]);
    else if (segment !== path[i]) return null;
  }
  return params;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const INVALID_BODY = Symbol('invalid body');

async function readJsonBody(request) {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) return INVALID_BODY;
  const text = await request.text();
  if (!text) return {};
  if (text.length > MAX_BODY_BYTES) return INVALID_BODY;
  try {
    return JSON.parse(text);
  } catch {
    return INVALID_BODY;
  }
}

/**
 * Paths the API owns. An unmatched path under these must 404 rather than fall
 * through to the SPA shell, or a typo'd endpoint answers with HTML and a 200.
 */
export const isApiPath = (pathname) =>
  pathname.startsWith('/api/') || pathname.startsWith('/faces/');

export function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}
