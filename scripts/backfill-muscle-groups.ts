/**
 * One-off backfill: exercises created ad hoc (voice logging, coach plans, the
 * manual add form) were saved with muscleGroup = null, which made them vanish
 * from the coverage scan and the split breakdown — 27 of 97 working sets in a
 * single week. Infer the group from the name for every untagged row.
 *
 * Run: node -r dotenv/config ./node_modules/.bin/tsx scripts/backfill-muscle-groups.ts
 * Add --apply to write; without it the script only reports.
 */
import pg from "pg";
import { scanGroupFor } from "../lib/exercises";

async function main() {
  const apply = process.argv.includes("--apply");
  const c = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const { rows } = await c.query<{ id: string; name: string }>(
    `select id, name from "Exercise" where "muscleGroup" is null order by name`,
  );

  let updated = 0;
  let unplaced = 0;
  for (const e of rows) {
    const group = scanGroupFor(e.name);
    if (!group) {
      unplaced++;
      console.log(`  skip  ${e.name} — no group inferable`);
      continue;
    }
    console.log(`  ${group.padEnd(11)} ${e.name}`);
    if (apply) {
      await c.query(`update "Exercise" set "muscleGroup" = $1 where id = $2`, [
        group,
        e.id,
      ]);
    }
    updated++;
  }

  console.log(
    `\n${rows.length} untagged · ${updated} ${apply ? "updated" : "would update"} · ${unplaced} left null`,
  );
  await c.end();
}

main();
