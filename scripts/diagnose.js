/**
 * Prints what the tank has been doing lately, for when someone reports that
 * something "doesn't work".
 *
 *   docker compose exec app node scripts/diagnose.js
 *   docker compose exec app node scripts/diagnose.js --limit 60
 *
 * This exists because the alternative is a `node -e` one-liner with SQL nested
 * inside two levels of shell quoting, which is a good way to spend five minutes
 * debugging the quoting instead of the bug.
 */
import { createStore } from '../server/store.js';
import { openSqlite } from '../server/sqlite.js';

const args = process.argv.slice(2);
const limit = Number(args[args.indexOf('--limit') + 1]) || 40;
/** Reports come in local time, so show local time. */
const tz = process.env.FFA_TZ ?? '+9 hours';

const db = openSqlite();
const store = createStore(db);

const local = `datetime(created_at/1000, 'unixepoch', '${tz}')`;

// ---------------------------------------------------------------- the funnel

/**
 * Adding a fish runs a fixed sequence, so where it stops is the diagnosis:
 *   add_fish_clicked -> camera_permission_result -> face_detector_ready
 *   -> face_detected -> fish_preview_shown -> fish_added
 */
const STEPS = [
  'add_fish_clicked',
  'camera_permission_result',
  'face_detector_ready',
  'face_detected',
  'fish_preview_shown',
  'fish_added',
];

const counts = await db.all(
  `SELECT name, COUNT(*) AS n FROM analytics_events GROUP BY name`,
);
const byName = new Map(counts.map((row) => [row.name, row.n]));

console.log('\nHow far people get when adding a fish\n');
console.table(
  STEPS.map((name) => ({
    step: name,
    count: byName.get(name) ?? 0,
  })),
);

// Which build produced these reports. Without it there is no way to tell a
// fix that did not work from a fix that was never deployed.
const builds = await db.all(
  `SELECT json_extract(props,'$.build') AS build, COUNT(*) AS n, MAX(${local}) AS last
     FROM analytics_events WHERE name = 'tank_viewed' AND build IS NOT NULL
    GROUP BY build ORDER BY last DESC LIMIT 5`,
);
if (builds.length) {
  console.log('\nClient builds people are running\n');
  console.table(builds);
}

const troubles = [
  'camera_playback_blocked',
  'face_cutout_failed',
  'camera_stalled',
  'face_detector_failed',
  'webgl_unavailable',
  'in_app_browser_escape',
].filter((name) => byName.has(name));

if (troubles.length) {
  console.log('\nProblems reported by the client\n');
  console.table(troubles.map((name) => ({ problem: name, count: byName.get(name) })));
} else {
  console.log('\nNo client-side camera or rendering problems recorded.');
}

// ------------------------------------------------------------------- details

console.log(`\nLast ${limit} events\n`);
console.table(
  await db.all(
    `SELECT ${local} AS at, name, props FROM analytics_events
      ORDER BY created_at DESC LIMIT ?`,
    [limit],
  ),
);

// --------------------------------------------------------------------- fish

const tank = await store.defaultTank();
console.log(`\nFish in "${tank.name}"\n`);
console.table(
  (await store.fishOfTank(tank.id)).map((fish) => ({
    name: fish.ownerName,
    fullness: Math.round(fish.fullness),
    status: fish.status,
  })),
);

db.close();
