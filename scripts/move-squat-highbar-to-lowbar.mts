import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

// One-off: the earlier alias merge folded generic "Barbell Back Squat" logs
// (4 sessions, PRs) onto "Back Squat (High Bar)", which had no logs of its
// own. Those sessions were never specifically high-bar, so re-point them to
// "Back Squat (Low Bar)". High Bar is left in place (0 logs), available for
// deliberate high-bar logging.
//
//   Dry run:  npx tsx scripts/move-squat-highbar-to-lowbar.mts
//   Apply:    npx tsx scripts/move-squat-highbar-to-lowbar.mts --apply

const APPLY = process.argv.includes("--apply");
const adapter = new PrismaPg(process.env.DATABASE_URL!, { schema: "public" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const high = await prisma.exercise.findFirst({
    where: { name: "Back Squat (High Bar)", ownerId: null },
    select: { id: true },
  });
  const low = await prisma.exercise.findFirst({
    where: { name: "Back Squat (Low Bar)", ownerId: null },
    select: { id: true },
  });
  if (!high || !low) {
    console.log("Missing High Bar or Low Bar built-in row — aborting.", { high, low });
    await prisma.$disconnect();
    return;
  }

  const [wo, pr, go, ch] = await Promise.all([
    prisma.workoutExercise.count({ where: { exerciseId: high.id } }),
    prisma.personalRecord.count({ where: { exerciseId: high.id } }),
    prisma.goal.count({ where: { exerciseId: high.id } }),
    prisma.challenge.count({ where: { exerciseId: high.id } }),
  ]);
  console.log(`On High Bar now: ${wo} logs, ${pr} PRs, ${go} goals, ${ch} challenges`);
  console.log(APPLY ? "Moving all → Low Bar…" : "Dry run — re-run with --apply to move.");

  if (APPLY) {
    const counts = await prisma.$transaction(async (tx) => {
      const a = await tx.workoutExercise.updateMany({ where: { exerciseId: high.id }, data: { exerciseId: low.id } });
      const b = await tx.personalRecord.updateMany({ where: { exerciseId: high.id }, data: { exerciseId: low.id } });
      const c = await tx.goal.updateMany({ where: { exerciseId: high.id }, data: { exerciseId: low.id } });
      const d = await tx.challenge.updateMany({ where: { exerciseId: high.id }, data: { exerciseId: low.id } });
      return { wo: a.count, pr: b.count, go: c.count, ch: d.count };
    });
    console.log("Moved:", JSON.stringify(counts));
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
