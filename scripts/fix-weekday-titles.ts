import "dotenv/config";
import { prisma } from "../lib/db";

const SPLIT_TITLE: Record<string, string> = {
  PUSH: "Push Day",
  PULL: "Pull Day",
  LEGS: "Legs Day",
  UPPER: "Upper Day",
  LOWER: "Lower Day",
  ARMS: "Arms Day",
  FULL_BODY: "Full Body",
  CORE: "Core Day",
};

const WEEKDAY_RE =
  /\b(?:mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur|sun)(?:day)?s?\b/gi;

function sanitize(raw: string, split: string | null): string {
  const fallback = (split && SPLIT_TITLE[split]) || "Workout";
  let cleaned = raw
    .replace(WEEKDAY_RE, "")
    .replace(/\s*[—–\-:·|]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  cleaned = cleaned.replace(/^[\s—–\-:·|]+|[\s—–\-:·|]+$/g, "").trim();
  return cleaned || fallback;
}

async function main() {
  const dryRun = process.argv.includes("--dry");
  const workouts = await prisma.workout.findMany({
    where: {
      title: {
        contains: "day",
        mode: "insensitive",
      },
    },
    select: { id: true, title: true, split: true },
  });

  const candidates = workouts.filter((w) => WEEKDAY_RE.test(w.title));
  WEEKDAY_RE.lastIndex = 0;

  // Also scan titles that don't contain "day" but still have a weekday token.
  const all = await prisma.workout.findMany({
    select: { id: true, title: true, split: true },
  });
  const more = all.filter((w) => {
    WEEKDAY_RE.lastIndex = 0;
    return WEEKDAY_RE.test(w.title);
  });
  WEEKDAY_RE.lastIndex = 0;

  const seen = new Set(candidates.map((c) => c.id));
  for (const w of more) if (!seen.has(w.id)) candidates.push(w);

  console.log(`Found ${candidates.length} workout(s) with weekday in title`);
  if (candidates.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const updates: { id: string; from: string; to: string }[] = [];
  for (const w of candidates) {
    const next = sanitize(w.title, w.split);
    if (next !== w.title) updates.push({ id: w.id, from: w.title, to: next });
  }

  for (const u of updates) {
    console.log(`  ${u.from}  ->  ${u.to}`);
  }

  if (dryRun) {
    console.log("DRY RUN — no changes written. Re-run without --dry to apply.");
    await prisma.$disconnect();
    return;
  }

  for (const u of updates) {
    await prisma.workout.update({
      where: { id: u.id },
      data: { title: u.to },
    });
  }
  console.log(`Updated ${updates.length} workout title(s).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
