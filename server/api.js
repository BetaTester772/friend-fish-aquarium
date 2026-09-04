import express from 'express';
import { config } from './config.js';
import { resolveFeed, FeedResult } from './game.js';
import { saveFaceAsset, FaceAssetError } from './faces.js';
import { setSessionCookie, clearSessionCookie, requireUser } from './auth.js';
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

export function createApi({ store, realtime, random = Math.random }) {
  const router = express.Router();
  router.use(express.json({ limit: '4mb' }));

  // ---------------------------------------------------------------- helpers

  /** Publish an activity event to every open stream and return it. */
  function emitActivity(tankId, event) {
    const stored = store.recordActivity({ tankId, ...event });
    realtime.publish(tankId, 'activity.created', stored);
    return stored;
  }

  function emitFishStatus(tankId, fish) {
    realtime.publish(tankId, 'fish.status.updated', {
      id: fish.id,
      fullness: fish.fullness,
      status: fish.status,
    });
  }

  function emitPresence(tankId) {
    realtime.publish(tankId, 'presence.updated', {
      members: store.members(tankId),
    });
  }

  function requireTank(req, res) {
    const tank = store.tankById(req.params.tankId);
    if (!tank) {
      res.status(404).json({ error: 'tank_not_found' });
      return null;
    }
    return tank;
  }

  function normalizeName(raw) {
    const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (name.length < 1 || name.length > MAX_NAME_LENGTH) return null;
    // Keep the log readable: no control characters or line breaks.
    if (CONTROL_CHARS.test(name)) return null;
    return name;
  }

  /** The client renders bars and cooldowns, so it needs the same thresholds. */
  function publicRules() {
    return {
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
    };
  }

  function tankSnapshot(tank, viewer) {
    const fish = store.fishOfTank(tank.id);
    return {
      tank: {
        id: tank.id,
        name: tank.name,
        inviteCode: tank.invite_code,
        createdAt: tank.created_at,
      },
      members: store.members(tank.id),
      fish,
      activity: store.activity(tank.id),
      viewer: viewer
        ? {
            ...viewer,
            fishId: fish.find((f) => f.ownerUserId === viewer.id)?.id ?? null,
          }
        : null,
      rules: publicRules(),
    };
  }

  // -------------------------------------------------------------- session

  router.get('/session', (req, res) => {
    res.json({ user: req.user });
  });

  /**
   * Sign in. Auth is invite-link + nickname only (spec §15 open question —
   * decision recorded in the README): no password, no third-party identity, and
   * no personal data beyond a display name.
   */
  router.post('/session', (req, res) => {
    const displayName = normalizeName(req.body?.displayName);
    if (!displayName) {
      return res.status(400).json({
        error: 'invalid_name',
        message: `Pick a name between 1 and ${MAX_NAME_LENGTH} characters.`,
      });
    }

    if (req.user) {
      store.renameUser(req.user.id, displayName);
      return res.json({ user: { ...req.user, displayName } });
    }

    const user = store.createUser(displayName);
    setSessionCookie(res, store.createSession(user.id));
    res.status(201).json({
      user: { id: user.id, displayName: user.display_name, avatarUrl: null },
    });
  });

  router.delete('/session', (_req, res) => {
    clearSessionCookie(res);
    res.status(204).end();
  });

  /**
   * Erase the account: fish rows, stored face cutouts, memberships and sessions
   * (spec FR-020 / AC-11).
   */
  router.delete('/me', requireUser, (req, res) => {
    const tankIds = [
      ...new Set(allFishOfUser(store, req.user.id).map((f) => f.tankId)),
    ];
    store.deleteUser(req.user.id);
    clearSessionCookie(res);
    for (const tankId of tankIds) {
      realtime.publish(tankId, 'tank.fish.deleted', {
        ownerUserId: req.user.id,
      });
      emitPresence(tankId);
    }
    res.status(204).end();
  });

  // ---------------------------------------------------------------- tanks

  router.get('/tanks/default', (req, res) => {
    res.json(tankSnapshot(store.defaultTank(), req.user));
  });

  router.get('/tanks/by-invite/:code', (req, res) => {
    const tank = store.tankByInvite(req.params.code);
    if (!tank) return res.status(404).json({ error: 'tank_not_found' });
    res.json(tankSnapshot(tank, req.user));
  });

  /** Initial load: tank, members, fish and recent activity in one round trip. */
  router.get('/tanks/:tankId', (req, res) => {
    const tank = requireTank(req, res);
    if (!tank) return;
    res.json(tankSnapshot(tank, req.user));
  });

  /**
   * Presence heartbeat. The first heartbeat after a quiet period is what
   * produces the "{user} is here" line in the activity feed (spec FR-019).
   */
  router.post('/tanks/:tankId/presence', requireUser, (req, res) => {
    const tank = requireTank(req, res);
    if (!tank) return;

    const wasMember = store.isMember(tank.id, req.user.id);
    store.joinTank(tank.id, req.user.id);

    const sinceLast = store.msSinceActivity(
      tank.id,
      ACTIVITY_TYPES.PRESENCE,
      req.user.id,
    );
    const announced =
      !wasMember ||
      sinceLast === null ||
      sinceLast > config.activity.presenceEventCooldownMs;

    if (announced) {
      emitActivity(tank.id, {
        type: ACTIVITY_TYPES.PRESENCE,
        actorId: req.user.id,
        payload: { actorName: req.user.displayName },
      });
    }
    emitPresence(tank.id);
    res.json({ ok: true, announced });
  });

  router.get('/tanks/:tankId/activity', (req, res) => {
    const tank = requireTank(req, res);
    if (!tank) return;
    const limit = Math.min(
      200,
      Math.max(1, Number(req.query.limit) || config.activity.limit),
    );
    res.json({ activity: store.activity(tank.id, limit) });
  });

  /** Realtime channel: fish created/deleted, status updates, activity, presence. */
  router.get('/tanks/:tankId/events', (req, res) => {
    const tank = requireTank(req, res);
    if (!tank) return;

    const unsubscribe = realtime.subscribe(tank.id, res, {
      userId: req.user?.id ?? null,
    });
    req.on('close', () => {
      unsubscribe();
      if (req.user) emitPresence(tank.id);
    });
  });

  // ----------------------------------------------------------------- fish

  /**
   * Register a fish in the tank (spec FR-009). One fish per user per tank;
   * re-creating replaces the previous one and deletes its face asset.
   */
  router.post('/tanks/:tankId/fish', requireUser, (req, res) => {
    const tank = requireTank(req, res);
    if (!tank) return;

    let faceAssetUrl;
    try {
      faceAssetUrl = saveFaceAsset(req.body?.faceImage);
    } catch (err) {
      if (err instanceof FaceAssetError) {
        return res
          .status(400)
          .json({ error: 'invalid_face_image', message: err.message });
      }
      throw err;
    }

    const look = randomLook(random);
    const body = req.body ?? {};
    if (isBodyVariant(body.bodyVariant)) look.bodyVariant = body.bodyVariant;
    if (isFinVariant(body.finVariant)) look.finVariant = body.finVariant;
    if (isBodyColor(body.bodyColor)) look.bodyColor = body.bodyColor;
    if (Number.isFinite(body.scale)) {
      look.scale = Math.min(
        SCALE_RANGE.max,
        Math.max(SCALE_RANGE.min, body.scale),
      );
    }

    store.joinTank(tank.id, req.user.id);
    const replaced = store.deleteFishOfOwner(tank.id, req.user.id);
    if (replaced) {
      realtime.publish(tank.id, 'tank.fish.deleted', { id: replaced.id });
    }

    const fish = store.createFish({
      tankId: tank.id,
      ownerUserId: req.user.id,
      faceAssetUrl,
      ...look,
    });

    realtime.publish(tank.id, 'tank.fish.created', { fish });
    if (!replaced) {
      emitActivity(tank.id, {
        type: ACTIVITY_TYPES.JOINED,
        actorId: req.user.id,
        payload: { actorName: req.user.displayName },
      });
    }
    res.status(201).json({ fish });
  });

  /** Delete your own fish and its stored face image (spec FR-020). */
  router.delete('/fish/:fishId', requireUser, (req, res) => {
    const fish = store.fishById(req.params.fishId);
    if (!fish) return res.status(404).json({ error: 'fish_not_found' });
    if (fish.ownerUserId !== req.user.id) {
      return res.status(403).json({
        error: 'not_your_fish',
        message: 'You can only remove your own fish.',
      });
    }

    store.deleteFish(fish.id);
    realtime.publish(fish.tankId, 'tank.fish.deleted', { id: fish.id });
    res.status(204).end();
  });

  /**
   * Feed a fish (spec FR-012/013/014). The server is the only place the result
   * is decided, so a client cannot talk itself past the full guard, the
   * cooldown, or the ignore roll.
   */
  router.post('/fish/:fishId/feed', requireUser, (req, res) => {
    const fish = store.fishById(req.params.fishId);
    if (!fish) return res.status(404).json({ error: 'fish_not_found' });

    const isSelf = fish.ownerUserId === req.user.id;
    if (isSelf && !config.feed.allowSelfFeed) {
      return res.status(400).json({
        error: 'cannot_feed_self',
        message: 'Feeding is for friends. Go bother someone else.',
      });
    }

    store.joinTank(fish.tankId, req.user.id);

    const msSinceSameActorFed = store.msSinceLastFeed(fish.id, req.user.id);
    const outcome = resolveFeed({
      fullness: fish.fullness,
      msSinceSameActorFed,
      isSelf,
      random,
    });

    store.recordInteraction({
      tankId: fish.tankId,
      actorUserId: req.user.id,
      targetFishId: fish.id,
      type: isSelf ? 'feed_self' : 'feed',
      result: outcome.result,
    });

    // A cooldown hit is a client-side mistake, not a social event: no log line.
    if (outcome.result === FeedResult.COOLDOWN) {
      return res.status(429).json({
        result: outcome.result,
        fish,
        retryAfterMs: config.feed.cooldownMs - msSinceSameActorFed,
      });
    }

    const names = {
      actorName: req.user.displayName,
      targetName: fish.ownerName,
    };
    let updated = fish;

    if (outcome.result === FeedResult.ACCEPTED) {
      updated = store.setFullness(fish.id, outcome.fullness);
      emitActivity(fish.tankId, {
        type: ACTIVITY_TYPES.FED,
        actorId: req.user.id,
        targetId: fish.id,
        payload: names,
      });
      emitFishStatus(fish.tankId, updated);
      if (outcome.becameFull) {
        emitActivity(fish.tankId, {
          type: ACTIVITY_TYPES.FULL,
          targetId: fish.id,
          payload: names,
        });
      }
    } else if (outcome.result === FeedResult.FULL) {
      // Persist the decayed value so the bar the client just saw is the one the
      // next feed is judged against.
      updated = store.setFullness(fish.id, fish.fullness);
      emitFishStatus(fish.tankId, updated);
      emitActivity(fish.tankId, {
        type: ACTIVITY_TYPES.FULL,
        targetId: fish.id,
        payload: names,
      });
    } else if (outcome.result === FeedResult.IGNORED) {
      emitActivity(fish.tankId, {
        type: ACTIVITY_TYPES.IGNORED,
        actorId: req.user.id,
        targetId: fish.id,
        payload: names,
      });
    }

    res.json({ result: outcome.result, fish: updated });
  });

  // ------------------------------------------------------------ analytics

  /** Fire-and-forget product analytics (spec §11). */
  router.post('/analytics', (req, res) => {
    const name = String(req.body?.name ?? '').slice(0, 64);
    if (name) {
      store.recordAnalytics({
        name,
        userId: req.user?.id ?? null,
        props: req.body?.props ?? {},
      });
    }
    res.status(204).end();
  });

  router.get('/rules', (_req, res) => res.json(publicRules()));

  return router;
}

function allFishOfUser(store, userId) {
  return store.db
    .prepare('SELECT id, tank_id AS tankId FROM fish WHERE owner_user_id = ?')
    .all(userId);
}
