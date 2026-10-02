/// The rhythm half of the feed's week card: the goal-hit week streak and how
/// recently each body region was trained (for the muscle map). Moved out of
/// the old Progress / Your rhythm card when it merged with This week.

import { prisma } from "@/lib/db";
import { startOfWeek, endOfWeek, subWeeks, format } from "date-fns";
import type { MuscleLoad } from "@/components/MuscleMap";
import { rirWeight, summarize } from "@/lib/bodyScan";
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


export type Rhythm = { streak: number; goal: number; load: MuscleLoad };

export async function loadRhythm(
  userId: string,
  trainingDaysGoal?: number | null,
  sex?: string | null,
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
  // Each muscle's sessions in the last 7 days, in hours — recovery is
  // judged per muscle on its own clock (lib/muscleRecovery.ts).
  const sessions: Record<
    string,
    Map<string, { hoursAgo: number; sets: number; rawSets: number }>
  > = {};
  const nowMs = today.getTime();
  const credit = (
    muscle: string,
    workoutId: string,
    hoursAgo: number,
    sets: number,
    rawSets: number,
  ) => {
    const byWorkout = (sessions[muscle] ??= new Map());
    const cur = byWorkout.get(workoutId) ?? { hoursAgo, sets: 0, rawSets: 0 };
    cur.sets += sets;
    cur.rawSets += rawSets;
    byWorkout.set(workoutId, cur);
  };

  for (const w of workouts) {
    if (shapeForType(w.type) !== "STRENGTH") continue;
    const at = (w.endedAt ?? w.date).getTime();
    const hoursAgo = Math.max(0, (nowMs - at) / 3_600_000);
    if (hoursAgo > 7 * 24) continue;
    for (const we of w.exercises) {
      const working = we.sets.filter(
        (s) => s.type === "WORKING" || s.type === "SUPERSET" || s.type === "DROP_SET",
      );
      if (working.length === 0) continue;
      // Hard sets count for more — both stimulus and fatigue (lib/bodyScan).
      const raw = working.length;
      const sets = working.reduce((n, s) => n + rirWeight(s.rir), 0);
      const named = specificMuscleFor(we.exercise.name);
      const column = we.exercise.muscleGroup ?? "";
      const primary =
        named !== "Other" ? named : broadGroupForSpecific(column) ? column : null;
      if (primary) {
        credit(primary, w.id, hoursAgo, sets, raw);
        for (const helper of SYNERGISTS[primary] ?? [])
          credit(helper, w.id, hoursAgo, sets / 2, raw / 2);
      } else if (BROAD_SPECIFICS[column]) {
        // Only a broad group to go on: spread it across the region.
        for (const m of BROAD_SPECIFICS[column])
          credit(m, w.id, hoursAgo, sets / 2, raw / 2);
      }
    }
  }

  const load: MuscleLoad = {};
  for (const [muscle, byWorkout] of Object.entries(sessions)) {
    load[muscle] = summarize(muscle, [...byWorkout.values()], sex);
  }

  return { streak, goal, load };
}
