import Link from "next/link";
import { prisma } from "@/lib/db";

type Props = {
  userId: string;
};

const MOVE_GOAL_DEFAULT = 500; // kcal
const EXERCISE_GOAL_DEFAULT = 30; // exercise minutes
const SESSION_GOAL = 1; // workouts logged today

// Deliberately not Apple's red/lime/cyan — warmer, on-brand palette.
const MOVE_COLOR = "#f97316"; // orange (burn)
const EXERCISE_COLOR = "#22c55e"; // app accent green
const SESSION_COLOR = "#38bdf8"; // sky

export default async function ActivityRingsCard({ userId }: Props) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      timezone: true,
      moveGoalKcal: true,
      exerciseGoalMin: true,
    },
  });
  const tz = user?.timezone ?? "UTC";
  const moveGoal = user?.moveGoalKcal ?? MOVE_GOAL_DEFAULT;
  const exerciseGoal = user?.exerciseGoalMin ?? EXERCISE_GOAL_DEFAULT;

  // Local day boundary in the user's tz.
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

  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      date: { gte: startUtc, lt: endUtc },
    },
    select: { calories: true, activeZoneMin: true, duration: true },
  });

  const moveKcal = workouts.reduce((s, w) => s + (w.calories ?? 0), 0);
  // Exercise minutes: prefer Fitbit's activeZoneMin (HR-weighted), but
  // fall back to workout duration in minutes when AZM is missing — common
  // for sessions Fitbit logged without an intensity breakdown. Any logged
  // workout still counts toward the daily exercise goal.
  const exerciseMin = Math.round(
    workouts.reduce((sum, w) => {
      if (w.activeZoneMin && w.activeZoneMin > 0) return sum + w.activeZoneMin;
      if (w.duration && w.duration > 0) return sum + w.duration / 60;
      return sum;
    }, 0),
  );
  const sessionCount = workouts.length;

  const rows = [
    {
      label: "Move",
      value: moveKcal,
      goal: moveGoal,
      unit: "cal",
      color: MOVE_COLOR,
    },
    {
      label: "Exercise",
      value: exerciseMin,
      goal: exerciseGoal,
      unit: "min",
      color: EXERCISE_COLOR,
    },
    {
      label: "Sessions",
      value: sessionCount,
      goal: SESSION_GOAL,
      unit: "",
      color: SESSION_COLOR,
    },
  ];

  return (
    <Link
      href="/activity"
      className="block rounded-2xl p-4 mb-3 transition-colors"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-bold tracking-tight">Activity</h3>
        <span style={{ color: "var(--fg-dim)" }}>→</span>
      </div>

      <div className="space-y-3.5">
        {rows.map((r) => (
          <Bar key={r.label} {...r} />
        ))}
      </div>
    </Link>
  );
}

function Bar({
  label,
  value,
  goal,
  unit,
  color,
}: {
  label: string;
  value: number;
  goal: number;
  unit: string;
  color: string;
}) {
  const pct = Math.min(1, goal > 0 ? value / goal : 0);
  const done = value >= goal && goal > 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span
          className="text-[11px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--fg-dim)" }}
        >
          {label}
        </span>
        <span className="text-[12px] font-bold tabular-nums">
          <span style={{ color }}>{value}</span>
          <span style={{ color: "var(--fg-dim)" }}>
            {" "}
            / {goal}
            {unit ? ` ${unit}` : ""}
          </span>
          {done && <span style={{ color }}> ✓</span>}
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: "var(--bg-elevated)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct * 100}%`,
            background: color,
            boxShadow: pct > 0 ? `0 0 8px ${color}66` : undefined,
          }}
        />
      </div>
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
