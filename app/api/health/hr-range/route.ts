import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listRestingHeartRate } from "@/lib/googleHealth";

export const maxDuration = 30;

const VALID_RANGES = new Set(["W", "M", "Y"]);
const RANGE_DAYS: Record<string, number> = { W: 7, M: 30, Y: 365 };

/// Per-day heart-rate aggregates for the W/M/Y views on /heart-rate.
/// Each day carries the resting reading (from Google Health) and the
/// peak/avg HR from any workout logged that day (from our DB). The D view
/// uses /api/health/daily-hr — this endpoint is multi-day only.
export async function GET(req: NextRequest) {
  const userId = await requireAuth();
  const account = await prisma.healthAccount.findUnique({ where: { userId } });
  if (!account) return Response.json({ connected: false });

  const url = new URL(req.url);
  const range = (url.searchParams.get("range") ?? "W").toUpperCase();
  if (!VALID_RANGES.has(range)) {
    return Response.json({ error: "Invalid range" }, { status: 400 });
  }
  const days = RANGE_DAYS[range];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = user?.timezone ?? "UTC";

  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // Pull resting HR + workouts in parallel — both are bounded to the range.
  const [restingSamples, workouts] = await Promise.all([
    listRestingHeartRate(userId, start.toISOString(), now.toISOString()).catch(
      () => [] as { date: Date; bpm: number }[],
    ),
    prisma.workout.findMany({
      where: {
        userId,
        date: { gte: start },
        OR: [{ maxHeartRate: { not: null } }, { avgHeartRate: { not: null } }],
      },
      select: { date: true, avgHeartRate: true, maxHeartRate: true },
    }),
  ]);

  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);

  const byDay = new Map<
    string,
    { restingHR?: number; peakHR?: number; avgHR?: number }
  >();
  for (const s of restingSamples) {
    const k = dayKey(s.date);
    const cur = byDay.get(k) ?? {};
    cur.restingHR = s.bpm;
    byDay.set(k, cur);
  }
  for (const w of workouts) {
    const k = dayKey(w.date);
    const cur = byDay.get(k) ?? {};
    if (w.maxHeartRate && (!cur.peakHR || w.maxHeartRate > cur.peakHR)) {
      cur.peakHR = w.maxHeartRate;
    }
    if (w.avgHeartRate && (!cur.avgHR || w.avgHeartRate > cur.avgHR)) {
      cur.avgHR = w.avgHeartRate;
    }
    byDay.set(k, cur);
  }

  // Emit one entry per day in the range so the chart can render an even
  // x-axis even on days with no data.
  const days_out: {
    dateKey: string;
    restingHR?: number;
    peakHR?: number;
    avgHR?: number;
  }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - (days - 1 - i) * 24 * 60 * 60 * 1000);
    const k = dayKey(d);
    const v = byDay.get(k) ?? {};
    days_out.push({
      dateKey: k,
      restingHR: v.restingHR,
      peakHR: v.peakHR,
      avgHR: v.avgHR,
    });
  }

  return Response.json({ connected: true, range, tz, days: days_out });
}
