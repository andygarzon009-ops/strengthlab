import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { shapeForType, isTimedExercise } from "@/lib/exercises";

export const maxDuration = 30;

const VALID_RANGES = new Set(["W", "M", "Y"]);
const RANGE_DAYS: Record<string, number> = { W: 7, M: 30, Y: 365 };

/// Daily strength tonnage (Σ weight × reps for working sets, isometric
/// timed exercises excluded) for the /consistency strength chart.
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
    select: { timezone: true },
  });
  const tz = user?.timezone ?? "UTC";

  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const workouts = await prisma.workout.findMany({
    where: { userId, date: { gte: start } },
    include: {
      exercises: {
        include: {
          exercise: { select: { name: true } },
          sets: {
            select: { type: true, weight: true, reps: true },
          },
        },
      },
    },
  });

  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);

  const byDay = new Map<string, number>();
  for (const w of workouts) {
    if (shapeForType(w.type) !== "STRENGTH") continue;
    let dayVolume = 0;
    for (const e of w.exercises) {
      if (isTimedExercise(e.exercise.name)) continue;
      for (const s of e.sets) {
        if (s.type === "WARMUP") continue;
        const weight = s.weight ?? 0;
        const reps = s.reps ?? 0;
        if (weight > 0 && reps > 0) dayVolume += weight * reps;
      }
    }
    if (dayVolume <= 0) continue;
    const k = dayKey(w.date);
    byDay.set(k, (byDay.get(k) ?? 0) + dayVolume);
  }

  const out: { dateKey: string; volume: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - (days - 1 - i) * 24 * 60 * 60 * 1000);
    const k = dayKey(d);
    out.push({ dateKey: k, volume: Math.round(byDay.get(k) ?? 0) });
  }

  // Total + best day in window for the summary banner.
  const total = out.reduce((s, x) => s + x.volume, 0);
  const best = out.reduce((m, x) => (x.volume > m ? x.volume : m), 0);

  return Response.json({
    range,
    tz,
    total,
    best,
    days: out,
  });
}
