/// The rhythm half of the feed's week card: the goal-hit week streak and how
/// recently each body region was trained (for the muscle map). Moved out of
/// the old Progress / Your rhythm card when it merged with This week.

import { prisma } from "@/lib/db";
import { startOfWeek, endOfWeek, subWeeks, format } from "date-fns";
import type { MuscleLoad } from "@/components/MuscleMap";
import {
  broadGroupForSpecific,
  shapeForType,
  specificMuscleFor,
} from "@/lib/exercises";

/// Muscles that do real work alongside a lift's primary mover.
const SYNERGISTS: Record<string, string[]> = {
  "Pec Major": ["Front Delts", "Triceps"],
  Lats: ["Biceps", "Rear Delts", "Rhomboids"],
  Rhomboids: ["Rear Delts", "Biceps", "Traps"],
  Traps: ["Rhomboids"],
  "Front Delts": ["Triceps"],
  "Side Delts": ["Traps"],
  "Rear Delts": ["Rhomboids"],
  Quads: ["Glutes", "Adductors"],
  Hamstrings: ["Glutes", "Lower Back"],
  Glutes: ["Hamstrings"],
  "Lower Back": ["Glutes", "Hamstrings"],
  Biceps: ["Forearms"],
  Abs: ["Obliques"],
};

/// For exercises tagged only with a broad group.
const BROAD_SPECIFICS: Record<string, string[]> = {
  Chest: ["Pec Major"],
  Back: ["Lats", "Traps", "Rhomboids", "Lower Back"],
  Shoulders: ["Front Delts", "Side Delts", "Rear Delts"],
  Arms: ["Biceps", "Triceps", "Forearms"],
  Legs: ["Quads", "Hamstrings", "Glutes", "Calves"],
  Core: ["Abs", "Obliques"],
};

// Vercel runs in UTC but the user lives in MST; compute calendar-day
// deltas in MST so "6 days ago" doesn't tip over into 7 days for late-day
// workouts logged near the UTC boundary.
const MST_OFFSET_MS = 7 * 60 * 60 * 1000;
const mstDayIndex = (d: Date) =>
  Math.floor((d.getTime() - MST_OFFSET_MS) / 86_400_000);
const daysSinceInMST = (now: Date, then: Date) =>
  mstDayIndex(now) - mstDayIndex(then);

export type Rhythm = { streak: number; goal: number; load: MuscleLoad };

export async function loadRhythm(
  userId: string,
  trainingDaysGoal?: number | null,
): Promise<Rhythm | null> {
  // Pull enough history to compute a multi-week streak and muscle recency.
  const since = startOfWeek(subWeeks(new Date(), 25), { weekStartsOn: 1 });
  const workouts = await prisma.workout.findMany({
    where: { userId, date: { gte: since } },
    include: {
      exercises: {
        include: { exercise: true, sets: true },
      },
    },
    orderBy: { date: "desc" },
  });

  if (workouts.length === 0) return null;

  const today = new Date();
  const goal = Math.max(1, trainingDaysGoal ?? 4);

  // ----- Goal-hit week streak: consecutive weeks where the user trained
  // on at least `goal` distinct days. The current week doesn't break the
  // streak until it actually ends — if it hasn't met the goal yet, we
  // count from the prior week.
  const distinctDaysInWeek = (weekIdx: number) => {
    const start = startOfWeek(subWeeks(today, weekIdx), { weekStartsOn: 1 });
    const end = endOfWeek(start, { weekStartsOn: 1 });
    const days = new Set<string>();
    for (const w of workouts) {
      const d = new Date(w.date);
      if (d >= start && d <= end) days.add(format(d, "yyyy-MM-dd"));
    }
    return days.size;
  };
  const weekMetGoal = (weekIdx: number) => distinctDaysInWeek(weekIdx) >= goal;
  let streak = 0;
  const startIdx = weekMetGoal(0) ? 0 : 1;
  for (let i = startIdx; i < 26; i++) {
    if (weekMetGoal(i)) streak++;
    else break;
  }

  // Per-muscle load. Each exercise credits its primary muscle (from the
  // exercise name, which is finer than the muscleGroup column) with every
  // working set, and the muscles that help it with half a set each — a
  // squat is quads first, but glutes and adductors are working too.
  const load: MuscleLoad = {};
  const hitDays: Record<string, Set<number>> = {};
  const credit = (muscle: string, days: number, sets: number) => {
    const cur = load[muscle] ?? { days: Infinity, sets: 0, streak: 0 };
    cur.days = Math.min(cur.days, days);
    if (days < 7) cur.sets += sets;
    load[muscle] = cur;
    (hitDays[muscle] ??= new Set()).add(days);
  };

  for (const w of workouts) {
    if (shapeForType(w.type) !== "STRENGTH") continue;
    const days = daysSinceInMST(today, new Date(w.date));
    for (const we of w.exercises) {
      const sets = we.sets.filter(
        (s) => s.type === "WORKING" || s.type === "SUPERSET" || s.type === "DROP_SET",
      ).length;
      if (sets === 0) continue;
      const named = specificMuscleFor(we.exercise.name);
      const column = we.exercise.muscleGroup ?? "";
      const primary =
        named !== "Other" ? named : broadGroupForSpecific(column) ? column : null;
      if (primary) {
        credit(primary, days, sets);
        for (const helper of SYNERGISTS[primary] ?? []) credit(helper, days, sets / 2);
      } else if (BROAD_SPECIFICS[column]) {
        // Only a broad group to go on: spread it across the region.
        for (const m of BROAD_SPECIFICS[column]) credit(m, days, sets / 2);
      }
    }
  }

  // Consecutive days hit, counting back from today (or yesterday, so a
  // rest day today doesn't reset a run that ended last night).
  for (const [muscle, set] of Object.entries(hitDays)) {
    let d = set.has(0) ? 0 : 1;
    let run = 0;
    while (set.has(d)) {
      run++;
      d++;
    }
    load[muscle]!.streak = run;
    load[muscle]!.sets = Math.round(load[muscle]!.sets * 10) / 10;
  }

  return { streak, goal, load };
}
