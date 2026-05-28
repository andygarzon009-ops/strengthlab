import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";

export const maxDuration = 30;

const VALID_RANGES = new Set(["D", "W", "M", "Y"]);
const RANGE_DAYS: Record<string, number> = { D: 1, W: 7, M: 30, Y: 365 };

/// Per-day activity totals (move kcal, exercise min, sessions) used by the
/// /activity page. Single source for all four range views — the H/D views
/// also use it (D returns one entry, the live feed card uses the same
/// fields server-side).
export async function GET(req: NextRequest) {
  const userId = await requireAuth();
  const url = new URL(req.url);
  const range = (url.searchParams.get("range") ?? "W").toUpperCase();
  if (!VALID_RANGES.has(range)) {
    return Response.json({ error: "Invalid range" }, { status: 400 });
  }
  const days = RANGE_DAYS[range];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      timezone: true,
      moveGoalKcal: true,
      exerciseGoalMin: true,
    },
  });
  const tz = user?.timezone ?? "UTC";

  const now = new Date();
  const startMs = now.getTime() - days * 24 * 60 * 60 * 1000;
  const start = new Date(startMs);

  const workouts = await prisma.workout.findMany({
    where: { userId, date: { gte: start } },
    select: {
      date: true,
      calories: true,
      activeZoneMin: true,
      duration: true,
    },
  });

  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);

  const byDay = new Map<
    string,
    { moveKcal: number; exerciseMin: number; sessions: number }
  >();
  for (const w of workouts) {
    const k = dayKey(w.date);
    const cur = byDay.get(k) ?? { moveKcal: 0, exerciseMin: 0, sessions: 0 };
    cur.moveKcal += w.calories ?? 0;
    if (w.activeZoneMin && w.activeZoneMin > 0) {
      cur.exerciseMin += w.activeZoneMin;
    } else if (w.duration && w.duration > 0) {
      cur.exerciseMin += w.duration / 60;
    }
    cur.sessions += 1;
    byDay.set(k, cur);
  }

  const out: {
    dateKey: string;
    moveKcal: number;
    exerciseMin: number;
    sessions: number;
  }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - (days - 1 - i) * 24 * 60 * 60 * 1000);
    const k = dayKey(d);
    const v = byDay.get(k) ?? { moveKcal: 0, exerciseMin: 0, sessions: 0 };
    out.push({
      dateKey: k,
      moveKcal: Math.round(v.moveKcal),
      exerciseMin: Math.round(v.exerciseMin),
      sessions: v.sessions,
    });
  }

  return Response.json({
    range,
    tz,
    moveGoal: user?.moveGoalKcal ?? 500,
    exerciseGoal: user?.exerciseGoalMin ?? 30,
    sessionGoal: 1,
    days: out,
  });
}
