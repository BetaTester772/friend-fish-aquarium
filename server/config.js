/**
 * Tunable product rules.
 *
 * The Reel shows `fed` / `is full` / `ignored` events but never the underlying
 * numbers (spec §6). Everything here is therefore a documented product decision,
 * not something observed, and is meant to be tuned.
 */
export const config = {
  /** Fullness is the single status value rendered as the bar under each name (spec FR-003). */
  fullness: {
    min: 0,
    max: 100,
    /** Fullness a brand new fish joins the tank with. */
    initial: 60,
    /** A fish at/above this is "full" and refuses more food (spec FR-014). */
    fullThreshold: 80,
    /** Below this the fish reads as "hungry" and the bar turns warm. */
    hungryThreshold: 40,
    /** One feed is worth this much fullness. */
    feedAmount: 15,
    /**
     * Tamagotchi decay (spec §6 "[추정]"): a completely full fish drains to empty
     * in ~24h, so checking in on friends once a day actually matters.
     */
    decayPerHour: 100 / 24,
  },

  feed: {
    /** Per (actor -> fish) cooldown. Blocks double-taps and rapid repeat feeds (spec §10). */
    cooldownMs: 8_000,
    /** Base chance a fish just… doesn't feel like it (spec FR-016). */
    ignoreBaseChance: 0.15,
    /** Extra ignore chance when the same friend fed this fish very recently. */
    ignorePesteredChance: 0.25,
    /** Window that counts as "pestering". */
    ignorePesteredWindowMs: 120_000,
    /** Extra ignore chance when the fish is nearly sated. */
    ignoreSatedChance: 0.2,
    ignoreSatedFullness: 70,
    ignoreMaxChance: 0.6,
    /**
     * Open question in spec §15 ("자기 fish feed 허용 여부는 확인 필요").
     * Decision: allowed, so a solo visitor still has something to do, but it is
     * recorded as a distinct interaction so analytics can separate it.
     */
    allowSelfFeed: true,
  },

  activity: {
    /** How many events the feed renders / the API returns by default (spec S5). */
    limit: 50,
    /** Retention for the activity log (spec §15 "activity feed는 누구에게 얼마나 오래 보관되는가"). */
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    /** Don't spam "{user} is here" every time a tab reconnects. */
    presenceEventCooldownMs: 10 * 60 * 1000,
  },

  presence: {
    /** A member is "here" if seen within this window. */
    onlineWindowMs: 60_000,
    /** Client heartbeat interval; the client uses this value too. */
    heartbeatMs: 20_000,
  },

  session: {
    cookieName: 'ffa_session',
    maxAgeMs: 365 * 24 * 60 * 60 * 1000,
  },

  /** Cap on the stored face cutout (a derived PNG, never raw video — spec §12). */
  faceAsset: {
    maxBytes: 2 * 1024 * 1024,
  },
};
