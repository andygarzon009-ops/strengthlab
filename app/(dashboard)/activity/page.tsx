import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import ActivityView from "@/components/ActivityView";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const userId = await requireAuth();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      timezone: true,
      moveGoalKcal: true,
      exerciseGoalMin: true,
    },
  });
  const tz = user?.timezone ?? "UTC";

  // Today's totals — server-renders the D view with non-empty data.
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = dayKey.split("-").map(Number);
  const offsetMin = tzOffsetMinutes(tz, new Date(Date.UTC(y, m - 1, d)));
  const startUtc = new Date(Date.UTC(y, m - 1, d) - offsetMin * 60 * 1000);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

  const todayWorkouts = await prisma.workout.findMany({
    where: { userId, date: { gte: startUtc, lt: endUtc } },
    select: { calories: true, activeZoneMin: true, duration: true },
  });
  const todayMove = todayWorkouts.reduce(
    (s, w) => s + (w.calories ?? 0),
    0,
  );
  const todayEx = Math.round(
    todayWorkouts.reduce((s, w) => {
      if (w.activeZoneMin && w.activeZoneMin > 0) return s + w.activeZoneMin;
      if (w.duration && w.duration > 0) return s + w.duration / 60;
      return s;
    }, 0),
  );

  // Year of workouts feeds the per-range list below the chart, same
  // pattern as /heart-rate.
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const recentWorkouts = await prisma.workout.findMany({
    where: { userId, date: { gte: yearAgo } },
    orderBy: { date: "desc" },
    select: {
      id: true,
      title: true,
      date: true,
      startedAt: true,
      endedAt: true,
      calories: true,
      activeZoneMin: true,
      duration: true,
    },
  });

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/"
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--fg-muted)",
          }}
          aria-label="Back to feed"
        >
          ←
        </Link>
        <h1 className="text-[22px] font-bold tracking-tight">Activity</h1>
      </div>

      <ActivityView
        initial={{
          range: "D",
          tz,
          moveGoal: user?.moveGoalKcal ?? 500,
          exerciseGoal: user?.exerciseGoalMin ?? 30,
          sessionGoal: 1,
          days: [
            {
              dateKey,
              moveKcal: todayMove,
              exerciseMin: todayEx,
              sessions: todayWorkouts.length,
            },
          ],
        }}
        workouts={recentWorkouts.map((w) => ({
          id: w.id,
          title: w.title,
          date: w.date.toISOString(),
          startedAt: w.startedAt ? w.startedAt.toISOString() : null,
          endedAt: w.endedAt ? w.endedAt.toISOString() : null,
          calories: w.calories,
          activeZoneMin: w.activeZoneMin,
          duration: w.duration,
        }))}
      />
    </div>
  );
}

function tzOffsetMinutes(tz: string, atUtc: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(atUtc);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - atUtc.getTime()) / 60000);
}
