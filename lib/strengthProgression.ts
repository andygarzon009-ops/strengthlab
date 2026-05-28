import { shapeForType, isTimedExercise } from "@/lib/exercises";

/// Epley formula. Works across rep ranges so a heavy triple and a moderate
/// set of eight project onto the same axis. Caps reps at 12 — anything past
/// that is more an endurance set than a strength projection.
export function e1rm(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  const r = Math.min(reps, 12);
  return weight * (1 + r / 30);
}

type WorkingSet = { weight: number | null; reps: number | null; type: string };

type WorkoutLike = {
  date: Date;
  endedAt: Date | null;
  startedAt: Date | null;
  type: string;
  exercises: {
    exercise: { id?: string; name: string };
    sets: WorkingSet[];
  }[];
};

export type LiftTrend = {
  exerciseId: string;
  name: string;
  sessions: number; // total sessions hit in the lookback window
  currentE1rm: number; // most recent session's top e1rm
  currentWeight: number; // weight × reps the current e1rm came from
  currentReps: number;
  baselineE1rm: number | null; // 4-week prior average e1rm
  deltaLb: number | null; // current − baseline
  direction: "up" | "flat" | "down" | null;
  lastSessionAt: Date;
};

const FLAT_THRESHOLD_LB = 2;

/// Pick the user's most-trained strength lifts in the lookback window and
/// project an e1RM trend per lift. "Current" is the most recent session's top
/// e1rm; "baseline" is the average over the 4 weeks before the current week.
export function computeTopLiftTrends(
  workouts: WorkoutLike[],
  options: { topN?: number; minSessions?: number } = {},
): LiftTrend[] {
  const topN = options.topN ?? 5;
  const minSessions = options.minSessions ?? 2;

  // Keyed by exerciseId; tracks name and per-session top e1rm.
  type SessionPoint = {
    at: Date;
    e1: number;
    weight: number;
    reps: number;
  };
  const byLift = new Map<string, { name: string; points: SessionPoint[] }>();

  for (const w of workouts) {
    if (shapeForType(w.type) !== "STRENGTH") continue;
    const at = w.endedAt ?? w.startedAt ?? w.date;
    for (const e of w.exercises) {
      const name = e.exercise.name;
      const id = e.exercise.id ?? name;
      if (isTimedExercise(name)) continue;
      let topE1 = 0;
      let topWeight = 0;
      let topReps = 0;
      for (const s of e.sets) {
        if (s.type === "WARMUP") continue;
        const weight = s.weight ?? 0;
        const reps = s.reps ?? 0;
        if (weight <= 0 || reps <= 0) continue;
        const projected = e1rm(weight, reps);
        if (projected > topE1) {
          topE1 = projected;
          topWeight = weight;
          topReps = reps;
        }
      }
      if (topE1 <= 0) continue;
      const entry = byLift.get(id) ?? { name, points: [] };
      entry.points.push({ at, e1: topE1, weight: topWeight, reps: topReps });
      byLift.set(id, entry);
    }
  }

  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  // Cut "this week" off the baseline so a heavy Monday doesn't get averaged
  // with itself and read as "flat."
  const thisWeekStartMs = now - weekMs;
  const baselineStartMs = now - 5 * weekMs; // 4 weeks back from start of this week

  const trends: LiftTrend[] = [];
  for (const [exerciseId, { name, points }] of byLift) {
    if (points.length < minSessions) continue;
    points.sort((a, b) => a.at.getTime() - b.at.getTime());
    const latest = points[points.length - 1];

    const baselinePoints = points.filter(
      (p) =>
        p.at.getTime() >= baselineStartMs &&
        p.at.getTime() < thisWeekStartMs,
    );
    const baselineE1rm =
      baselinePoints.length > 0
        ? baselinePoints.reduce((s, p) => s + p.e1, 0) /
          baselinePoints.length
        : null;
    const deltaLb =
      baselineE1rm !== null ? latest.e1 - baselineE1rm : null;
    let direction: LiftTrend["direction"] = null;
    if (deltaLb !== null) {
      if (deltaLb > FLAT_THRESHOLD_LB) direction = "up";
      else if (deltaLb < -FLAT_THRESHOLD_LB) direction = "down";
      else direction = "flat";
    }
    trends.push({
      exerciseId,
      name,
      sessions: points.length,
      currentE1rm: latest.e1,
      currentWeight: latest.weight,
      currentReps: latest.reps,
      baselineE1rm,
      deltaLb,
      direction,
      lastSessionAt: latest.at,
    });
  }

  // Rank by session frequency (most-trained first), tiebreak by most-recent
  // activity so an exercise the athlete has stopped doing slides down.
  trends.sort((a, b) => {
    if (b.sessions !== a.sessions) return b.sessions - a.sessions;
    return b.lastSessionAt.getTime() - a.lastSessionAt.getTime();
  });
  return trends.slice(0, topN);
}
