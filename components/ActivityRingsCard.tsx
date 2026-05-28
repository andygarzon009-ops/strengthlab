import Link from "next/link";
import { prisma } from "@/lib/db";

type Props = {
  userId: string;
};

const MOVE_GOAL_DEFAULT = 500; // kcal
const EXERCISE_GOAL_DEFAULT = 30; // exercise minutes
const SESSION_GOAL = 1; // workouts logged today

const MOVE_COLOR = "#fa114f";
const EXERCISE_COLOR = "#a4f803";
const SESSION_COLOR = "#1dd2e6";

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

  return (
    <Link
      href="/activity"
      className="block rounded-2xl p-4 mb-3 transition-colors"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-bold tracking-tight">Activity</h3>
        <span style={{ color: "var(--fg-dim)" }}>→</span>
      </div>

      <div className="flex items-center gap-4">
        <Rings
          move={{ value: moveKcal, goal: moveGoal, color: MOVE_COLOR }}
          exercise={{
            value: exerciseMin,
            goal: exerciseGoal,
            color: EXERCISE_COLOR,
          }}
          session={{
            value: sessionCount,
            goal: SESSION_GOAL,
            color: SESSION_COLOR,
          }}
        />
        <div className="flex-1 space-y-2 min-w-0">
          <Stat
            label="Move"
            value={`${moveKcal}/${moveGoal}`}
            unit="CAL"
            color={MOVE_COLOR}
          />
          <Stat
            label="Exercise"
            value={`${exerciseMin}/${exerciseGoal}`}
            unit="MIN"
            color={EXERCISE_COLOR}
          />
          <Stat
            label="Sessions"
            value={`${sessionCount}/${SESSION_GOAL}`}
            unit=""
            color={SESSION_COLOR}
          />
        </div>
      </div>
    </Link>
  );
}

function Stat({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
}) {
  return (
    <div>
      <p
        className="text-[10px] uppercase tracking-wider font-semibold"
        style={{ color: "var(--fg-dim)" }}
      >
        {label}
      </p>
      <p className="text-[15px] font-bold tabular-nums" style={{ color }}>
        {value}
        {unit ? (
          <span
            className="text-[10px] ml-1"
            style={{ color: "var(--fg-dim)" }}
          >
            {unit}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function Rings({
  move,
  exercise,
  session,
}: {
  move: { value: number; goal: number; color: string };
  exercise: { value: number; goal: number; color: string };
  session: { value: number; goal: number; color: string };
}) {
  const size = 120;
  const cx = size / 2;
  const cy = size / 2;
  const stroke = 12;
  const gap = 2;
  // Three rings, outer → inner. Outer radius leaves room for stroke.
  const rOuter = cx - stroke / 2;
  const rMiddle = rOuter - stroke - gap;
  const rInner = rMiddle - stroke - gap;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Ring
        cx={cx}
        cy={cy}
        r={rOuter}
        stroke={stroke}
        color={move.color}
        pct={Math.min(1, move.value / move.goal)}
      />
      <Ring
        cx={cx}
        cy={cy}
        r={rMiddle}
        stroke={stroke}
        color={exercise.color}
        pct={Math.min(1, exercise.value / exercise.goal)}
      />
      <Ring
        cx={cx}
        cy={cy}
        r={rInner}
        stroke={stroke}
        color={session.color}
        pct={Math.min(1, session.value / session.goal)}
      />
    </svg>
  );
}

function Ring({
  cx,
  cy,
  r,
  stroke,
  color,
  pct,
}: {
  cx: number;
  cy: number;
  r: number;
  stroke: number;
  color: string;
  pct: number;
}) {
  const circ = 2 * Math.PI * r;
  // Track is the dimmed full ring; fg is the filled arc. Both rotated so the
  // arc starts at 12 o'clock and sweeps clockwise.
  const dash = circ * pct;
  return (
    <g transform={`rotate(-90 ${cx} ${cy})`}>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeOpacity={0.18}
        strokeWidth={stroke}
      />
      {pct > 0 && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
        />
      )}
    </g>
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
