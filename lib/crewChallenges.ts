import { shapeForType, isMachineExercise } from "@/lib/exercises";
import { e1rm } from "@/lib/strengthProgression";
import { normalizeExerciseName } from "@/lib/exerciseIdentity";

export type ChallengeType = "VOLUME" | "SESSIONS" | "LIFT_RACE" | "STREAK";

export const CHALLENGE_TYPES: {
  value: ChallengeType;
  label: string;
  blurb: string;
  unit: string;
}[] = [
  { value: "VOLUME", label: "Volume race", blurb: "Most total lb lifted", unit: "lb" },
  { value: "SESSIONS", label: "Session count", blurb: "Most workouts logged", unit: "sessions" },
  { value: "LIFT_RACE", label: "Lift race", blurb: "Highest est. 1RM on a lift", unit: "lb" },
  { value: "STREAK", label: "Streak battle", blurb: "Longest current daily streak", unit: "days" },
];

export function challengeTypeLabel(type: string): string {
  return CHALLENGE_TYPES.find((t) => t.value === type)?.label ?? type;
}
export function challengeUnit(type: string): string {
  return CHALLENGE_TYPES.find((t) => t.value === type)?.unit ?? "";
}

/// Score formatted with its unit, e.g. "12.4k lb", "5 sessions", "9 days".
export function formatScore(type: string, score: number): string {
  if (type === "VOLUME" || type === "LIFT_RACE") {
    const v = score >= 1000 ? `${(score / 1000).toFixed(1)}k` : String(score);
    return `${v} lb`;
  }
  if (type === "SESSIONS") return `${score} session${score === 1 ? "" : "s"}`;
  if (type === "STREAK") return `${score} day${score === 1 ? "" : "s"}`;
  return String(score);
}

export function timeLeft(endsAt: Date | null): string {
  if (!endsAt) return "open-ended";
  const ms = endsAt.getTime() - Date.now();
  if (ms <= 0) return "ended";
  const days = Math.ceil(ms / 86_400_000);
  return days === 1 ? "1 day left" : `${days} days left`;
}

/// Minimal workout shape the scorer needs — callers fetch this with the
/// window already applied for VOLUME/SESSIONS/LIFT_RACE. STREAK looks at all
/// of a member's dates (passed separately) so it reflects a true daily run.
export type ScoringWorkout = {
  userId: string;
  type: string;
  date: Date;
  exercises: {
    exercise: { name: string };
    sets: { type: string; weight: number | null; reps: number | null }[];
  }[];
};

export type Standing = {
  userId: string;
  name: string;
  isYou: boolean;
  score: number; // primary metric (lb / sessions / e1RM / days)
  reachedTarget: boolean; // LIFT_RACE only
};

function isWorkingSet(t: string): boolean {
  return t === "WORKING" || t === "SUPERSET" || t === "DROP_SET";
}

/// Current consecutive-day streak ending today or yesterday, from a set of
/// ISO day-strings.
export function streakFromDays(dayKeys: string[]): number {
  if (dayKeys.length === 0) return 0;
  const days = [...new Set(dayKeys)].sort();
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const last = days[days.length - 1];
  if (last !== today && last !== yest) return 0;
  let s = 1;
  for (let i = days.length - 2; i >= 0; i--) {
    const diff =
      (new Date(days[i + 1]).getTime() - new Date(days[i]).getTime()) /
      86_400_000;
    if (Math.round(diff) === 1) s++;
    else break;
  }
  return s;
}

/// Compute and rank standings for a challenge. `streakDaysByUser` is only
/// consulted for STREAK challenges.
export function computeStandings(opts: {
  type: ChallengeType;
  exerciseId?: string | null;
  targetValue?: number | null;
  members: { userId: string; name: string }[];
  viewerId: string;
  windowWorkouts: ScoringWorkout[];
  streakDaysByUser?: Map<string, number>;
}): Standing[] {
  const { type, members, viewerId, windowWorkouts } = opts;
  const byUser = new Map<string, ScoringWorkout[]>();
  for (const m of members) byUser.set(m.userId, []);
  for (const w of windowWorkouts) byUser.get(w.userId)?.push(w);

  const standings: Standing[] = members.map((m) => {
    const ws = byUser.get(m.userId) ?? [];
    let score = 0;
    let reachedTarget = false;

    if (type === "SESSIONS") {
      score = ws.length;
    } else if (type === "VOLUME") {
      for (const w of ws) {
        if (shapeForType(w.type) !== "STRENGTH") continue;
        for (const ex of w.exercises) {
          for (const s of ex.sets) {
            if (!isWorkingSet(s.type)) continue;
            score += (s.weight ?? 0) * (s.reps ?? 0);
          }
        }
      }
      score = Math.round(score);
    } else if (type === "LIFT_RACE") {
      let best = 0;
      for (const w of ws) {
        for (const ex of w.exercises) {
          if (isMachineExercise(ex.exercise.name)) continue;
          for (const s of ex.sets) {
            if (!isWorkingSet(s.type)) continue;
            const proj = e1rm(s.weight ?? 0, s.reps ?? 0);
            if (proj > best) best = proj;
            if (opts.targetValue && (s.weight ?? 0) >= opts.targetValue) {
              reachedTarget = true;
            }
          }
        }
      }
      score = Math.round(best);
    } else if (type === "STREAK") {
      score = opts.streakDaysByUser?.get(m.userId) ?? 0;
    }

    return {
      userId: m.userId,
      name: m.userId === viewerId ? "You" : m.name,
      isYou: m.userId === viewerId,
      score,
      reachedTarget,
    };
  });

  standings.sort((a, b) => b.score - a.score);
  return standings;
}

/// For LIFT_RACE we only want sets of the chosen lift. Filters a member's
/// workouts down to exercises matching the target exercise's normalized name.
export function filterToLift(
  workouts: ScoringWorkout[],
  liftName: string,
): ScoringWorkout[] {
  const key = normalizeExerciseName(liftName);
  return workouts
    .map((w) => ({
      ...w,
      exercises: w.exercises.filter(
        (ex) => normalizeExerciseName(ex.exercise.name) === key,
      ),
    }))
    .filter((w) => w.exercises.length > 0);
}
