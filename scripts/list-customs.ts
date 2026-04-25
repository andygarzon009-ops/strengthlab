import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  const customs = await prisma.exercise.findMany({
    where: { isCustom: true },
    select: {
      id: true,
      name: true,
      muscleGroup: true,
      splits: true,
      _count: { select: { workoutExercises: true, prs: true, goals: true, challenges: true } },
    },
    orderBy: { name: "asc" },
  });
  console.log("CUSTOM_COUNT:", customs.length);
  console.log(JSON.stringify(customs, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
