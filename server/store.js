import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { openDatabase, faceDir } from './db.js';
import { newId, newInviteCode, newSessionToken } from './ids.js';
import { decayedFullness, statusFor } from './game.js';

/**
 * Data access for the aquarium. Every read that returns a fish resolves its
 * decayed fullness first, so callers never see a stale value (spec FR-013/§6).
 */
export function createStore({ file, now = Date.now } = {}) {
  const db = openDatabase(file);

  const q = {
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    insertUser: db.prepare(
      'INSERT INTO users (id, display_name, avatar_url, created_at) VALUES (?, ?, ?, ?)',
    ),
    renameUser: db.prepare('UPDATE users SET display_name = ? WHERE id = ?'),
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),

    insertSession: db.prepare(
      'INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)',
    ),
    sessionByToken: db.prepare(
      `SELECT s.token, s.created_at, u.id AS user_id, u.display_name, u.avatar_url
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ?`,
    ),
    deleteSessionsForUser: db.prepare('DELETE FROM sessions WHERE user_id = ?'),

    insertTank: db.prepare(
      'INSERT INTO tanks (id, name, invite_code, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
    ),
    tankById: db.prepare('SELECT * FROM tanks WHERE id = ?'),
    tankByInvite: db.prepare('SELECT * FROM tanks WHERE invite_code = ?'),
    firstTank: db.prepare('SELECT * FROM tanks ORDER BY created_at LIMIT 1'),

    upsertMember: db.prepare(
      `INSERT INTO tank_members (tank_id, user_id, role, joined_at, last_seen_at)
            VALUES (@tank_id, @user_id, @role, @now, @now)
       ON CONFLICT (tank_id, user_id) DO UPDATE SET last_seen_at = @now`,
    ),
    touchMember: db.prepare(
      'UPDATE tank_members SET last_seen_at = ? WHERE tank_id = ? AND user_id = ?',
    ),
    memberOf: db.prepare(
      'SELECT * FROM tank_members WHERE tank_id = ? AND user_id = ?',
    ),
    membersOfTank: db.prepare(
      `SELECT m.user_id, m.role, m.joined_at, m.last_seen_at, u.display_name
         FROM tank_members m JOIN users u ON u.id = m.user_id
        WHERE m.tank_id = ? ORDER BY m.joined_at`,
    ),

    insertFish: db.prepare(
      `INSERT INTO fish (id, tank_id, owner_user_id, face_asset_url, body_variant,
                         fin_variant, body_color, scale, fullness, fullness_updated_at,
                         status, created_at)
       VALUES (@id, @tank_id, @owner_user_id, @face_asset_url, @body_variant,
               @fin_variant, @body_color, @scale, @fullness, @fullness_updated_at,
               @status, @created_at)`,
    ),
    fishById: db.prepare(
      `SELECT f.*, u.display_name AS owner_name
         FROM fish f JOIN users u ON u.id = f.owner_user_id
        WHERE f.id = ?`,
    ),
    fishOfTank: db.prepare(
      `SELECT f.*, u.display_name AS owner_name
         FROM fish f JOIN users u ON u.id = f.owner_user_id
        WHERE f.tank_id = ? ORDER BY f.created_at`,
    ),
    fishOfOwner: db.prepare(
      `SELECT f.*, u.display_name AS owner_name
         FROM fish f JOIN users u ON u.id = f.owner_user_id
        WHERE f.tank_id = ? AND f.owner_user_id = ?`,
    ),
    updateFullness: db.prepare(
      'UPDATE fish SET fullness = ?, fullness_updated_at = ?, status = ? WHERE id = ?',
    ),
    deleteFish: db.prepare('DELETE FROM fish WHERE id = ?'),
    deleteFishOfOwner: db.prepare(
      'DELETE FROM fish WHERE tank_id = ? AND owner_user_id = ?',
    ),

    insertInteraction: db.prepare(
      `INSERT INTO interactions (id, tank_id, actor_user_id, target_fish_id, type, result, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    lastFeedAt: db.prepare(
      `SELECT created_at FROM interactions
        WHERE target_fish_id = ? AND actor_user_id = ? AND type = 'feed'
          AND result IN ('accepted', 'ignored')
        ORDER BY created_at DESC LIMIT 1`,
    ),

    insertActivity: db.prepare(
      `INSERT INTO activity_events (id, tank_id, type, actor_id, target_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    recentActivity: db.prepare(
      `SELECT * FROM activity_events WHERE tank_id = ?
        ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    ),
    lastActivityOfType: db.prepare(
      `SELECT created_at FROM activity_events
        WHERE tank_id = ? AND type = ? AND actor_id = ?
        ORDER BY created_at DESC LIMIT 1`,
    ),
    pruneActivity: db.prepare(
      'DELETE FROM activity_events WHERE created_at < ?',
    ),

    insertAnalytics: db.prepare(
      'INSERT INTO analytics_events (id, name, user_id, props, created_at) VALUES (?, ?, ?, ?, ?)',
    ),
  };

  /** Attach decayed fullness + derived status to a raw fish row. */
  function hydrate(row) {
    if (!row) return null;
    const fullness = decayedFullness(
      row.fullness,
      row.fullness_updated_at,
      now(),
    );
    return {
      id: row.id,
      tankId: row.tank_id,
      ownerUserId: row.owner_user_id,
      ownerName: row.owner_name,
      faceAssetUrl: row.face_asset_url,
      bodyVariant: row.body_variant,
      finVariant: row.fin_variant,
      bodyColor: row.body_color,
      scale: row.scale,
      fullness: Math.round(fullness * 10) / 10,
      status: statusFor(fullness),
      createdAt: row.created_at,
    };
  }

  const store = {
    db,

    // ---- users & sessions -------------------------------------------------

    createUser(displayName) {
      const user = {
        id: newId('usr'),
        display_name: displayName,
        avatar_url: null,
        created_at: now(),
      };
      q.insertUser.run(
        user.id,
        user.display_name,
        user.avatar_url,
        user.created_at,
      );
      return user;
    },

    createSession(userId) {
      const token = newSessionToken();
      q.insertSession.run(token, userId, now());
      return token;
    },

    sessionByToken(token) {
      if (!token) return null;
      const row = q.sessionByToken.get(token);
      if (!row) return null;
      return {
        token: row.token,
        user: {
          id: row.user_id,
          displayName: row.display_name,
          avatarUrl: row.avatar_url,
        },
      };
    },

    renameUser(userId, displayName) {
      q.renameUser.run(displayName, userId);
    },

    // ---- tanks ------------------------------------------------------------

    createTank({ name, createdBy = null }) {
      const tank = {
        id: newId('tnk'),
        name,
        invite_code: newInviteCode(),
        created_by: createdBy,
        created_at: now(),
      };
      q.insertTank.run(
        tank.id,
        tank.name,
        tank.invite_code,
        tank.created_by,
        tank.created_at,
      );
      return tank;
    },

    tankById: (id) => q.tankById.get(id) ?? null,
    tankByInvite: (code) => q.tankByInvite.get(code) ?? null,

    /** The app ships with one shared tank; it is created on first boot. */
    defaultTank() {
      return (
        q.firstTank.get() ??
        store.createTank({ name: 'the tank' })
      );
    },

    joinTank(tankId, userId, role = 'member') {
      q.upsertMember.run({
        tank_id: tankId,
        user_id: userId,
        role,
        now: now(),
      });
    },

    touchMember(tankId, userId) {
      q.touchMember.run(now(), tankId, userId);
    },

    isMember: (tankId, userId) => Boolean(q.memberOf.get(tankId, userId)),

    members(tankId) {
      const cutoff = now() - config.presence.onlineWindowMs;
      return q.membersOfTank.all(tankId).map((m) => ({
        userId: m.user_id,
        displayName: m.display_name,
        role: m.role,
        joinedAt: m.joined_at,
        lastSeenAt: m.last_seen_at,
        online: m.last_seen_at >= cutoff,
      }));
    },

    // ---- fish -------------------------------------------------------------

    createFish(input) {
      const row = {
        id: newId('fsh'),
        tank_id: input.tankId,
        owner_user_id: input.ownerUserId,
        face_asset_url: input.faceAssetUrl,
        body_variant: input.bodyVariant,
        fin_variant: input.finVariant,
        body_color: input.bodyColor,
        scale: input.scale,
        fullness: config.fullness.initial,
        fullness_updated_at: now(),
        status: statusFor(config.fullness.initial),
        created_at: now(),
      };
      q.insertFish.run(row);
      return store.fishById(row.id);
    },

    fishById: (id) => hydrate(q.fishById.get(id)),
    fishOfTank: (tankId) => q.fishOfTank.all(tankId).map(hydrate),
    fishOfOwner: (tankId, userId) => hydrate(q.fishOfOwner.get(tankId, userId)),

    setFullness(fishId, fullness) {
      q.updateFullness.run(fullness, now(), statusFor(fullness), fishId);
      return store.fishById(fishId);
    },

    /** Removes the fish row and its face asset from disk (spec FR-020, AC-11). */
    deleteFish(fishId) {
      const fish = store.fishById(fishId);
      if (!fish) return null;
      q.deleteFish.run(fishId);
      removeFaceAsset(fish.faceAssetUrl);
      return fish;
    },

    deleteFishOfOwner(tankId, userId) {
      const fish = store.fishOfOwner(tankId, userId);
      if (!fish) return null;
      q.deleteFishOfOwner.run(tankId, userId);
      removeFaceAsset(fish.faceAssetUrl);
      return fish;
    },

    /** Full account erasure: fish, face assets, membership, sessions, user row. */
    deleteUser(userId) {
      const tanks = db
        .prepare('SELECT tank_id FROM fish WHERE owner_user_id = ?')
        .all(userId);
      for (const { tank_id } of tanks) store.deleteFishOfOwner(tank_id, userId);
      q.deleteSessionsForUser.run(userId);
      q.deleteUser.run(userId);
    },

    // ---- interactions & activity -----------------------------------------

    msSinceLastFeed(fishId, actorUserId) {
      const row = q.lastFeedAt.get(fishId, actorUserId);
      return row ? now() - row.created_at : null;
    },

    recordInteraction({ tankId, actorUserId, targetFishId, type, result }) {
      const id = newId('int');
      q.insertInteraction.run(
        id,
        tankId,
        actorUserId,
        targetFishId,
        type,
        result,
        now(),
      );
      return id;
    },

    recordActivity({ tankId, type, actorId = null, targetId = null, payload = {} }) {
      const event = {
        id: newId('act'),
        tank_id: tankId,
        type,
        actor_id: actorId,
        target_id: targetId,
        payload: JSON.stringify(payload),
        created_at: now(),
      };
      q.insertActivity.run(
        event.id,
        event.tank_id,
        event.type,
        event.actor_id,
        event.target_id,
        event.payload,
        event.created_at,
      );
      return toActivity(event);
    },

    activity(tankId, limit = config.activity.limit) {
      // Newest-first from SQL, flipped so the caller gets chronological order.
      return q.recentActivity.all(tankId, limit).map(toActivity).reverse();
    },

    msSinceActivity(tankId, type, actorId) {
      const row = q.lastActivityOfType.get(tankId, type, actorId);
      return row ? now() - row.created_at : null;
    },

    pruneActivity() {
      return q.pruneActivity.run(now() - config.activity.retentionMs).changes;
    },

    recordAnalytics({ name, userId = null, props = {} }) {
      q.insertAnalytics.run(
        newId('anl'),
        name,
        userId,
        JSON.stringify(props),
        now(),
      );
    },

    close() {
      db.close();
    },
  };

  return store;
}

function toActivity(row) {
  return {
    id: row.id,
    tankId: row.tank_id,
    type: row.type,
    actorId: row.actor_id,
    targetId: row.target_id,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    createdAt: row.created_at,
  };
}

function removeFaceAsset(assetUrl) {
  const name = path.basename(assetUrl ?? '');
  if (!name || !/^[\w.-]+\.png$/.test(name)) return;
  fs.rmSync(path.join(faceDir, name), { force: true });
}
