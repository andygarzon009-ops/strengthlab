import "dotenv/config";
import { prisma } from "../lib/db";

// Maps every existing custom exercise to a canonical built-in. Determined
// from a one-time review of the DB; safe to re-run (no-op once empty).
const MERGES: Array<{ from: string; to: string }> = [
  { from: "Adductor Machine", to: "Adductor Machine (Pin)" },
  { from: "Back extension", to: "Glute-Focused Back Extension" },
  { from: "Cable hamstring curl", to: "Standing Leg Curl" },
  { from: "Cable lat pulldown", to: "Lat Pulldown" },
  { from: "chest supported rows", to: "Chest-Supported Row" },
  { from: "Cossack squat", to: "Cossack Squat" },
  { from: "Glute Medius Kickbacks", to: "Cable Kickback" },
  { from: "Smith Machine Bulgarians", to: "Smith Machine Bulgarian Split Squat" },
  { from: "weighed pull ups ", to: "Pull-Up" },
];

async function main() {
  // Resolve all source + target IDs upfront; abort if any target is missing.
  const sources = await prisma.exercise.findMany({
    where: { name: { in: MERGES.map((m) => m.from) }, isCustom: true },
    select: { id: true, name: true },
  });
  const targets = await prisma.exercise.findMany({
    where: { name: { in: MERGES.map((m) => m.to) } },
    select: { id: true, name: true, isCustom: true },
  });

  const missingTargets = MERGES.filter(
    (m) => !targets.find((t) => t.name === m.to && !t.isCustom)
  );
  if (missingTargets.length) {
    console.error("Missing built-in targets:", missingTargets);
    process.exit(1);
  }

  let merged = 0;
  let skipped = 0;
  for (const m of MERGES) {
    const src = sources.find((s) => s.name === m.from);
    if (!src) {
      skipped++;
      continue;
    }
    const tgt = targets.find((t) => t.name === m.to)!;

    await prisma.$transaction(async (tx) => {
      const wo = await tx.workoutExercise.updateMany({
        where: { exerciseId: src.id },
        data: { exerciseId: tgt.id },
      });
      const pr = await tx.personalRecord.updateMany({
        where: { exerciseId: src.id },
        data: { exerciseId: tgt.id },
      });
      const go = await tx.goal.updateMany({
        where: { exerciseId: src.id },
        data: { exerciseId: tgt.id },
      });
      const ch = await tx.challenge.updateMany({
        where: { exerciseId: src.id },
        data: { exerciseId: tgt.id },
      });
      await tx.exercise.delete({ where: { id: src.id } });
      console.log(
        `merged "${m.from}" → "${m.to}"  wo:${wo.count} pr:${pr.count} goal:${go.count} chal:${ch.count}`
      );
    });
    merged++;
  }

  // Anything left tagged isCustom that we didn't plan for — surface it.
  const leftover = await prisma.exercise.findMany({
    where: { isCustom: true },
    select: { id: true, name: true },
  });
  console.log(`\nDone. merged=${merged} skipped=${skipped} leftover=${leftover.length}`);
  if (leftover.length) console.log("Leftover customs:", leftover);

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
