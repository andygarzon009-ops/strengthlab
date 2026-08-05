import { isTimedExercise } from "@/lib/exercises";

/// One definition of training volume, so the number on a workout, in the
/// live header and in the weak-spot analysis can't drift apart.
///
/// Two rules do all the work, and both exist because the schema stores
/// different things in the same columns:
///
///   1. Warm-ups don't count. They're preparation, not work, and counting
///      them would let someone inflate a session by adding empty-bar sets.
///
///   2. Timed movements don't count AT ALL. A plank or a farmer carry stores
///      SECONDS in `reps`, so weight x reps on a 45-second carry with 100 lb
///      books 4,500 lb of volume that was never lifted. There's no honest way
///      to fold a hold into a tonnage figure, so it's left out rather than
///      guessed at.
///
/// Working, superset and drop sets all count. Supersets are lighter by design
/// and drop sets aren't max effort — which is why neither can set a PR — but
/// both are real work moved and belong in the total.

export type VolumeSet = {
  type: string;
  weight: number | null;
  reps: number | null;
};

export type VolumeExercise = {
  exercise: { name: string };
  sets: VolumeSet[];
};

/** Set types that represent work actually performed. */
export function countsTowardVolume(setType: string): boolean {
  return (
    setType === "WORKING" || setType === "SUPERSET" || setType === "DROP_SET"
  );
}

/** Volume for a single exercise, in pounds moved. */
export function exerciseVolume(ex: VolumeExercise): number {
  // A hold has no meaningful tonnage — see rule 2 above.
  if (isTimedExercise(ex.exercise.name)) return 0;
  return ex.sets.reduce((sum, s) => {
    if (!countsTowardVolume(s.type)) return sum;
    return sum + (s.weight ?? 0) * (s.reps ?? 0);
  }, 0);
}

/** Total volume across a session, in pounds moved. */
export function workoutVolume(exercises: VolumeExercise[]): number {
  return exercises.reduce((sum, ex) => sum + exerciseVolume(ex), 0);
}

/** Working/superset/drop set count, ignoring warm-ups. */
export function workingSetCount(exercises: VolumeExercise[]): number {
  return exercises.reduce(
    (n, ex) => n + ex.sets.filter((s) => countsTowardVolume(s.type)).length,
    0
  );
}

/** Compact display for a tonnage figure: 12,480 lb, or 12.5k once it's long. */
export function formatVolume(lb: number): string {
  if (lb >= 100000) return `${Math.round(lb / 1000).toLocaleString("en-US")}k`;
  return Math.round(lb).toLocaleString("en-US");
}

export type VolumeComparison = {
  current: number;
  previous: number;
  /** Signed difference in pounds. */
  delta: number;
  /** Signed percentage change, rounded. Null when the previous total was 0. */
  percent: number | null;
};

export function compareVolume(
  current: number,
  previous: number
): VolumeComparison {
  const delta = current - previous;
  return {
    current,
    previous,
    delta,
    // A previous session of zero volume (all holds, or bodyweight only) has
    // no percentage to speak of — showing infinity or 100% would be a lie.
    percent: previous > 0 ? Math.round((delta / previous) * 100) : null,
  };
}
