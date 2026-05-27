import "server-only";
import { prisma } from "@/lib/db";
import { listExercise, type ExercisePoint } from "@/lib/googleHealth";

export type DetectedSession = {
  externalId: string;
  startTime: string;
  endTime: string;
  displayName: string;
  exerciseType?: string;
  durationSec: number;
  calories?: number;
  steps?: number;
  avgHR?: number;
  importedWorkoutId?: string | null;
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

function parsePoint(p: ExercisePoint): Omit<DetectedSession, "importedWorkoutId"> {
  const m = p.exercise.metricsSummary ?? {};
  return {
    externalId: p.name,
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

const STALE_MS = 60 * 60 * 1000; // 1 hour

/// Refreshes the Fitbit session cache by pulling the last `days` of data from
/// Google Health and upserting rows. Updates HealthAccount.lastSyncedAt.
/// Returns the number of sessions upserted.
export async function refreshFitbitCache(userId: string, days = 14): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19);
  const points = await listExercise(userId, since);

  for (const p of points) {
    const parsed = parsePoint(p);
    await prisma.fitbitExerciseSession.upsert({
      where: {
        userId_externalId: { userId, externalId: parsed.externalId },
      },
      create: {
        userId,
        externalId: parsed.externalId,
        startTime: new Date(parsed.startTime),
        endTime: new Date(parsed.endTime),
        displayName: parsed.displayName,
        exerciseType: parsed.exerciseType,
        durationSec: parsed.durationSec,
        calories: parsed.calories,
        steps: parsed.steps,
        avgHR: parsed.avgHR,
      },
      update: {
        startTime: new Date(parsed.startTime),
        endTime: new Date(parsed.endTime),
        displayName: parsed.displayName,
        exerciseType: parsed.exerciseType,
        durationSec: parsed.durationSec,
        calories: parsed.calories,
        steps: parsed.steps,
        avgHR: parsed.avgHR,
        fetchedAt: new Date(),
      },
    });
  }

  await prisma.healthAccount.update({
    where: { userId },
    data: { lastSyncedAt: new Date() },
  });

  return points.length;
}

/// Reads cached sessions, optionally refreshing first if stale or forced.
export async function getCachedSessions(
  userId: string,
  opts: { forceRefresh?: boolean; days?: number } = {},
): Promise<{ sessions: DetectedSession[]; lastSyncedAt: Date | null; refreshed: boolean }> {
  const days = opts.days ?? 14;
  const account = await prisma.healthAccount.findUnique({
    where: { userId },
    select: { lastSyncedAt: true },
  });

  const stale =
    !account?.lastSyncedAt ||
    Date.now() - account.lastSyncedAt.getTime() > STALE_MS;

  let refreshed = false;
  if (account && (opts.forceRefresh || stale)) {
    try {
      await refreshFitbitCache(userId, days);
      refreshed = true;
    } catch {
      // Fall back to whatever's in cache.
    }
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.fitbitExerciseSession.findMany({
    where: { userId, startTime: { gte: cutoff } },
    orderBy: { startTime: "desc" },
  });

  const sessions: DetectedSession[] = rows.map((r) => ({
    externalId: r.externalId,
    startTime: r.startTime.toISOString(),
    endTime: r.endTime.toISOString(),
    displayName: r.displayName,
    exerciseType: r.exerciseType ?? undefined,
    durationSec: r.durationSec,
    calories: r.calories ?? undefined,
    steps: r.steps ?? undefined,
    avgHR: r.avgHR ?? undefined,
    importedWorkoutId: r.importedWorkoutId,
  }));

  const fresh = await prisma.healthAccount.findUnique({
    where: { userId },
    select: { lastSyncedAt: true },
  });

  return { sessions, lastSyncedAt: fresh?.lastSyncedAt ?? null, refreshed };
}

/// Filters cached sessions to those not yet imported AND not overlapping any
/// existing StrengthLab workout window — i.e. genuinely unlogged Fitbit sessions.
export async function listUnmatchedFitbitSessions(
  userId: string,
  opts: { forceRefresh?: boolean; days?: number } = {},
): Promise<{ sessions: DetectedSession[]; lastSyncedAt: Date | null }> {
  const { sessions, lastSyncedAt } = await getCachedSessions(userId, opts);

  const days = opts.days ?? 14;
  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      startedAt: {
        not: null,
        gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      },
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

  const unmatched = sessions.filter((s) => {
    if (s.importedWorkoutId) return false;
    return !overlaps(new Date(s.startTime), new Date(s.endTime));
  });

  return { sessions: unmatched, lastSyncedAt };
}
