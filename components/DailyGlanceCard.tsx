import { prisma } from "@/lib/db";
import DailyGlance, {
  type RecoveryGlance,
  type ActivityGlance,
} from "@/components/DailyGlance";

const BAND_COLOR: Record<string, string> = {
  primed: "#22c55e",
  moderate: "#f59e0b",
  low: "#ef4444",
};
const BAND_LABEL: Record<string, string> = {
  primed: "Primed",
  moderate: "Moderate",
  low: "Take it easy",
};
const BAND_SUB: Record<string, string> = {
  primed: "Good day to push",
  moderate: "Train as planned",
  low: "Prioritize recovery",
};

const MOVE_GOAL_DEFAULT = 500;
const EXERCISE_GOAL_DEFAULT = 30;
const SESSION_GOAL = 1;
const MOVE_COLOR = "#f97316";
const EXERCISE_COLOR = "#22c55e";
const SESSION_COLOR = "#38bdf8";

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
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
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

/// Server side of the Daily Glance: assembles today's Recovery (from the stored
/// snapshot) and Activity (from today's workouts vs goals) and hands them to the
/// client DailyGlance, which fetches Fuel itself. Replaces the standalone
/// Recovery + Activity + Fuel cards on the feed.
export default async function DailyGlanceCard({ userId }: { userId: string }) {
  const [user, account] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, moveGoalKcal: true, exerciseGoalMin: true },
    }),
    prisma.healthAccount.findUnique({
      where: { userId },
      select: {
        recoveryScore: true,
        recoveryBand: true,
        hrvMs: true,
        restingHr: true,
        restingDelta: true,
        sleepSummary: true,
      },
    }),
  ]);

  // --- Recovery ---
  let recovery: RecoveryGlance | null = null;
  if (account && account.recoveryScore != null && account.recoveryBand) {
    const band = account.recoveryBand;
    const sleep = account.sleepSummary as { asleepMin?: number } | null;
    const drivers: string[] = [];
    if (account.hrvMs != null) drivers.push(`HRV ${Math.round(account.hrvMs)}ms`);
    if (account.restingHr != null) {
      const d = account.restingDelta;
      const arrow = d == null || d === 0 ? "" : d < 0 ? " ↓" : " ↑";
      const mag = d == null || d === 0 ? "" : ` ${Math.abs(d)}`;
      drivers.push(`RHR ${account.restingHr}${arrow}${mag}`);
    }
    recovery = {
      score: account.recoveryScore,
      color: BAND_COLOR[band] ?? "var(--accent)",
      label: BAND_LABEL[band] ?? "Recovery",
      sub: BAND_SUB[band] ?? "",
      sleepLabel:
        sleep?.asleepMin != null
          ? `${Math.floor(sleep.asleepMin / 60)}h ${sleep.asleepMin % 60}m`
          : null,
      drivers,
    };
  }

  // --- Activity (today's workouts vs goals) ---
  const tz = user?.timezone ?? "UTC";
  const moveGoal = user?.moveGoalKcal ?? MOVE_GOAL_DEFAULT;
  const exerciseGoal = user?.exerciseGoalMin ?? EXERCISE_GOAL_DEFAULT;
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
    where: { userId, date: { gte: startUtc, lt: endUtc } },
    select: { calories: true, activeZoneMin: true, duration: true },
  });
  const moveKcal = workouts.reduce((s, w) => s + (w.calories ?? 0), 0);
  const exerciseMin = Math.round(
    workouts.reduce((sum, w) => {
      if (w.activeZoneMin && w.activeZoneMin > 0) return sum + w.activeZoneMin;
      if (w.duration && w.duration > 0) return sum + w.duration / 60;
      return sum;
    }, 0),
  );
  const sessionCount = workouts.length;

  const rows = [
    { label: "Move", value: moveKcal, goal: moveGoal, unit: "cal", color: MOVE_COLOR, done: moveKcal >= moveGoal },
    { label: "Exercise", value: exerciseMin, goal: exerciseGoal, unit: "min", color: EXERCISE_COLOR, done: exerciseMin >= exerciseGoal },
    { label: "Sessions", value: sessionCount, goal: SESSION_GOAL, unit: "", color: SESSION_COLOR, done: sessionCount >= SESSION_GOAL },
  ];
  const pct = Math.round(
    (rows.reduce((s, r) => s + Math.min(1, r.goal > 0 ? r.value / r.goal : 0), 0) / rows.length) * 100,
  );
  const activity: ActivityGlance = { pct, color: MOVE_COLOR, moveCal: moveKcal, rows };

  return <DailyGlance recovery={recovery} activity={activity} />;
}
