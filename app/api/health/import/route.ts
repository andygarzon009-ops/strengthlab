import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listHeartRateBetween } from "@/lib/googleHealth";
import { fitbitTypeToWorkoutType } from "@/lib/fitbitDetect";
import { labelForType } from "@/lib/exercises";

function toCivilISO(d: Date): string {
  return d.toISOString().slice(0, 19);
}

type Body = {
  externalId?: string;
  startTime: string;
  endTime: string;
  displayName: string;
  exerciseType?: string;
  durationSec?: number;
  calories?: number;
  avgHR?: number;
};

/// Creates a Workout from a detected Fitbit session and immediately syncs
/// per-second HR samples for its window. Idempotency is best-effort: callers
/// should only POST after `/api/health/detect` has filtered out overlaps.
export async function POST(req: Request) {
  const userId = await requireAuth();
  const body = (await req.json()) as Body;

  if (!body.startTime || !body.endTime) {
    return Response.json({ error: "missing window" }, { status: 400 });
  }

  const start = new Date(body.startTime);
  const end = new Date(body.endTime);
  const type = fitbitTypeToWorkoutType(body.exerciseType);
  const title = body.displayName || labelForType(type);

  const account = await prisma.healthAccount.findUnique({ where: { userId } });
  let samples: { timestamp: Date; bpm: number }[] = [];
  if (account) {
    try {
      samples = await listHeartRateBetween(userId, toCivilISO(start), toCivilISO(end));
    } catch {
      // Fall through — still create the workout; HR can be synced later.
    }
  }

  const avg =
    samples.length > 0
      ? Math.round(samples.reduce((s, x) => s + x.bpm, 0) / samples.length)
      : body.avgHR ?? null;
  const max = samples.length > 0 ? Math.max(...samples.map((s) => s.bpm)) : null;

  const workout = await prisma.workout.create({
    data: {
      userId,
      title,
      type,
      date: start,
      startedAt: start,
      endedAt: end,
      duration: body.durationSec ?? Math.round((end.getTime() - start.getTime()) / 1000),
      calories: body.calories ?? null,
      avgHeartRate: avg,
      maxHeartRate: max,
      notes: "Imported from Fitbit",
      heartRateSamples: {
        create: samples.map((s) => ({ timestamp: s.timestamp, bpm: s.bpm })),
      },
    },
    select: { id: true },
  });

  // Mark the cached Fitbit session as imported so it stops appearing in the
  // detected list without needing a fresh round-trip to Google.
  if (body.externalId) {
    await prisma.fitbitExerciseSession.updateMany({
      where: { userId, externalId: body.externalId },
      data: { importedWorkoutId: workout.id },
    });
  }

  return Response.json({ workoutId: workout.id, hrSamples: samples.length });
}
