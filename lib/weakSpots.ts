import { differenceInDays, format, subDays } from "date-fns";
import {
  PRIORITY_MUSCLES,
  isPriorityMuscle,
  isTimedExercise,
  shapeForType,
  specificMuscleFor,
} from "@/lib/exercises";

export type Severity = "high" | "medium" | "low";

export type WeakSpotKind =
  | "missed-muscles"
  | "plateau"
  | "rep-stall"
  | "freq-gap"
  | "volume-drop"
  | "overtraining";

export type WeakSpot = {
  id: string;
  kind: WeakSpotKind;
  severity: Severity;
  title: string;
  detail: string;
  subject?: string;
  items?: string[];
};

// Minimal shape the analyzer needs — both the analytics page and the
// trainer route already fetch this with `include: { exercises: { sets,
// exercise } }`, so callers can hand off the result of that query.
type SetRow = {
  type: string;
  weight: number | null;
  reps: number | null;
};

type WorkoutExerciseRow = {
  exerciseId: string;
  exercise: { name: string };
  sets: SetRow[];
};

type WorkoutRow = {
  date: Date;
  type: string;
  exercises: WorkoutExerciseRow[];
};

type UserRow = {
  trainingDays: number | null;
};

export function computeWeakSpots(
  workoutsInput: WorkoutRow[],
  user: UserRow | null
): WeakSpot[] {
  // Operate on a date-asc copy so callers don't have to care about the
  // original order (analytics fetches asc, trainer fetches desc).
  const workouts = [...workoutsInput].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const now = new Date();
  const last7 = workouts.filter((w) => new Date(w.date) >= subDays(now, 7));
  const last14 = workouts.filter((w) => new Date(w.date) >= subDays(now, 14));

  const volumeIn = (list: WorkoutRow[]) =>
    list
      .filter((w) => shapeForType(w.type) === "STRENGTH")
      .flatMap((w) =>
        w.exercises
          .filter((e) => !isTimedExercise(e.exercise.name))
          .flatMap((e) => e.sets)
      )
      .filter((s) => s.type === "WORKING")
      .reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);

  const priorityMusclesHitIn = (list: WorkoutRow[]): Set<string> => {
    const hit = new Set<string>();
    for (const w of list) {
      if (shapeForType(w.type) !== "STRENGTH") continue;
      for (const we of w.exercises) {
        const hasWorkingSet = we.sets.some((s) => s.type === "WORKING");
        if (!hasWorkingSet) continue;
        const m = specificMuscleFor(we.exercise.name);
        if (isPriorityMuscle(m)) hit.add(m);
      }
    }
    return hit;
  };

  const thisWeekVolume = volumeIn(last7);
  const thisWeekPriorityMuscles = priorityMusclesHitIn(last7);

  const prior4Start = subDays(now, 35);
  const prior4End = subDays(now, 7);
  const prior4Workouts = workouts.filter(
    (w) =>
      new Date(w.date) >= prior4Start && new Date(w.date) < prior4End
  );
  const avgWeeklyVolumePrior4 = volumeIn(prior4Workouts) / 4;

  const spots: WeakSpot[] = [];

  // Missed priority muscles
  if (last14.length > 0) {
    const missed = PRIORITY_MUSCLES.filter(
      (m) => !thisWeekPriorityMuscles.has(m)
    );
    if (missed.length > 0) {
      const sample = missed.slice(0, 5).join(", ");
      const tail = missed.length > 5 ? `, +${missed.length - 5} more` : "";
      spots.push({
        id: "missed-priority-muscles",
        kind: "missed-muscles",
        severity: missed.length >= 5 ? "high" : "medium",
        title: `${missed.length} priority muscle${missed.length === 1 ? "" : "s"} missed this week`,
        detail: `No working sets for: ${sample}${tail}.`,
        items: missed,
      });
    }
  }

  // Plateaus & rep stalls
  const strengthWorkouts = workouts.filter(
    (w) => shapeForType(w.type) === "STRENGTH"
  );
  const exerciseHistory: Record<
    string,
    { name: string; topWeights: number[]; topReps: number[] }
  > = {};
  for (const w of strengthWorkouts) {
    for (const ex of w.exercises) {
      const ws = ex.sets.filter((s) => s.type === "WORKING");
      if (ws.length === 0) continue;
      const topWeight = Math.max(...ws.map((s) => s.weight ?? 0));
      const topReps = ws
        .filter((s) => (s.weight ?? 0) === topWeight)
        .reduce((m, s) => Math.max(m, s.reps ?? 0), 0);
      if (!exerciseHistory[ex.exerciseId]) {
        exerciseHistory[ex.exerciseId] = {
          name: ex.exercise.name,
          topWeights: [],
          topReps: [],
        };
      }
      exerciseHistory[ex.exerciseId].topWeights.push(topWeight);
      exerciseHistory[ex.exerciseId].topReps.push(topReps);
    }
  }
  for (const data of Object.values(exerciseHistory)) {
    const recentWeights = data.topWeights.slice(-3);
    const recentReps = data.topReps.slice(-3);
    if (recentWeights.length < 3) continue;
    const maxW = Math.max(...recentWeights);
    if (maxW > 0) {
      if (maxW - Math.min(...recentWeights) < 0.01) {
        spots.push({
          id: `plateau-${data.name}`,
          kind: "plateau",
          subject: data.name,
          severity: "medium",
          title: `${data.name} has plateaued`,
          detail: `Last 3 sessions stuck at ${recentWeights[0]}lb. Time to push or swap rep range.`,
        });
      }
    } else if (
      recentReps[0] > 0 &&
      Math.max(...recentReps) - Math.min(...recentReps) < 1
    ) {
      spots.push({
        id: `rep-stall-${data.name}`,
        kind: "rep-stall",
        subject: data.name,
        severity: "medium",
        title: `${data.name} reps have stalled`,
        detail: `Last 3 sessions stuck at ${recentReps[0]} reps. Add a rep, slow the tempo, or load the lift.`,
      });
    }
  }

  // Frequency gap
  if (user?.trainingDays && last7.length < user.trainingDays) {
    spots.push({
      id: "freq-gap",
      kind: "freq-gap",
      severity:
        user.trainingDays - last7.length >= 2 ? "high" : "medium",
      title: `Under your weekly target`,
      detail: `${last7.length} of ${user.trainingDays} sessions this week. ${user.trainingDays - last7.length} more to stay on pace.`,
    });
  }

  // Volume drop
  const fmtVol = (v: number) =>
    v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
  if (
    avgWeeklyVolumePrior4 >= 1000 &&
    thisWeekVolume < avgWeeklyVolumePrior4 * 0.75
  ) {
    const dropPct = Math.round(
      (1 - thisWeekVolume / avgWeeklyVolumePrior4) * 100
    );
    spots.push({
      id: "volume-drop",
      kind: "volume-drop",
      severity: dropPct >= 40 ? "high" : "medium",
      title: `Volume down ${dropPct}% vs 4-wk avg`,
      detail: `${fmtVol(thisWeekVolume)} kg this week vs ${fmtVol(avgWeeklyVolumePrior4)} kg average. Add a set or push the weight up next session.`,
    });
  }

  // Overtraining — trailing streak ending today >=5
  if (workouts.length >= 5) {
    const recentDates = [
      ...new Set(
        workouts.slice(-10).map((w) => format(new Date(w.date), "yyyy-MM-dd"))
      ),
    ].sort();
    let trailingStreak = 1;
    for (let i = recentDates.length - 1; i > 0; i--) {
      const diff = differenceInDays(
        new Date(recentDates[i]),
        new Date(recentDates[i - 1])
      );
      if (diff === 1) trailingStreak++;
      else break;
    }
    const lastDate = recentDates[recentDates.length - 1];
    const daysSinceLast = differenceInDays(now, new Date(lastDate));
    if (daysSinceLast === 0 && trailingStreak >= 5) {
      spots.push({
        id: "overtraining",
        kind: "overtraining",
        severity: "medium",
        title: `${trailingStreak} consecutive training days`,
        detail: `Consider a recovery day. Fatigue compounds — a rest day often unlocks next week's PRs.`,
      });
    }
  }

  return spots;
}

// One-line summary per spot for compact contexts (e.g. injecting into
// the coach's system prompt). Severity tag at the front so the model
// can weight high-severity items first.
export function formatWeakSpotsForPrompt(spots: WeakSpot[]): string {
  if (spots.length === 0) return "No weak spots flagged this week.";
  return spots
    .map((s) => `- [${s.severity}] ${s.title} — ${s.detail}`)
    .join("\n");
}
