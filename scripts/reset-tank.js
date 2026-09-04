/**
 * Empties the tank.
 *
 *   docker compose exec app node scripts/reset-tank.js              # dry run
 *   docker compose exec app node scripts/reset-tank.js --yes
 *   docker compose exec app node scripts/reset-tank.js --yes --everyone
 *
 * Nothing is deleted without `--yes`: the default run only prints what would
 * go. This is the one script here that destroys work people did, and there is
 * no undo, so it says its piece first and waits to be told twice.
 *
 * By default the tank itself survives — same id, same invite code — so every
 * link already sent to a friend still opens it, and everyone stays signed in.
 * `--everyone` also forgets who people are, which invalidates their sessions
 * and makes them type their name again.
 */
import { createStore } from '../server/store.js';
import { openSqlite } from '../server/sqlite.js';

const args = process.argv.slice(2);
const confirmed = args.includes('--yes');
const alsoPeople = args.includes('--everyone');

const db = openSqlite();
const store = createStore(db);
const tank = await store.defaultTank();

// ------------------------------------------------------------- what is there

const fish = await store.fishOfTank(tank.id);
const counts = {
  fish: fish.length,
  feedings: (
    await db.get(`SELECT COUNT(*) AS n FROM interactions WHERE tank_id = ?`, [tank.id])
  ).n,
  activity: (
    await db.get(`SELECT COUNT(*) AS n FROM activity_events WHERE tank_id = ?`, [tank.id])
  ).n,
  faces: (await db.get(`SELECT COUNT(*) AS n FROM face_assets`)).n,
  people: (await db.get(`SELECT COUNT(*) AS n FROM users`)).n,
};

console.log(`\nTank "${tank.name}"  (invite code ${tank.invite_code})\n`);
if (fish.length) {
  console.table(
    fish.map((f) => ({ name: f.ownerName, fullness: Math.round(f.fullness), status: f.status })),
  );
} else {
  console.log('  no fish\n');
}

console.log('This would delete:');
console.log(`  ${counts.fish} fish`);
console.log(`  ${counts.faces} face images`);
console.log(`  ${counts.feedings} feedings`);
console.log(`  ${counts.activity} activity entries`);
console.log(
  alsoPeople
    ? `  ${counts.people} people (everyone signs in again)`
    : `  and keep ${counts.people} people signed in`,
);
console.log(
  alsoPeople
    ? '\nThe tank keeps its invite code, so shared links still work.'
    : '\nThe tank keeps its invite code and its members, so nothing else changes.',
);

if (!confirmed) {
  console.log('\nNothing was deleted. Add --yes to go ahead.\n');
  db.close();
  process.exit(0);
}

// ------------------------------------------------------------------- delete

await db.run('BEGIN');
try {
  await db.run(`DELETE FROM interactions WHERE tank_id = ?`, [tank.id]);
  await db.run(`DELETE FROM activity_events WHERE tank_id = ?`, [tank.id]);
  await db.run(`DELETE FROM fish WHERE tank_id = ?`, [tank.id]);

  // Face images are referenced by id rather than by a foreign key, so they do
  // not go on their own. Anything no fish points at any more is nobody's.
  await db.run(
    `DELETE FROM face_assets
      WHERE id NOT IN (SELECT face_asset_id FROM fish)`,
  );

  if (alsoPeople) {
    await db.run(`DELETE FROM tank_members WHERE tank_id = ?`, [tank.id]);
    await db.run(`DELETE FROM sessions`);
    // Only people with nothing left anywhere: deleting a user cascades to
    // their fish, and another tank's fish are not this reset's to take.
    await db.run(
      `DELETE FROM users
        WHERE id NOT IN (SELECT owner_user_id FROM fish)`,
    );
  }
  await db.run('COMMIT');
} catch (err) {
  await db.run('ROLLBACK');
  console.error('\nNothing was deleted — the reset failed and rolled back:\n', err);
  db.close();
  process.exit(1);
}

// SQLite keeps the freed pages unless told otherwise, and the face images were
// the bulk of the file.
await db.run('VACUUM');

const left = await store.fishOfTank(tank.id);
console.log(`\nDone. The tank has ${left.length} fish.`);
console.log('Open tabs will catch up on their next refresh.\n');

db.close();
