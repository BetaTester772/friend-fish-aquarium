import { config } from './config.js';
import { newId, newInviteCode, newSessionToken } from './ids.js';
import { decayedFullness, statusFor } from './game.js';
import { faceAssetUrl } from './faces.js';

/**
 * Data access for the aquarium.
 *
 * Every method is async and takes a database adapter, so the SQLite driver is
 * swappable without touching a query. Statements use positional `?` parameters
 * only, which every SQLite driver understands.
 *
 * Reads that return a fish resolve its decayed fullness first, so callers never
 * see a stale value (spec FR-013, §6).
 *
 * @param {{get: Function, all: Function, run: Function}} db
 */
export function createStore(db, { now = Date.now } = {}) {
  const DEFAULT_TANK_ID = 'tnk_default';

  /** Attach decayed fullness + derived status to a raw fish row. */
  function hydrate(row) {
    if (!row) return null;
    const fullness = decayedFullness(row.fullness, row.fullness_updated_at, now());
    return {
      id: row.id,
      tankId: row.tank_id,
      ownerUserId: row.owner_user_id,
      ownerName: row.owner_name,
      faceAssetUrl: faceAssetUrl(row.face_asset_id),
      bodyVariant: row.body_variant,
      finVariant: row.fin_variant,
      bodyColor: row.body_color,
      scale: row.scale,
      fullness: Math.round(fullness * 10) / 10,
      status: statusFor(fullness),
      createdAt: row.created_at,
    };
  }

  const FISH_SELECT = `
    SELECT f.*, u.display_name AS owner_name
      FROM fish f JOIN users u ON u.id = f.owner_user_id`;

  const store = {
    db,

    // ---- users & sessions -------------------------------------------------

    async createUser(displayName) {
      const user = {
        id: newId('usr'),
        display_name: displayName,
        avatar_url: null,
        created_at: now(),
      };
      await db.run(
        'INSERT INTO users (id, display_name, avatar_url, created_at) VALUES (?, ?, ?, ?)',
        [user.id, user.display_name, user.avatar_url, user.created_at],
      );
      return user;
    },

    async createSession(userId) {
      const token = newSessionToken();
      await db.run(
        'INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)',
        [token, userId, now()],
      );
      return token;
    },

    async sessionByToken(token) {
      if (!token) return null;
      const row = await db.get(
        `SELECT s.token, u.id AS user_id, u.display_name, u.avatar_url
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token = ?`,
        [token],
      );
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

    renameUser: (userId, displayName) =>
      db.run('UPDATE users SET display_name = ? WHERE id = ?', [displayName, userId]),

    // ---- tanks ------------------------------------------------------------

    async createTank({ name, createdBy = null, id = newId('tnk') }) {
      const tank = {
        id,
        name,
        invite_code: newInviteCode(),
        created_by: createdBy,
        created_at: now(),
      };
      await db.run(
        `INSERT INTO tanks (id, name, invite_code, created_by, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [tank.id, tank.name, tank.invite_code, tank.created_by, tank.created_at],
      );
      return tank;
    },

    tankById: (id) => db.get('SELECT * FROM tanks WHERE id = ?', [id]),
    tankByInvite: (code) => db.get('SELECT * FROM tanks WHERE invite_code = ?', [code]),

    /**
     * The app ships with one shared tank, created on first use.
     *
     * `INSERT OR IGNORE` on a fixed id makes this safe when several requests
     * race on a cold database — one wins, the rest read the winner's row.
     */
    async defaultTank() {
      const existing = await store.tankById(DEFAULT_TANK_ID);
      if (existing) return existing;

      await db.run(
        `INSERT OR IGNORE INTO tanks (id, name, invite_code, created_by, created_at)
         VALUES (?, 'the tank', ?, NULL, ?)`,
        [DEFAULT_TANK_ID, newInviteCode(), now()],
      );
      return store.tankById(DEFAULT_TANK_ID);
    },

    joinTank: (tankId, userId, role = 'member') =>
      db.run(
        `INSERT INTO tank_members (tank_id, user_id, role, joined_at, last_seen_at)
              VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (tank_id, user_id) DO UPDATE SET last_seen_at = ?`,
        [tankId, userId, role, now(), now(), now()],
      ),

    async isMember(tankId, userId) {
      const row = await db.get(
        'SELECT 1 AS ok FROM tank_members WHERE tank_id = ? AND user_id = ?',
        [tankId, userId],
      );
      return Boolean(row);
    },

    async members(tankId) {
      const cutoff = now() - config.presence.onlineWindowMs;
      const rows = await db.all(
        `SELECT m.user_id, m.role, m.joined_at, m.last_seen_at, u.display_name
           FROM tank_members m JOIN users u ON u.id = m.user_id
          WHERE m.tank_id = ? ORDER BY m.joined_at`,
        [tankId],
      );
      return rows.map((m) => ({
        userId: m.user_id,
        displayName: m.display_name,
        role: m.role,
        joinedAt: m.joined_at,
        lastSeenAt: m.last_seen_at,
        online: m.last_seen_at >= cutoff,
      }));
    },

    // ---- face assets ------------------------------------------------------

    async createFaceAsset(bytes) {
      const id = newId('face');
      await db.run(
        'INSERT INTO face_assets (id, bytes, created_at) VALUES (?, ?, ?)',
        [id, bytes, now()],
      );
      return id;
    },

    async faceAsset(id) {
      const row = await db.get('SELECT bytes FROM face_assets WHERE id = ?', [id]);
      return row ? toBytes(row.bytes) : null;
    },

    // ---- fish -------------------------------------------------------------

    async createFish(input) {
      const row = {
        id: newId('fsh'),
        fullness: config.fullness.initial,
        created_at: now(),
      };
      await db.run(
        `INSERT INTO fish (id, tank_id, owner_user_id, face_asset_id, body_variant,
                           fin_variant, body_color, scale, fullness,
                           fullness_updated_at, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          input.tankId,
          input.ownerUserId,
          input.faceAssetId,
          input.bodyVariant,
          input.finVariant,
          input.bodyColor,
          input.scale,
          row.fullness,
          row.created_at,
          statusFor(row.fullness),
          row.created_at,
        ],
      );
      return store.fishById(row.id);
    },

    async fishById(id) {
      return hydrate(await db.get(`${FISH_SELECT} WHERE f.id = ?`, [id]));
    },

    async fishOfTank(tankId) {
      const rows = await db.all(
        `${FISH_SELECT} WHERE f.tank_id = ? ORDER BY f.created_at`,
        [tankId],
      );
      return rows.map(hydrate);
    },

    async fishOfOwner(tankId, userId) {
      return hydrate(
        await db.get(
          `${FISH_SELECT} WHERE f.tank_id = ? AND f.owner_user_id = ?`,
          [tankId, userId],
        ),
      );
    },

    async setFullness(fishId, fullness) {
      await db.run(
        'UPDATE fish SET fullness = ?, fullness_updated_at = ?, status = ? WHERE id = ?',
        [fullness, now(), statusFor(fullness), fishId],
      );
      return store.fishById(fishId);
    },

    /** Removes the fish and the stored face image with it (spec FR-020). */
    async deleteFish(fishId) {
      const fish = await store.fishById(fishId);
      if (!fish) return null;
      await store.forgetFace(fish.faceAssetUrl);
      await db.run('DELETE FROM fish WHERE id = ?', [fishId]);
      return fish;
    },

    async deleteFishOfOwner(tankId, userId) {
      const fish = await store.fishOfOwner(tankId, userId);
      if (!fish) return null;
      await store.deleteFish(fish.id);
      return fish;
    },

    async forgetFace(assetUrl) {
      const match = /\/faces\/(face_[a-z0-9]+)\.png$/.exec(assetUrl ?? '');
      if (match) await db.run('DELETE FROM face_assets WHERE id = ?', [match[1]]);
    },

    /** Full account erasure: fish, face images, membership, sessions, user row. */
    async deleteUser(userId) {
      const rows = await db.all(
        'SELECT tank_id FROM fish WHERE owner_user_id = ?',
        [userId],
      );
      for (const row of rows) await store.deleteFishOfOwner(row.tank_id, userId);
      await db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM tank_members WHERE user_id = ?', [userId]);
      await db.run('DELETE FROM users WHERE id = ?', [userId]);
      return rows.map((row) => row.tank_id);
    },

    // ---- interactions & activity -----------------------------------------

    async msSinceLastFeed(fishId, actorUserId) {
      const row = await db.get(
        `SELECT created_at FROM interactions
          WHERE target_fish_id = ? AND actor_user_id = ? AND type LIKE 'feed%'
            AND result IN ('accepted', 'ignored')
          ORDER BY created_at DESC LIMIT 1`,
        [fishId, actorUserId],
      );
      return row ? now() - row.created_at : null;
    },

    recordInteraction: ({ tankId, actorUserId, targetFishId, type, result }) =>
      db.run(
        `INSERT INTO interactions
           (id, tank_id, actor_user_id, target_fish_id, type, result, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newId('int'), tankId, actorUserId, targetFishId, type, result, now()],
      ),

    async recordActivity({ tankId, type, actorId = null, targetId = null, payload = {} }) {
      const event = {
        id: newId('act'),
        tank_id: tankId,
        type,
        actor_id: actorId,
        target_id: targetId,
        payload: JSON.stringify(payload),
        created_at: now(),
      };
      await db.run(
        `INSERT INTO activity_events
           (id, tank_id, type, actor_id, target_id, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          event.id,
          event.tank_id,
          event.type,
          event.actor_id,
          event.target_id,
          event.payload,
          event.created_at,
        ],
      );
      return toActivity(event);
    },

    async activity(tankId, limit = config.activity.limit) {
      const rows = await db.all(
        `SELECT * FROM activity_events WHERE tank_id = ?
          ORDER BY created_at DESC, rowid DESC LIMIT ?`,
        [tankId, limit],
      );
      // Newest-first from SQL, flipped so the caller gets chronological order.
      return rows.map(toActivity).reverse();
    },

    async msSinceActivity(tankId, type, actorId) {
      const row = await db.get(
        `SELECT created_at FROM activity_events
          WHERE tank_id = ? AND type = ? AND actor_id = ?
          ORDER BY created_at DESC LIMIT 1`,
        [tankId, type, actorId],
      );
      return row ? now() - row.created_at : null;
    },

    pruneActivity: () =>
      db.run('DELETE FROM activity_events WHERE created_at < ?', [
        now() - config.activity.retentionMs,
      ]),

    recordAnalytics: ({ name, userId = null, props = {} }) =>
      db.run(
        'INSERT INTO analytics_events (id, name, user_id, props, created_at) VALUES (?, ?, ?, ?, ?)',
        [newId('anl'), name, userId, JSON.stringify(props), now()],
      ),
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

/** better-sqlite3 hands back a Buffer; other drivers an ArrayBuffer. */
function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  return new Uint8Array(value);
}
