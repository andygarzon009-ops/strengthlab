/// Backfill the training-block stamp onto sessions logged before the columns
/// existed (migration 0038).
///
/// The stamp is normally frozen at log time. Everything already in the table
/// predates that, so it has to be reconstructed — which is safe to do exactly
/// because the arithmetic is deterministic: the same cycle config and the same
/// set of trained weeks produce the same answer today as they would have then.
///
/// Note the one thing that ISN'T reconstructable and doesn't need to be: a
/// workout can never land in a "skipped" week, because its own existence is
/// what makes that week trained. So every session in a started cycle gets a
/// real block and week.
///
///   npx tsx scripts/backfill-workout-blocks.ts --dry     # report only
///   npx tsx scripts/backfill-workout-blocks.ts           # write
///   npx tsx scripts/backfill-workout-blocks.ts --force   # re-stamp everything
///
/// Without --force only unstamped sessions are touched, so a re-run is a no-op
/// and a session stamped at log time is never overwritten by a later replay of
/// a cycle the athlete has since edited.

import "dotenv/config";
import { prisma } from "../lib/db";
import { Prisma } from "../app/generated/prisma";
import {
  isValidConfig,
  periodizationState,
  trainedWeekSet,
  type PeriodizationConfig,
} from "../lib/periodization";
import { blockStampColumns, localDateKey } from "../lib/blockStamp";
import { advancesTrainingCycle } from "../lib/exercises";

type Stamp = ReturnType<typeof blockStampColumns>;

const stampKey = (s: Stamp) =>
  `${s.blockName ?? ""}|${s.blockWeek ?? ""}|${s.blockWeeks ?? ""}|${s.blockCycleWeek ?? ""}`;

async function main() {
  const dryRun = process.argv.includes("--dry");
  const force = process.argv.includes("--force");

  const users = await prisma.user.findMany({
    where: { periodization: { not: Prisma.DbNull } },
    select: { id: true, name: true, timezone: true, periodization: true },
  });

  let totalStamped = 0;
  let totalSkipped = 0;

  for (const u of users) {
    const cfg = u.periodization as PeriodizationConfig | null;
    if (!isValidConfig(cfg)) {
      console.log(`- ${u.name}: no valid cycle configured, skipped`);
      continue;
    }
    const tz = u.timezone || "UTC";

    // Every session from the cycle's start onward. The trained-week set has to
    // be built from ALL of them, including ones already stamped, or a gap in
    // the middle of the history would be read as time off that it wasn't.
    const workouts = await prisma.workout.findMany({
      where: { userId: u.id, date: { gte: new Date(`${cfg.startDate}T00:00:00Z`) } },
      select: { id: true, date: true, type: true, blockName: true },
      orderBy: { date: "asc" },
    });

    // Which weeks the cycle advanced through — resistance sessions only, the
    // same rule the coach and the logger use. Mobility and cardio still GET a
    // stamp (they happened during that block), they just don't move it.
    const trained = trainedWeekSet(
      cfg.startDate,
      workouts
        .filter((w) => advancesTrainingCycle(w.type))
        .map((w) => localDateKey(w.date, tz)),
    );

    // One update per distinct stamp rather than per workout: a 4-day week is
    // four rows carrying identical values.
    const byStamp = new Map<string, { stamp: Stamp; ids: string[] }>();
    let skipped = 0;

    for (const w of workouts) {
      if (!force && w.blockName != null) {
        skipped++;
        continue;
      }
      const state = periodizationState(cfg, localDateKey(w.date, tz), trained);
      if (!state) continue; // logged before week 1 of the cycle
      const stamp = blockStampColumns(state);
      const key = stampKey(stamp);
      const bucket = byStamp.get(key) ?? { stamp, ids: [] };
      bucket.ids.push(w.id);
      byStamp.set(key, bucket);
    }

    const count = [...byStamp.values()].reduce((n, b) => n + b.ids.length, 0);
    totalStamped += count;
    totalSkipped += skipped;
    console.log(
      `- ${u.name}: ${count} session(s) to stamp${skipped ? `, ${skipped} already stamped` : ""}`,
    );
    for (const b of [...byStamp.values()].sort(
      (a, z) => (a.stamp.blockCycleWeek ?? 0) - (z.stamp.blockCycleWeek ?? 0),
    )) {
      const wk =
        b.stamp.blockWeek == null
          ? ""
          : ` week ${b.stamp.blockWeek} of ${b.stamp.blockWeeks}`;
      console.log(
        `    training week ${b.stamp.blockCycleWeek}: ${b.stamp.blockName}${wk}  ×${b.ids.length}`,
      );
    }

    if (dryRun) continue;
    for (const b of byStamp.values()) {
      await prisma.workout.updateMany({
        where: { id: { in: b.ids } },
        data: b.stamp,
      });
    }
  }

  console.log(
    dryRun
      ? `\nDRY RUN — nothing written. ${totalStamped} session(s) would be stamped, ${totalSkipped} left alone.`
      : `\nStamped ${totalStamped} session(s); left ${totalSkipped} already-stamped alone.`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
