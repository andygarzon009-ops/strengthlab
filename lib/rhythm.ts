/// The rhythm half of the feed's week card: the goal-hit week streak and how
/// recently each body region was trained (for the muscle map). Moved out of
/// the old Progress / Your rhythm card when it merged with This week.

import { prisma } from "@/lib/db";
import { startOfWeek, endOfWeek, subWeeks, format } from "date-fns";
import { shapeForType } from "@/lib/exercises";
import type { MuscleRecency } from "@/components/MuscleMap";

// Vercel runs in UTC but the user lives in MST; compute calendar-day
// deltas in MST so "6 days ago" doesn't tip over into 7 days for late-day
// workouts logged near the UTC boundary.
const MST_OFFSET_MS = 7 * 60 * 60 * 1000;
const mstDayIndex = (d: Date) =>
  Math.floor((d.getTime() - MST_OFFSET_MS) / 86_400_000);
const daysSinceInMST = (now: Date, then: Date) =>
  mstDayIndex(now) - mstDayIndex(then);

export type Rhythm = { streak: number; goal: number; recency: MuscleRecency };

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

  // Recency at the broad-group level (Chest / Back / Shoulders / Arms /
  // Legs / Core), driven entirely off the `muscleGroup` column the user
  // saw when they logged each exercise. Compound lifts hit multiple
  // muscles in a region — squats credit the whole leg block, bench
  // presses credit the whole chest block — so collapsing to one specific
  // muscle per lift would lie. Every specific region in MuscleMap takes
  // its broad group's recency so the body lights up by area.
  const BROAD_TO_SPECIFICS: Record<string, string[]> = {
    Chest: ["Pec Major", "Pec Minor", "Serratus"],
    Back: ["Lats", "Traps", "Rhomboids", "Lower Back", "Teres"],
    Shoulders: ["Front Delts", "Side Delts", "Rear Delts"],
    Arms: ["Biceps", "Brachialis", "Triceps", "Forearms"],
    Legs: ["Quads", "Hamstrings", "Glutes", "Adductors", "Abductors", "Calves", "Tibialis"],
    Core: ["Abs", "Obliques"],
  };

  // The seed library tags exercises with a mix of broad ("Chest", "Back")
  // and specific ("Quads", "Triceps") muscleGroup strings — normalize both
  // to one of the 6 broad regions so any logged exercise contributes.
  const TO_BROAD: Record<string, string> = {
    Chest: "Chest",
    Back: "Back",
    "Lower Back": "Back",
    Shoulders: "Shoulders",
    Arms: "Arms",
    Biceps: "Arms",
    Triceps: "Arms",
    Forearms: "Arms",
    Legs: "Legs",
    Quads: "Legs",
    Hamstrings: "Legs",
    Glutes: "Legs",
    Calves: "Legs",
    Core: "Core",
  };

  const broadRecency: Record<string, number> = {};
  for (const w of workouts) {
    if (shapeForType(w.type) !== "STRENGTH") continue;
    const days = daysSinceInMST(today, new Date(w.date));
    for (const we of w.exercises) {
      const hit = we.sets.some(
        (s) => s.type === "WORKING" || s.type === "SUPERSET" || s.type === "DROP_SET"
      );
      if (!hit) continue;
      const raw = we.exercise.muscleGroup;
      if (!raw) continue;
      const broad = TO_BROAD[raw];
      if (!broad) continue;
      if (broadRecency[broad] === undefined || days < broadRecency[broad]) {
        broadRecency[broad] = days;
      }
    }
  }

  const recency: MuscleRecency = {};
  for (const [broad, specifics] of Object.entries(BROAD_TO_SPECIFICS)) {
    const d = broadRecency[broad];
    if (d === undefined) continue;
    for (const m of specifics) recency[m] = d;
  }

  return { streak, goal, recency };
}
