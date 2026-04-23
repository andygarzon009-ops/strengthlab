import { prisma } from "@/lib/db";
import { startOfWeek, subWeeks, format } from "date-fns";

const WEEKS = 8;

export default async function ConsistencySparkline({
  userId,
  trainingDaysGoal,
}: {
  userId: string;
  trainingDaysGoal?: number | null;
}) {
  const since = startOfWeek(subWeeks(new Date(), WEEKS - 1), {
    weekStartsOn: 1,
  });
  const workouts = await prisma.workout.findMany({
    where: { userId, date: { gte: since } },
    select: { date: true },
  });

  if (workouts.length === 0) return null;

  // Count unique training days per ISO week (Mon-Sun) for the last 8 weeks.
  const weekStarts: Date[] = [];
  for (let i = WEEKS - 1; i >= 0; i--) {
    weekStarts.push(startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 }));
  }

  const daysByWeek = weekStarts.map((wStart) => {
    const wEnd = new Date(wStart);
    wEnd.setDate(wStart.getDate() + 7);
    const days = new Set<string>();
    for (const w of workouts) {
      const d = new Date(w.date);
      if (d >= wStart && d < wEnd) {
        days.add(format(d, "yyyy-MM-dd"));
      }
    }
    return { start: wStart, days: days.size };
  });

  const goal = Math.max(1, trainingDaysGoal ?? 4);
  const maxDays = Math.max(goal, ...daysByWeek.map((w) => w.days), 1);
  const avg =
    daysByWeek.reduce((sum, w) => sum + w.days, 0) / daysByWeek.length;

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <p className="label">Consistency</p>
          <h2 className="text-[14px] font-semibold tracking-tight leading-none mt-1">
            Last {WEEKS} weeks
          </h2>
        </div>
        <p
          className="label text-[9px] nums"
          style={{
            color: "var(--fg-dim)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          avg {avg.toFixed(1)} / {goal}d
        </p>
      </div>

      <div className="flex items-end gap-1.5 h-16">
        {daysByWeek.map((w, i) => {
          const h = (w.days / maxDays) * 100;
          const hit = w.days >= goal;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center gap-1"
              title={`Week of ${format(w.start, "MMM d")}: ${w.days}d`}
            >
              <div className="flex-1 w-full flex items-end">
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${Math.max(4, h)}%`,
                    background: hit
                      ? "var(--accent)"
                      : w.days > 0
                        ? "rgba(34,197,94,0.35)"
                        : "var(--bg-elevated)",
                  }}
                />
              </div>
              <span
                className="text-[9px] nums"
                style={{
                  color: "var(--fg-dim)",
                  fontFamily: "var(--font-geist-mono)",
                }}
              >
                {w.days}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
