import "dotenv/config";
import { prisma } from "../lib/db";
import { detectSplit, shapeForType } from "../lib/exercises";

const SPLIT_TITLES: Record<string, string> = {
  PUSH: "Push Day",
  PULL: "Pull Day",
  LEGS: "Legs Day",
  UPPER: "Upper Day",
  LOWER: "Lower Day",
  ARMS: "Arms Day",
  FULL_BODY: "Full Body",
  CORE: "Core Day",
};

// We only retitle workouts whose current title looks like an auto-generated
// split label — that way manually-named sessions ("Heavy Squat Focus") stay
// untouched even if their exercise mix happens to detect differently.
const AUTO_TITLES = new Set([
  ...Object.values(SPLIT_TITLES).map((t) => t.toLowerCase()),
  "weight training",
  "calisthenics",
  "workout",
  "session",
]);

async function main() {
  const dryRun = process.argv.includes("--dry");

  const workouts = await prisma.workout.findMany({
    where: {},
    select: {
      id: true,
      title: true,
      split: true,
      type: true,
      exercises: {
        select: { exercise: { select: { name: true } } },
      },
    },
  });

  const updates: {
    id: string;
    from: { title: string; split: string | null };
    to: { title: string; split: string };
    autoTitle: boolean;
  }[] = [];

  for (const w of workouts) {
    if (shapeForType(w.type) !== "STRENGTH") continue;
    const names = w.exercises.map((e) => e.exercise.name);
    if (names.length === 0) continue;
    const detected = detectSplit(names);
    if (!detected || detected === w.split) continue;
    // Limit to the Face-Pull-style fix: only reclassify when the old
    // bucketing was UPPER/ARMS and the new one is PUSH or PULL. Skips
    // LEGS <-> FULL_BODY / LOWER reshuffles which may not reflect intent.
    const isObviousFix =
      (w.split === "UPPER" || w.split === "ARMS") &&
      (detected === "PUSH" || detected === "PULL");
    if (!isObviousFix) continue;

    const autoTitle = AUTO_TITLES.has(w.title.trim().toLowerCase());
    const nextTitle = autoTitle ? SPLIT_TITLES[detected] ?? w.title : w.title;
    updates.push({
      id: w.id,
      from: { title: w.title, split: w.split },
      to: { title: nextTitle, split: detected },
      autoTitle,
    });
  }

  console.log(`Found ${updates.length} workout(s) to reclassify`);
  for (const u of updates) {
    const titlePart = u.autoTitle
      ? `"${u.from.title}" -> "${u.to.title}"`
      : `(title kept: "${u.from.title}")`;
    console.log(
      `  split ${u.from.split ?? "—"} -> ${u.to.split}  ${titlePart}`,
    );
  }

  if (updates.length === 0) {
    await prisma.$disconnect();
    return;
  }
  if (dryRun) {
    console.log("DRY RUN — no changes written. Re-run without --dry to apply.");
    await prisma.$disconnect();
    return;
  }

  for (const u of updates) {
    await prisma.workout.update({
      where: { id: u.id },
      data: { split: u.to.split, title: u.to.title },
    });
  }
  console.log(`Updated ${updates.length} workout(s).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
