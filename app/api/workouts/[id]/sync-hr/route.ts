import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listHeartRateBetween } from "@/lib/googleHealth";

function toUtcISO(d: Date): string {
  return d.toISOString();
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const userId = await requireAuth();
  const { id } = await ctx.params;

  const workout = await prisma.workout.findUnique({
    where: { id },
    select: { id: true, userId: true, startedAt: true, endedAt: true },
  });
  if (!workout || workout.userId !== userId) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  if (!workout.startedAt) {
    return Response.json({ error: "workout has no startedAt" }, { status: 400 });
  }

  const account = await prisma.healthAccount.findUnique({ where: { userId } });
  if (!account) {
    return Response.json({ connected: false, synced: 0 });
  }

  const start = workout.startedAt;
  // If user hits "sync" mid-workout (no endedAt yet), use "now" as the window end
  const end = workout.endedAt ?? new Date();

  let samples;
  try {
    samples = await listHeartRateBetween(userId, toUtcISO(start), toUtcISO(end));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Missing scope → token lacks heart_rate.readonly; user must reconnect.
    if (msg.includes("403") || msg.toLowerCase().includes("permission")) {
      return Response.json(
        {
          error:
            "Heart-rate scope not granted. Disconnect and reconnect Fitbit on the Health page.",
          needsReconnect: true,
        },
        { status: 403 },
      );
    }
    return Response.json({ error: msg }, { status: 502 });
  }

  // Replace any existing samples for this workout — re-syncs idempotent
  await prisma.$transaction(async (tx) => {
    await tx.workoutHeartRateSample.deleteMany({ where: { workoutId: id } });
    if (samples.length > 0) {
      await tx.workoutHeartRateSample.createMany({
        data: samples.map((s) => ({ workoutId: id, timestamp: s.timestamp, bpm: s.bpm })),
      });
    }
    const avg =
      samples.length > 0
        ? Math.round(samples.reduce((s, x) => s + x.bpm, 0) / samples.length)
        : null;
    const max = samples.length > 0 ? Math.max(...samples.map((s) => s.bpm)) : null;
    await tx.workout.update({
      where: { id },
      data: { avgHeartRate: avg, maxHeartRate: max },
    });
  });

  return Response.json({ synced: samples.length });
}
