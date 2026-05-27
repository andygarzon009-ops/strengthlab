import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listHeartRateBetween } from "@/lib/googleHealth";
import { getCachedSessions } from "@/lib/fitbitDetect";

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
    select: {
      id: true,
      userId: true,
      startedAt: true,
      endedAt: true,
      date: true,
      duration: true,
    },
  });
  if (!workout || workout.userId !== userId) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const account = await prisma.healthAccount.findUnique({ where: { userId } });
  if (!account) {
    return Response.json({ connected: false, synced: 0 });
  }

  // Derive the sync window. Priority:
  //   1. startedAt/endedAt from the live logger (exact)
  //   2. A Google Health exercise session on the same local-tz date as the
  //      workout — handles backdated workouts where date is correct but no
  //      timing was captured. The session's start/end is the truth.
  //   3. date + duration (manual logging without the timer)
  //   4. date ± 30min fuzzy fallback
  let start: Date;
  let end: Date;
  let windowSource: string;
  if (workout.startedAt) {
    start = workout.startedAt;
    end = workout.endedAt ?? new Date();
    windowSource = "logger";
  } else {
    // Refresh the Fitbit/Health session cache and pick whichever recorded
    // session falls on the same calendar day (in the user's timezone) as
    // this workout. If multiple match, pick the one closest in duration.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const tz = user?.timezone ?? "UTC";
    const dayKey = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    const targetDay = dayKey(workout.date);

    let matched: { startTime: string; endTime: string; durationSec: number } | null = null;
    try {
      const { sessions } = await getCachedSessions(userId, { days: 30 });
      const sameDay = sessions.filter(
        (s) => dayKey(new Date(s.startTime)) === targetDay,
      );
      if (sameDay.length > 0) {
        if (workout.duration && workout.duration > 0) {
          sameDay.sort(
            (a, b) =>
              Math.abs(a.durationSec - workout.duration!) -
              Math.abs(b.durationSec - workout.duration!),
          );
        } else {
          sameDay.sort((a, b) => b.durationSec - a.durationSec);
        }
        matched = sameDay[0];
      }
    } catch {
      // Fall through to fallback windows.
    }

    if (matched) {
      start = new Date(matched.startTime);
      end = new Date(matched.endTime);
      windowSource = "matched-session";
    } else if (workout.duration && workout.duration > 0) {
      start = workout.date;
      end = new Date(workout.date.getTime() + workout.duration * 1000);
      windowSource = "date+duration";
    } else {
      start = new Date(workout.date.getTime() - 30 * 60 * 1000);
      end = new Date(workout.date.getTime() + 30 * 60 * 1000);
      windowSource = "fuzzy";
    }
  }

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
      data: {
        avgHeartRate: avg,
        maxHeartRate: max,
        // Persist the derived window so repeat syncs and the chart use the
        // exact same range — only when not already set, to preserve any
        // precise timer values from a live-logged session.
        ...(workout.startedAt ? {} : { startedAt: start, endedAt: end }),
      },
    });
  });

  return Response.json({ synced: samples.length, windowSource });
}
