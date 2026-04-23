import { prisma } from "@/lib/db";
import { startOfWeek, subWeeks, addDays, format } from "date-fns";
import Link from "next/link";

const WEEKS = 8;
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

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
    select: { id: true, date: true },
    orderBy: { date: "asc" },
  });

  if (workouts.length === 0) return null;

  // Build a map day → first workoutId (for click-through).
  const workoutIdByDate = new Map<string, string>();
  for (const w of workouts) {
    const key = format(new Date(w.date), "yyyy-MM-dd");
    if (!workoutIdByDate.has(key)) workoutIdByDate.set(key, w.id);
  }

  const today = new Date();
  const goal = Math.max(1, trainingDaysGoal ?? 4);

  // Build the grid: 8 weeks (columns), each with 7 days (Mon → Sun).
  const weeks: {
    start: Date;
    days: { date: Date; key: string; hasWorkout: boolean; isFuture: boolean }[];
    hitCount: number;
  }[] = [];
  let totalHit = 0;
  for (let w = WEEKS - 1; w >= 0; w--) {
    const start = startOfWeek(subWeeks(today, w), { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const key = format(date, "yyyy-MM-dd");
      return {
        date,
        key,
        hasWorkout: workoutIdByDate.has(key),
        isFuture: date > today,
      };
    });
    const hitCount = days.filter((d) => d.hasWorkout).length;
    totalHit += hitCount;
    weeks.push({ start, days, hitCount });
  }

  const avg = totalHit / weeks.length;

  // Month labels on the columns — only show the label on the first column
  // that falls into a new month, to avoid repeats.
  const monthLabels = weeks.map((w, i) => {
    const month = format(w.start, "MMM");
    if (i === 0) return month;
    const prev = format(weeks[i - 1].start, "MMM");
    return month === prev ? "" : month;
  });

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

      <div className="flex gap-2.5">
        {/* Weekday labels */}
        <div className="flex flex-col justify-between py-[2px]">
          {WEEKDAYS.map((d, i) => (
            <span
              key={i}
              className="text-[9px] leading-none"
              style={{
                color: "var(--fg-dim)",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {d}
            </span>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between mb-1">
            {monthLabels.map((m, i) => (
              <span
                key={i}
                className="text-[9px] leading-none flex-1 text-center"
                style={{
                  color: "var(--fg-dim)",
                  fontFamily: "var(--font-geist-mono)",
                }}
              >
                {m}
              </span>
            ))}
          </div>
          <div
            className="grid gap-[3px]"
            style={{ gridTemplateColumns: `repeat(${WEEKS}, 1fr)` }}
          >
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.days.map((day) => {
                  const workoutId = workoutIdByDate.get(day.key);
                  const base = {
                    aspectRatio: "1 / 1",
                    borderRadius: "3px",
                  } as const;
                  if (day.hasWorkout && workoutId) {
                    return (
                      <Link
                        key={day.key}
                        href={`/workout/${workoutId}`}
                        title={`${format(day.date, "EEE MMM d")} — trained`}
                        className="block transition-transform active:scale-90"
                        style={{
                          ...base,
                          background: "var(--accent)",
                        }}
                      />
                    );
                  }
                  return (
                    <div
                      key={day.key}
                      title={
                        day.isFuture
                          ? format(day.date, "EEE MMM d")
                          : `${format(day.date, "EEE MMM d")} — rest`
                      }
                      style={{
                        ...base,
                        background: day.isFuture
                          ? "transparent"
                          : "var(--bg-elevated)",
                        border: day.isFuture
                          ? "1px dashed var(--border)"
                          : "none",
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <LegendDot color="var(--accent)" label="Trained" />
        <LegendDot color="var(--bg-elevated)" label="Rest" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="w-2 h-2 rounded-sm"
        style={{ background: color }}
      />
      <span
        className="text-[10px]"
        style={{
          color: "var(--fg-dim)",
          fontFamily: "var(--font-geist-mono)",
        }}
      >
        {label}
      </span>
    </div>
  );
}
