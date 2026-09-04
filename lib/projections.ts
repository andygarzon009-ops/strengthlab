import { e1rm } from "./strengthProgression";
import { isMachineExercise } from "./exercises";
import { normalizeExerciseName } from "./exerciseIdentity";

/// One point on a lift's strength trend: the best working-set est. 1RM of a
/// single session.
export type TrendPoint = { at: string; e1rm: number };

export type Projection = {
  /// Id of the variant that carries the most sessions, so the row can link to
  /// the drilldown (which filters by a single exerciseId).
  exerciseId: string;
  exerciseName: string;
  baseWeight: number;
  baseReps: number;
  oneRepMax: number;
  /// Session-by-session est. 1RM, chronological. One point per session.
  trend: TrendPoint[];
};

type WorkoutLike = {
  date: Date;
  startedAt?: Date | null;
  endedAt?: Date | null;
  exercises: {
    exercise: { id: string; name: string };
    sets: { type: string; weight: number | null; reps: number | null }[];
  }[];
};

/// Best straight WORKING set per lift where reps ≤ 10 (Epley gets unreliable
/// above that), plus that lift's session-by-session est. 1RM so each row can
/// show where the strength is heading, not just its ceiling. Machine lifts are
/// excluded and near-duplicate names collapse into one row.
export function buildProjections(workouts: WorkoutLike[]): Projection[] {
  type Acc = {
    exerciseName: string;
    weight: number;
    reps: number;
    oneRM: number;
    /// Session count per variant id — the most-used one wins the link.
    idCounts: Map<string, number>;
    trend: TrendPoint[];
  };
  const byLift = new Map<string, Acc>();

  for (const w of workouts) {
    const at = (w.endedAt ?? w.startedAt ?? w.date).toISOString();
    // Best working set of this session, per lift.
    const sessionBest = new Map<
      string,
      { id: string; name: string; e: number; weight: number; reps: number }
    >();

    for (const ex of w.exercises) {
      if (isMachineExercise(ex.exercise.name)) continue;
      const key = normalizeExerciseName(ex.exercise.name) || ex.exercise.id;
      for (const s of ex.sets) {
        if (s.type !== "WORKING") continue;
        const weight = s.weight ?? 0;
        const reps = s.reps ?? 0;
        if (weight <= 0 || reps <= 0 || reps > 10) continue;
        const proj = e1rm(weight, reps);
        const prev = sessionBest.get(key);
        if (!prev || proj > prev.e) {
          sessionBest.set(key, {
            id: ex.exercise.id,
            name: ex.exercise.name,
            e: proj,
            weight,
            reps,
          });
        }
      }
    }

    for (const [key, best] of sessionBest) {
      let acc = byLift.get(key);
      if (!acc) {
        acc = {
          exerciseName: best.name,
          weight: best.weight,
          reps: best.reps,
          oneRM: best.e,
          idCounts: new Map(),
          trend: [],
        };
        byLift.set(key, acc);
      }
      if (best.e > acc.oneRM) {
        acc.oneRM = best.e;
        acc.weight = best.weight;
        acc.reps = best.reps;
        acc.exerciseName = best.name;
      }
      acc.idCounts.set(best.id, (acc.idCounts.get(best.id) ?? 0) + 1);
      acc.trend.push({ at, e1rm: Math.round(best.e * 10) / 10 });
    }
  }

  return [...byLift.values()]
    .map((a) => {
      let exerciseId = "";
      let top = 0;
      for (const [id, n] of a.idCounts) {
        if (n > top) {
          top = n;
          exerciseId = id;
        }
      }
      return {
        exerciseId,
        exerciseName: a.exerciseName,
        baseWeight: a.weight,
        baseReps: a.reps,
        oneRepMax: a.oneRM,
        trend: a.trend.sort((x, y) => x.at.localeCompare(y.at)),
      };
    })
    .sort((a, b) => b.oneRepMax - a.oneRepMax);
}
