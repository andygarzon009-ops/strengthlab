import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  HealthReauthRequiredError,
  listHeartRateBetween,
} from "@/lib/googleHealth";
import { ageFromBirthDate, estimateMaxHr, hrZone } from "@/lib/hrZones";

/// Returns the most recent heart-rate sample from the last 5 minutes, fetched
/// live from Google Health. Used by the logger's live HR widget — accuracy is
/// best-effort: Fitbit sync delay typically lags 15–90 seconds behind real time.
export async function GET() {
  const userId = await requireAuth();
  const account = await prisma.healthAccount.findUnique({ where: { userId } });
  if (!account) return Response.json({ connected: false });

  const end = new Date();
  const start = new Date(end.getTime() - 5 * 60 * 1000);

  try {
    const samples = await listHeartRateBetween(
      userId,
      start.toISOString(),
      end.toISOString(),
    );
    if (samples.length === 0) {
      return Response.json({ connected: true, bpm: null, at: null });
    }
    const latest = samples[samples.length - 1];

    // Resolve the athlete's max HR (age estimate, bumped by observed peak) so
    // the widget can show live intensity zones. Done only when there's a
    // reading to classify.
    const [user, agg] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { birthDate: true },
      }),
      prisma.workout.aggregate({
        where: { userId, maxHeartRate: { not: null } },
        _max: { maxHeartRate: true },
      }),
    ]);
    const maxHr = estimateMaxHr(
      ageFromBirthDate(user?.birthDate),
      agg._max.maxHeartRate ?? null,
    );
    const z = hrZone(latest.bpm, maxHr);

    return Response.json({
      connected: true,
      bpm: latest.bpm,
      at: latest.timestamp.toISOString(),
      maxHr,
      zone: z.zone,
      zoneLabel: z.label,
      zoneColor: z.color,
      pctMax: z.pctMax,
    });
  } catch (e) {
    if (e instanceof HealthReauthRequiredError) {
      return Response.json({ connected: true, needsReconnect: true, bpm: null, at: null });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ connected: true, error: msg }, { status: 502 });
  }
}
