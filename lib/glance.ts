import { after } from "next/server";
import { prisma } from "@/lib/db";
import { maybeRefreshRecovery } from "@/lib/recovery";
import { FACTOR_LABEL, type ReadinessFactor } from "@/lib/readiness";
import type { RecoveryGlance, ActivityGlance } from "@/components/DailyGlance";
import { scaleColor } from "@/components/TickGauge";

const BAND_LABEL: Record<string, string> = {
  primed: "Primed",
  moderate: "Steady",
  low: "Run down",
};
const BAND_SUB: Record<string, string> = {
  primed: "Good day to push",
  moderate: "Train as planned",
  low: "Go easy today",
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

/// Local calendar day and minutes past midnight for an instant in `tz`.
function localClock(tz: string, at: Date): { day: string; min: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const hour = Number(get("hour")) % 24;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, min: hour * 60 + Number(get("minute")) };
}

const PACE_LOOKBACK_DAYS = 14;
/// Fewer days than this and "your usual" is noise, so no marker.
const PACE_MIN_DAYS = 4;

/// Where you usually are by this time of day, from your own last two weeks —
/// so an evening lifter or a late eater isn't "behind" every afternoon.
/// Fuel: the share of a day's eating you've usually logged by now (×100, the
/// pace of a day that finishes on target). Activity: your Activity % by now on
/// a training day, against today's goals. Null when there isn't enough history.
async function loadUsualPace(
  userId: string,
  tz: string,
  goals: { move: number; exercise: number },
): Promise<{ fuel: number | null; activity: number | null }> {
  const now = localClock(tz, new Date());
  const since = new Date(Date.now() - (PACE_LOOKBACK_DAYS + 1) * 24 * 60 * 60 * 1000);
  const sinceKey = localClock(tz, since).day;

  const [foods, workouts] = await Promise.all([
    prisma.foodLog.findMany({
      where: { userId, localDate: { gte: sinceKey, lt: now.day } },
      select: { localDate: true, loggedAt: true, kcal: true, proteinG: true },
    }),
    prisma.workout.findMany({
      where: { userId, date: { gte: since } },
      select: { date: true, startedAt: true, calories: true, activeZoneMin: true, duration: true },
    }),
  ]);

  // Fuel. A meal logged on a later day has no real time of day, so a day
  // containing one is left out rather than guessed at.
  const foodDays = new Map<string, { kcal: number; p: number; kcalNow: number; pNow: number; bad: boolean }>();
  for (const f of foods) {
    const d = foodDays.get(f.localDate) ?? { kcal: 0, p: 0, kcalNow: 0, pNow: 0, bad: false };
    const at = localClock(tz, f.loggedAt);
    if (at.day !== f.localDate) d.bad = true;
    d.kcal += f.kcal;
    d.p += f.proteinG;
    if (at.min <= now.min) {
      d.kcalNow += f.kcal;
      d.pNow += f.proteinG;
    }
    foodDays.set(f.localDate, d);
  }
  const fuelShares = [...foodDays.values()]
    .filter((d) => !d.bad && d.kcal > 0)
    .map((d) => 0.5 * (d.kcalNow / d.kcal) + 0.5 * (d.p > 0 ? d.pNow / d.p : d.kcalNow / d.kcal));

  // Activity, on training days only — a rest day says nothing about pace.
  const trainDays = new Map<string, { move: number; ex: number; n: number }>();
  for (const w of workouts) {
    const at = localClock(tz, w.startedAt ?? w.date);
    if (at.day >= now.day) continue;
    const d = trainDays.get(at.day) ?? { move: 0, ex: 0, n: 0 };
    if (at.min <= now.min) {
      d.move += w.calories ?? 0;
      d.ex += w.activeZoneMin && w.activeZoneMin > 0 ? w.activeZoneMin : w.duration && w.duration > 0 ? w.duration / 60 : 0;
      d.n += 1;
    }
    trainDays.set(at.day, d);
  }
  const actPcts = [...trainDays.values()].map(
    (d) =>
      ((Math.min(1, d.move / Math.max(1, goals.move)) +
        Math.min(1, d.ex / Math.max(1, goals.exercise)) +
        Math.min(1, d.n / SESSION_GOAL)) /
        3) *
      100,
  );

  const avg = (xs: number[]) =>
    xs.length >= PACE_MIN_DAYS ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null;
  return {
    fuel: avg(fuelShares.map((x) => x * 100)),
    activity: avg(actPcts),
  };
}

/// Server side of the Daily Glance: today's Readiness (from the stored
/// snapshot) and Activity (today's workouts vs goals). The client DailyGlance
/// at the top of the Today card renders them and fetches Fuel itself.
export async function loadGlance(
  userId: string,
): Promise<{
  recovery: RecoveryGlance | null;
  activity: ActivityGlance;
  /// Usual Fuel % by this time of day (see loadUsualPace).
  fuelUsual: number | null;
}> {
  // The home feed is the most-opened surface, so use it to keep recovery/sleep
  // fresh: pull from Google Health post-response when the stored snapshot is
  // stale. Gated + non-blocking, so it never slows the feed — and it feeds both
  // this ring and the coach (both read the same stored snapshot), so sleep
  // updates on normal app use instead of only when the Health page is opened.
  after(() => maybeRefreshRecovery(userId));

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
        readinessFactors: true,
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
    // Name whatever took points off today (fever-ish temp, fast breathing,
    // a load spike) — those are the reasons a good night still scored low.
    const factors = (account.readinessFactors as ReadinessFactor[] | null) ?? [];
    for (const f of factors) {
      if (f.penalty) drivers.push(`${FACTOR_LABEL[f.key]} ${f.value}`);
    }
    recovery = {
      score: account.recoveryScore,
      color: scaleColor(account.recoveryScore),
      label: BAND_LABEL[band] ?? "Readiness",
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

  const [workouts, usual] = await Promise.all([
    prisma.workout.findMany({
      where: { userId, date: { gte: startUtc, lt: endUtc } },
      select: { calories: true, activeZoneMin: true, duration: true },
    }),
    loadUsualPace(userId, tz, { move: moveGoal, exercise: exerciseGoal }).catch(() => ({
      fuel: null,
      activity: null,
    })),
  ]);
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
  const activity: ActivityGlance = {
    pct,
    color: MOVE_COLOR,
    moveCal: moveKcal,
    rows,
    usual: usual.activity,
  };

  return { recovery, activity, fuelUsual: usual.fuel };
}
