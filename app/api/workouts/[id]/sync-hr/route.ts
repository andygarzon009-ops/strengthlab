import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listHeartRateBetween } from "@/lib/googleHealth";
import {
  getCachedSessions,
  fitbitTypeToWorkoutType,
  type DetectedSession,
} from "@/lib/fitbitDetect";

function toUtcISO(d: Date): string {
  return d.toISOString();
}

/// Heart-rate-based energy expenditure (Keytel et al. 2005) — the standard
/// formula wearables fall back to when a workout has no device-reported
/// calories. Uses the MET-scaled estimate when sex/age are unknown, and
/// returns null when we don't even have bodyweight. Whole kcal.
function estimateCalories(opts: {
  avgHr: number;
  durationSec: number;
  bodyweightLb: number | null;
  sex: string | null;
  birthDate: Date | null;
}): number | null {
  const { avgHr, durationSec } = opts;
  if (durationSec <= 0 || avgHr <= 0) return null;
  const minutes = durationSec / 60;
  if (opts.bodyweightLb == null || opts.bodyweightLb <= 0) return null;
  const weightKg = opts.bodyweightLb * 0.453592;

  const age =
    opts.birthDate != null
      ? Math.floor(
          (Date.now() - opts.birthDate.getTime()) /
            (365.25 * 24 * 60 * 60 * 1000),
        )
      : null;

  // Keytel needs age + sex; use it when both are present.
  if (age != null && age > 0 && opts.sex) {
    const female = opts.sex.trim().toLowerCase().startsWith("f");
    const perMin = female
      ? (-20.4022 + 0.4472 * avgHr - 0.1263 * weightKg + 0.074 * age) / 4.184
      : (-55.0969 + 0.6309 * avgHr + 0.1988 * weightKg + 0.2017 * age) / 4.184;
    const total = perMin * minutes;
    if (total > 0) return Math.round(total);
  }

  // Fallback: MET-based. Avg HR scales intensity from ~3 MET (light) to
  // ~8 MET (vigorous) across a 90-160 bpm band. kcal = MET * kg * hours.
  const met = Math.max(3, Math.min(8, 3 + ((avgHr - 90) / 70) * 5));
  const total = met * weightKg * (minutes / 60);
  return total > 0 ? Math.round(total) : null;
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
      type: true,
      title: true,
      calories: true,
      steps: true,
      activeZoneMin: true,
      distance: true,
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
  //   1. A Google Health exercise session on the same local-tz date as the
  //      workout — most authoritative, and corrects bad startedAt values
  //      that prior syncs may have backfilled from a fuzzy fallback.
  //   2. startedAt/endedAt from the live logger
  //   3. date + duration (manual logging without the timer)
  //   4. date ± 30min fuzzy fallback
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true, bodyweight: true, sex: true, birthDate: true },
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

  let matched: DetectedSession | null = null;
  try {
    const { sessions } = await getCachedSessions(userId, { days: 30 });
    const sameDay = sessions.filter(
      (s) => dayKey(new Date(s.startTime)) === targetDay,
    );
    if (sameDay.length > 0) {
      // Filter by type first — same-day workouts of different kinds (e.g.
      // a morning lift and an afternoon round of golf) need to map to the
      // right Fitbit session. Match by mapped workout type OR by the
      // workout title containing the session's displayName.
      const titleLower = workout.title.toLowerCase();
      const typeMatches = sameDay.filter((s) => {
        const mapped = fitbitTypeToWorkoutType(s.exerciseType);
        if (mapped === workout.type) return true;
        const name = s.displayName.toLowerCase();
        return (
          titleLower.includes(name) || name.includes(titleLower)
        );
      });
      const pool = typeMatches.length > 0 ? typeMatches : sameDay;
      if (workout.duration && workout.duration > 0) {
        pool.sort(
          (a, b) =>
            Math.abs(a.durationSec - workout.duration!) -
            Math.abs(b.durationSec - workout.duration!),
        );
      } else {
        pool.sort((a, b) => b.durationSec - a.durationSec);
      }
      matched = pool[0];
    }
  } catch {
    // Fall through to fallback windows.
  }

  let start: Date;
  let end: Date;
  let windowSource: string;
  if (matched) {
    start = new Date(matched.startTime);
    end = new Date(matched.endTime);
    windowSource = "matched-session";
  } else if (workout.startedAt) {
    start = workout.startedAt;
    end = workout.endedAt ?? new Date();
    windowSource = "logger";
  } else if (workout.duration && workout.duration > 0) {
    start = workout.date;
    end = new Date(workout.date.getTime() + workout.duration * 1000);
    windowSource = "date+duration";
  } else {
    start = new Date(workout.date.getTime() - 30 * 60 * 1000);
    end = new Date(workout.date.getTime() + 30 * 60 * 1000);
    windowSource = "fuzzy";
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
    // Fill activity metrics so the workout shows in the Activity rings and
    // weekly recap. Prefer a matched Fitbit exercise session; otherwise
    // derive them from the HR data itself — strength sessions are usually
    // just "watch worn," with no Fitbit-detected exercise to copy from.
    // Never overwrite a value the athlete entered manually.
    const metricUpdates: Record<string, number> = {};

    // Duration: matched session > actual HR sample span > derived window.
    if (workout.duration == null || workout.duration === 0) {
      if (matched && matched.durationSec > 0) {
        metricUpdates.duration = matched.durationSec;
      } else if (samples.length >= 2) {
        const spanSec = Math.round(
          (samples[samples.length - 1].timestamp.getTime() -
            samples[0].timestamp.getTime()) /
            1000,
        );
        if (spanSec > 0) metricUpdates.duration = spanSec;
      } else if (windowSource !== "fuzzy") {
        const spanSec = Math.round((end.getTime() - start.getTime()) / 1000);
        if (spanSec > 0) metricUpdates.duration = spanSec;
      }
    }

    // Steps / zone minutes / distance only exist on a real Fitbit session.
    if (matched) {
      if (matched.steps != null && workout.steps == null) {
        metricUpdates.steps = matched.steps;
      }
      if (matched.activeZoneMin != null && workout.activeZoneMin == null) {
        metricUpdates.activeZoneMin = matched.activeZoneMin;
      }
      if (matched.distanceMm != null && workout.distance == null) {
        // Workout.distance is stored in kilometers; Fitbit reports mm.
        metricUpdates.distance = matched.distanceMm / 1_000_000;
      }
    }

    // Calories: matched session value, else an HR-based estimate so the
    // Move ring isn't stuck at 0 for strength sessions Fitbit doesn't
    // auto-detect as an exercise.
    if (workout.calories == null) {
      if (matched && matched.calories != null) {
        metricUpdates.calories = matched.calories;
      } else if (avg != null) {
        const est = estimateCalories({
          avgHr: avg,
          durationSec: metricUpdates.duration ?? workout.duration ?? 0,
          bodyweightLb: user?.bodyweight ?? null,
          sex: user?.sex ?? null,
          birthDate: user?.birthDate ?? null,
        });
        if (est != null && est > 0) metricUpdates.calories = est;
      }
    }
    await tx.workout.update({
      where: { id },
      data: {
        avgHeartRate: avg,
        maxHeartRate: max,
        ...metricUpdates,
        // Persist the derived window. Always overwrite when we used a
        // matched Google Health session (truth source); otherwise only
        // fill in when startedAt is missing so we don't clobber precise
        // timer values from a live-logged session.
        ...(windowSource === "matched-session" || !workout.startedAt
          ? { startedAt: start, endedAt: end }
          : {}),
      },
    });
  });

  // The sync just changed this workout's HR/calories/duration, which feed
  // the weekly recap (home) and the Activity rings. Bust their caches so
  // they reflect the new numbers on the next visit without a hard reload.
  revalidatePath("/");
  revalidatePath("/activity");
  revalidatePath(`/workout/${id}`);

  return Response.json({ synced: samples.length, windowSource });
}
