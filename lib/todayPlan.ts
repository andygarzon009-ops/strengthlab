/// What the feed's Today card says: which session is up, how you're recovered,
/// and one sentence tying the two together. Deterministic on purpose — this
/// renders on every feed load, so it reads stored data rather than calling the
/// coach (the coach chat is where a real prescription comes from).

import { cache } from "react";
import { prisma } from "@/lib/db";
import { localDateKey } from "@/lib/blockStamp";
import { STRENGTH_SPLITS, isTimedExercise, shapeForType } from "@/lib/exercises";

const LOOKBACK_DAYS = 28;

export type TodayPlan = {
  dayLabel: string; // "Wed"
  /// A strength session already logged today — the card shows it as done.
  doneToday: { id: string; title: string; lifts: number; minutes: number | null } | null;
  /// The split that's up next, from the rotation in recent history.
  next: {
    split: string; // "PULL"
    label: string; // "Pull"
    templateId: string; // last session of this split — Start clones it
    lifts: number;
    minutes: number | null;
    topLift: string | null; // heaviest working lift in that session
    daysSince: number;
  } | null;
  readiness: {
    score: number | null;
    band: string | null;
    line: string;
  };
};

export function splitLabel(split: string | null | undefined): string | null {
  if (!split) return null;
  return STRENGTH_SPLITS.find((s) => s.value === split)?.label ?? null;
}

/// Two-letter tag for the week strip ("Pu", "Pl", "L").
export function splitTag(split: string | null | undefined): string {
  switch (split) {
    case "PUSH": return "Pu";
    case "PULL": return "Pl";
    case "LEGS": return "L";
    case "UPPER": return "Up";
    case "LOWER": return "Lo";
    case "ARMS": return "Ar";
    case "FULL_BODY": return "FB";
    case "CORE": return "Co";
    default: return "•";
  }
}

const roundMinutes = (sec: number | null | undefined) =>
  sec && sec > 0 ? Math.max(5, Math.round(sec / 60 / 5) * 5) : null;

export const loadTodayPlan = cache(async (userId: string): Promise<TodayPlan> => {
  const [user, account, recent] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    prisma.healthAccount.findUnique({
      where: { userId },
      select: {
        recoveryScore: true,
        recoveryBand: true,
        hrvMs: true,
        hrvBaselineMs: true,
        restingDelta: true,
        sleepSummary: true,
      },
    }),
    prisma.workout.findMany({
      where: {
        userId,
        date: { gte: new Date(Date.now() - LOOKBACK_DAYS * 86_400_000) },
      },
      select: {
        id: true,
        title: true,
        type: true,
        split: true,
        date: true,
        duration: true,
        exercises: {
          select: {
            exercise: { select: { name: true } },
            sets: { select: { type: true, weight: true } },
          },
        },
      },
      orderBy: { date: "desc" },
    }),
  ]);

  const tz = user?.timezone || "UTC";
  const todayKey = localDateKey(new Date(), tz);
  const dayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(new Date());

  const strength = recent.filter((w) => shapeForType(w.type) === "STRENGTH");

  const today = strength.find((w) => localDateKey(w.date, tz) === todayKey);
  const doneToday = today
    ? {
        id: today.id,
        title: today.title,
        lifts: today.exercises.length,
        minutes: roundMinutes(today.duration),
      }
    : null;

  // Rotation: of the splits trained recently, the one gone longest without.
  // `strength` is newest-first, so the first sighting of a split is its latest.
  const latestBySplit = new Map<string, (typeof strength)[number]>();
  for (const w of strength) {
    if (w.split && splitLabel(w.split) && !latestBySplit.has(w.split)) {
      latestBySplit.set(w.split, w);
    }
  }
  let next: TodayPlan["next"] = null;
  const candidates = [...latestBySplit.entries()].filter(
    ([split]) => split !== today?.split,
  );
  if (candidates.length > 0) {
    const [split, w] = candidates.reduce((a, b) =>
      a[1].date < b[1].date ? a : b,
    );
    let topLift: string | null = null;
    let topWeight = 0;
    for (const ex of w.exercises) {
      if (isTimedExercise(ex.exercise.name)) continue;
      for (const s of ex.sets) {
        if (s.type === "WORKING" && (s.weight ?? 0) > topWeight) {
          topWeight = s.weight ?? 0;
          topLift = ex.exercise.name;
        }
      }
    }
    next = {
      split,
      label: splitLabel(split)!,
      templateId: w.id,
      lifts: w.exercises.length,
      minutes: roundMinutes(w.duration),
      topLift,
      daysSince: Math.max(
        0,
        Math.round((Date.now() - w.date.getTime()) / 86_400_000),
      ),
    };
  }

  return {
    dayLabel,
    doneToday,
    next,
    readiness: {
      score: account?.recoveryScore ?? null,
      band: account?.recoveryBand ?? null,
      line: readinessLine(account, next, !!doneToday),
    },
  };
});

type Recovery = {
  recoveryScore: number | null;
  recoveryBand: string | null;
  hrvMs: number | null;
  hrvBaselineMs: number | null;
  restingDelta: number | null;
  sleepSummary: unknown;
} | null;

/// "HRV up and 7h 40m of sleep — a good day to push the top set on rows."
function readinessLine(
  a: Recovery,
  next: TodayPlan["next"],
  doneToday: boolean,
): string {
  if (doneToday) return "Session's in the book. Eat well and sleep — that's where it turns into strength.";

  const why: string[] = [];
  if (a?.hrvMs != null && a.hrvBaselineMs != null && a.hrvBaselineMs > 0) {
    const r = a.hrvMs / a.hrvBaselineMs;
    if (r >= 1.05) why.push("HRV up");
    else if (r <= 0.95) why.push("HRV down");
  }
  const asleep = (a?.sleepSummary as { asleepMin?: number } | null)?.asleepMin;
  if (asleep != null && asleep > 0) {
    why.push(`${Math.floor(asleep / 60)}h ${asleep % 60}m of sleep`);
  }
  if (a?.restingDelta != null && a.restingDelta >= 3) {
    why.push(`resting HR up ${a.restingDelta}`);
  }
  const lift = next?.topLift ? next.topLift.toLowerCase() : null;

  const advice =
    a?.recoveryBand === "primed"
      ? lift
        ? `a good day to push the top set on ${lift}.`
        : "a good day to push."
      : a?.recoveryBand === "low"
        ? "keep it lighter — cut a set and stay off failure."
        : lift
          ? `train as planned and leave a rep in the tank on ${lift}.`
          : "train as planned, leave a rep in the tank.";

  if (why.length > 0) {
    const joined =
      why.length === 1
        ? why[0]
        : `${why.slice(0, -1).join(", ")} and ${why[why.length - 1]}`;
    return `${joined[0].toUpperCase()}${joined.slice(1)} — ${advice}`;
  }
  if (next) {
    const ago =
      next.daysSince <= 1 ? "yesterday" : `${next.daysSince} days ago`;
    return `Last ${next.label.toLowerCase()} day was ${ago} — ${advice}`;
  }
  return "Log a session and this card starts planning your days.";
}
