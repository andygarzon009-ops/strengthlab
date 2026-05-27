import "server-only";
import { prisma } from "@/lib/db";
import { listExercise, type ExercisePoint } from "@/lib/googleHealth";

export type DetectedSession = {
  name: string;
  startTime: string;
  endTime: string;
  displayName: string;
  exerciseType?: string;
  durationSec: number;
  calories?: number;
  steps?: number;
  avgHR?: number;
};

const FITBIT_TYPE_TO_WORKOUT_TYPE: Record<string, string> = {
  RUNNING: "RUNNING",
  RUN: "RUNNING",
  TREADMILL: "RUNNING",
  WALKING: "OTHER",
  CYCLING: "CYCLING",
  BIKING: "CYCLING",
  SWIMMING: "SWIMMING",
  ROWING: "ROWING",
  YOGA: "MOBILITY",
  HIIT: "HIIT",
  CIRCUIT_TRAINING: "HIIT",
  WORKOUT: "WEIGHT_TRAINING",
  WEIGHTLIFTING: "WEIGHT_TRAINING",
  STRENGTH_TRAINING: "WEIGHT_TRAINING",
};

export function fitbitTypeToWorkoutType(t: string | undefined): string {
  if (!t) return "OTHER";
  return FITBIT_TYPE_TO_WORKOUT_TYPE[t.toUpperCase()] ?? "OTHER";
}

function durationFromActiveDuration(s?: string): number {
  if (!s) return 0;
  const n = Number(s.replace("s", ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function toDetected(p: ExercisePoint): DetectedSession {
  const m = p.exercise.metricsSummary ?? {};
  return {
    name: p.name,
    startTime: p.exercise.interval.startTime,
    endTime: p.exercise.interval.endTime,
    displayName:
      p.exercise.displayName ?? p.exercise.exerciseType ?? "Activity",
    exerciseType: p.exercise.exerciseType,
    durationSec: durationFromActiveDuration(p.exercise.activeDuration),
    calories: m.caloriesKcal,
    steps: m.steps ? Number(m.steps) : undefined,
    avgHR: m.averageHeartRateBeatsPerMinute
      ? Number(m.averageHeartRateBeatsPerMinute)
      : undefined,
  };
}

/// Returns Fitbit exercise sessions in the last `days` days that don't yet
/// overlap any existing StrengthLab workout window for this user.
export async function listUnmatchedFitbitSessions(
  userId: string,
  days = 14,
): Promise<DetectedSession[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19);
  const points = await listExercise(userId, since);

  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      startedAt: { not: null, gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    },
    select: { startedAt: true, endedAt: true },
  });

  const overlaps = (start: Date, end: Date) =>
    workouts.some((w) => {
      if (!w.startedAt) return false;
      const wStart = w.startedAt.getTime();
      const wEnd = (w.endedAt ?? w.startedAt).getTime();
      return start.getTime() <= wEnd && end.getTime() >= wStart;
    });

  return points
    .map(toDetected)
    .filter((s) => {
      const start = new Date(s.startTime);
      const end = new Date(s.endTime);
      return !overlaps(start, end);
    })
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
}
