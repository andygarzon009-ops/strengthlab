import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

// One-time cleanup of the built-in exercise library:
//   1. Rename generic built-ins to their specific name.
//   2. Merge redundant/duplicate built-in rows so PRs and metrics roll up.
//
// Both steps re-point WorkoutExercise / PersonalRecord / Goal / Challenge
// references and delete the now-unused source row. Safe to re-run; rows
// that no longer exist are skipped silently.

// Old name → new specific name. The source row is renamed in place
// (or merged into the destination if a row with the new name already
// exists). User customs are NOT renamed — only built-ins (ownerId IS NULL).
const RENAMES = [
  { from: "Barbell Bench Press", to: "Flat Barbell Bench Press" },
  { from: "Dumbbell Bench Press", to: "Flat Dumbbell Bench Press" },
  { from: "Dumbbell Fly", to: "Flat Dumbbell Fly" },
  { from: "Push-Up", to: "Standard Push-Up" },
  { from: "Front Raise", to: "Front Raise (Dumbbell)" },
  { from: "Smith Machine Bench Press", to: "Smith Machine Flat Bench Press" },
  { from: "Hack Squat Machine", to: "Hack Squat" },
  { from: "Pendulum Squat Machine", to: "Pendulum Squat" },
  { from: "Single-Leg Leg Press", to: "Single-Leg Press" },
  { from: "Standing Leg Curl Machine (Pin)", to: "Standing Leg Curl" },
  { from: "Glute Ham Raise", to: "Glute-Ham Raise" },
  { from: "45-Degree Back Extension (Glute Focus)", to: "Glute-Focused Back Extension" },
  { from: "Parallel Bar Dip", to: "Tricep Dip" },
];

const adapter = new PrismaPg(process.env.DATABASE_URL, { schema: "public" });
const prisma = new PrismaClient({ adapter });

async function repointAndDelete(srcId, dstId) {
  return prisma.$transaction(async (tx) => {
    const wo = await tx.workoutExercise.updateMany({
      where: { exerciseId: srcId },
      data: { exerciseId: dstId },
    });
    const pr = await tx.personalRecord.updateMany({
      where: { exerciseId: srcId },
      data: { exerciseId: dstId },
    });
    const go = await tx.goal.updateMany({
      where: { exerciseId: srcId },
      data: { exerciseId: dstId },
    });
    const ch = await tx.challenge.updateMany({
      where: { exerciseId: srcId },
      data: { exerciseId: dstId },
    });
    await tx.exercise.delete({ where: { id: srcId } });
    return { wo: wo.count, pr: pr.count, go: go.count, ch: ch.count };
  });
}

async function applyRenames() {
  console.log("\n--- step 1: renames ---");
  for (const { from, to } of RENAMES) {
    const sources = await prisma.exercise.findMany({
      where: { name: from, ownerId: null },
      select: { id: true },
    });
    if (sources.length === 0) {
      console.log(`skip rename: no built-in named "${from}"`);
      continue;
    }
    const dest = await prisma.exercise.findFirst({
      where: { name: to, ownerId: null },
      select: { id: true },
    });
    if (!dest) {
      // No destination yet — just rename the first source row.
      const [first, ...rest] = sources;
      await prisma.exercise.update({
        where: { id: first.id },
        data: { name: to },
      });
      console.log(`renamed "${from}" → "${to}"`);
      // If multiple "from" rows existed, merge the rest into the renamed one.
      for (const extra of rest) {
        const counts = await repointAndDelete(extra.id, first.id);
        console.log(`  merged extra "${from}" row → "${to}" ${JSON.stringify(counts)}`);
      }
    } else {
      // Destination exists — merge every source row into it.
      for (const src of sources) {
        if (src.id === dest.id) continue;
        const counts = await repointAndDelete(src.id, dest.id);
        console.log(`merged "${from}" → "${to}" ${JSON.stringify(counts)}`);
      }
    }
  }
}

async function dedupeBuiltIns() {
  console.log("\n--- step 2: dedupe built-ins by name ---");
  const builtIns = await prisma.exercise.findMany({
    where: { ownerId: null },
    select: { id: true, name: true },
  });
  // Group by lowercased name; if 2+ rows share a name, keep the one with
  // the most workout references and merge the others into it.
  const groups = new Map();
  for (const ex of builtIns) {
    const key = ex.name.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ex);
  }

  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    // Pick the row with the most workout references as the canonical one.
    const refCounts = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        count: await prisma.workoutExercise.count({
          where: { exerciseId: r.id },
        }),
      }))
    );
    refCounts.sort((a, b) => b.count - a.count);
    const keepId = refCounts[0].id;
    for (const r of rows) {
      if (r.id === keepId) continue;
      const counts = await repointAndDelete(r.id, keepId);
      console.log(`deduped "${rows[0].name}" — kept ${keepId} ${JSON.stringify(counts)}`);
    }
  }
}

async function main() {
  await applyRenames();
  await dedupeBuiltIns();
  const remaining = await prisma.exercise.count({ where: { ownerId: null } });
  console.log(`\nDone. ${remaining} built-in exercises remain.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
