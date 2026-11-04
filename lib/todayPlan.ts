/// What the feed's Today card says: which session is up, how you're recovered,
/// and one sentence tying the two together. Deterministic on purpose — this
/// renders on every feed load, so it reads stored data rather than calling the
/// coach (the coach chat is where a real prescription comes from).

import { cache } from "react";
import { prisma } from "@/lib/db";
import { localDateKey } from "@/lib/blockStamp";
import { STRENGTH_SPLITS, isTimedExercise, shapeForType } from "@/lib/exercises";
import { isMainCompoundLift } from "@/lib/workoutPlan";
import { isOtherCompound } from "@/lib/prescribe";

const LOOKBACK_DAYS = 28;

/// Splits that train the same muscles as each one.
const SPLIT_OVERLAP: Record<string, string[]> = {
  LEGS: ["LOWER", "FULL_BODY"],
  LOWER: ["LEGS", "FULL_BODY"],
  PUSH: ["UPPER", "FULL_BODY"],
  PULL: ["UPPER", "FULL_BODY"],
  ARMS: ["UPPER", "FULL_BODY"],
  UPPER: ["PUSH", "PULL", "ARMS", "FULL_BODY"],
  FULL_BODY: ["LEGS", "LOWER", "PUSH", "PULL", "ARMS", "UPPER"],
  CORE: [],
};

/// "Legs/push/pull/lower/upper", "PPL", "Upper Lower" → the split's days in
/// order. Empty when it doesn't name any we know.
export function parsePreferredSplit(text: string | null | undefined): string[] {
  if (!text) return [];
  const t = text.toLowerCase().replace(/full[\s-]*body/g, "fullbody");
  const out: string[] = [];
  for (const word of t.split(/[^a-z]+/).filter(Boolean)) {
    if (word === "ppl") out.push("PUSH", "PULL", "LEGS");
    else if (word === "ul") out.push("UPPER", "LOWER");
    else {
      const split = WORD_SPLIT[word];
      if (split) out.push(split);
    }
  }
  return out;
}

const WORD_SPLIT: Record<string, string> = {
  push: "PUSH", chest: "PUSH",
  pull: "PULL", back: "PULL",
  legs: "LEGS", leg: "LEGS",
  lower: "LOWER", upper: "UPPER",
  arms: "ARMS", arm: "ARMS",
  fullbody: "FULL_BODY", full: "FULL_BODY",
  core: "CORE",
};

/// Legs and Lower are the same day for matching a session to the split.
const family = (split: string) => (split === "LOWER" ? "LEGS" : split);

/// Monday's local date key for a local date key.
function mondayOf(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const noon = Date.UTC(y, m - 1, d, 12);
  const dow = (new Date(noon).getUTCDay() + 6) % 7;
  return new Date(noon - dow * 86_400_000).toISOString().slice(0, 10);
}

/// Which slots of `slots` the sessions fill: an exact split first, else the
/// same muscles (a "Legs" session on the Lower day). Returns the filled flags.
function fillSlots(slots: string[], done: string[]): boolean[] {
  const filled = slots.map(() => false);
  for (const d of done) {
    let i = slots.findIndex((s, j) => !filled[j] && s === d);
    if (i < 0) i = slots.findIndex((s, j) => !filled[j] && family(s) === family(d));
    if (i >= 0) filled[i] = true;
  }
  return filled;
}

/// Local YYYY-MM-DD keys for Monday..Sunday of the week containing today.
export function weekKeys(tz: string): string[] {
  const todayKey = localDateKey(new Date(), tz);
  const [y, m, d] = todayKey.split("-").map(Number);
  const noon = Date.UTC(y, m - 1, d, 12);
  const dow = (new Date(noon).getUTCDay() + 6) % 7; // Mon = 0
  return Array.from({ length: 7 }, (_, i) =>
    new Date(noon + (i - dow) * 86_400_000).toISOString().slice(0, 10),
  );
}

export type TodayPlan = {
  dayLabel: string; // "Wed"
  /// The week's training-day goal is already met and nothing's logged today:
  /// today is a rest day, so the card doesn't push the next split.
  restDay: { daysTrained: number; goal: number } | null;
  /// A strength session already logged today — the card shows it as done.
  doneToday: {
    id: string;
    title: string;
    lifts: number;
    minutes: number | null;
    /// The coach's take on it, once written (lib/workoutSummary.ts).
    coachSummary: string | null;
  } | null;
  /// The split that's up next, from the rotation in recent history.
  next: {
    split: string; // "PULL"
    label: string; // "Pull"
    templateId: string; // last session of this split — Start re-prescribes it
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
    prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, trainingDays: true, preferredSplit: true },
    }),
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
        coachSummary: true,
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
        coachSummary: today.coachSummary,
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
  // A split is only as rested as the muscles it shares: legs yesterday means
  // lower isn't up today, even if the last "Lower" session was weeks ago.
  const restedSince = (split: string) => {
    let last = 0;
    for (const [other, w] of latestBySplit) {
      if (SPLIT_OVERLAP[split]?.includes(other) || other === split) {
        last = Math.max(last, w.date.getTime());
      }
    }
    return last;
  };
  let next: TodayPlan["next"] = null;
  const candidates = [...latestBySplit.entries()].filter(
    ([split]) =>
      split !== today?.split &&
      !(today?.split && SPLIT_OVERLAP[split]?.includes(today.split)),
  );
  const allowed = new Set(candidates.map(([s]) => s));
  // The session that stands in for a split's day: its own latest, else the
  // latest of the same muscles (no Lower lately → last Legs).
  const sessionFor = (split: string) =>
    latestBySplit.get(split) ??
    [...latestBySplit.entries()].find(([o]) => family(o) === family(split))?.[1];
  const usable = (split: string) =>
    !!splitLabel(split) &&
    !!sessionFor(split) &&
    split !== today?.split &&
    !(today?.split && SPLIT_OVERLAP[split]?.includes(today.split));

  const goal = Math.max(1, user?.trainingDays ?? 4);
  const seq = strength
    .filter((w) => w.split && splitLabel(w.split))
    .map((w) => ({ split: w.split as string, key: localDateKey(w.date, tz) }))
    .reverse(); // oldest first

  // 1. The split itself — the one in the profile, else the shape of your
  // fullest recent week. The days already trained this week fill its slots
  // in any order, so moving a day around just shifts what's left; the next
  // open slot is today's.
  let template = parsePreferredSplit(user?.preferredSplit);
  if (template.length < 2) {
    const thisMonday = mondayOf(todayKey);
    const byWeek = new Map<string, string[]>();
    for (const x of seq) {
      const mon = mondayOf(x.key);
      if (mon === thisMonday) continue;
      byWeek.set(mon, [...(byWeek.get(mon) ?? []), x.split]);
    }
    for (const days of byWeek.values()) {
      if (days.length >= 2 && days.length >= template.length) template = days;
    }
  }
  let planned: string | null = null;
  if (template.length >= 2) {
    if (template.length <= goal) {
      // A week of it (PPL at six days a week runs it twice).
      const slots = Array.from({ length: Math.ceil(goal / template.length) }, () => template).flat();
      const thisWeek = new Set(weekKeys(tz));
      const filled = fillSlots(slots, seq.filter((x) => thisWeek.has(x.key)).map((x) => x.split));
      planned = slots.find((s, i) => !filled[i] && usable(s)) ?? null;
    } else {
      // Longer than a week: it rolls on from the last day trained.
      const last = seq[seq.length - 1]?.split;
      let at = last ? template.indexOf(last) : -1;
      if (at < 0 && last) at = template.findIndex((s) => family(s) === family(last));
      for (let n = 1; at >= 0 && n <= template.length && !planned; n++) {
        const s = template[(at + n) % template.length];
        if (usable(s)) planned = s;
      }
    }
  }

  // 2. No split to go on: what came after the last few sessions the previous
  // times you trained them in that order (Upper → Legs → Push).
  const order = seq.map((x) => x.split);
  let rotated: string | null = planned;
  for (let k = Math.min(3, order.length - 1); k >= 1 && !rotated; k--) {
    const tail = order.slice(-k).join(">");
    const votes = new Map<string, { n: number; at: number }>();
    for (let i = 0; i + k < order.length; i++) {
      const follower = order[i + k];
      if (order.slice(i, i + k).join(">") !== tail || !allowed.has(follower)) continue;
      const v = votes.get(follower) ?? { n: 0, at: 0 };
      votes.set(follower, { n: v.n + 1, at: i });
    }
    let best: [string, { n: number; at: number }] | null = null;
    for (const e of votes) {
      if (!best || e[1].n > best[1].n || (e[1].n === best[1].n && e[1].at > best[1].at)) best = e;
    }
    rotated = best?.[0] ?? null;
  }
  // 3. Last resort: whichever muscles have rested longest.
  if (rotated || candidates.length > 0) {
    const [split, w] = rotated
      ? [rotated, sessionFor(rotated)!]
      : candidates.reduce((a, b) => {
          const ra = restedSince(a[0]);
          const rb = restedSince(b[0]);
          if (ra !== rb) return ra < rb ? a : b;
          // Same muscles (Legs vs Lower): name it the way you train it now.
          return a[1].date > b[1].date ? a : b;
        });
    // The lift the advice names is the session's top set — a main barbell
    // compound, else another compound. Never an accessory: a heavy calf-raise
    // machine can outweigh the squat, but nobody pushes a top set on it.
    const heaviestOf = (keep: (name: string) => boolean) => {
      let lift: string | null = null;
      let weight = 0;
      for (const ex of w.exercises) {
        const name = ex.exercise.name;
        if (isTimedExercise(name) || !keep(name)) continue;
        for (const s of ex.sets) {
          if (s.type === "WORKING" && (s.weight ?? 0) > weight) {
            weight = s.weight ?? 0;
            lift = name;
          }
        }
      }
      return lift;
    };
    const topLift =
      heaviestOf(isMainCompoundLift) ?? heaviestOf(isOtherCompound);
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

  // Days trained this week (any workout, same count as the This week card).
  // Once the goal is in, the rest of the week is rest — not another split.
  const week = weekKeys(tz);
  const trainedDays = new Set(
    recent.map((w) => localDateKey(w.date, tz)).filter((k) => week.includes(k)),
  );
  const restDay =
    !doneToday && !trainedDays.has(todayKey) && trainedDays.size >= goal
      ? { daysTrained: trainedDays.size, goal }
      : null;

  return {
    dayLabel,
    restDay,
    doneToday,
    next,
    readiness: {
      score: account?.recoveryScore ?? null,
      band: account?.recoveryBand ?? null,
      line: restDay
        ? restLine(restDay.daysTrained)
        : readinessLine(account, next, !!doneToday),
    },
  };
});

function restLine(daysTrained: number): string {
  return `${daysTrained} days trained this week — goal hit. Rest up today; recovery is where the work turns into strength.`;
}

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
