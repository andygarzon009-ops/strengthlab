// The body scan as recovery bars for the feed's This week card: the six
// major muscle groups, plus anything overworked, each as how far along its
// recovery is. Every number comes from lib/bodyScan on the per-muscle
// recovery windows in lib/muscleRecovery (the research is cited there).
import {
  hoursToRecovered,
  isOverworked,
  muscleHeat,
  type MuscleStat,
} from "@/lib/bodyScan";

type Load = Record<string, MuscleStat | undefined>;

/// A group reads as its least-recovered muscle: back isn't ready while the
/// lats still are recovering, however fresh the rhomboids are.
export const MAJOR_GROUPS: { name: string; muscles: string[] }[] = [
  { name: "Chest", muscles: ["Pec Major"] },
  { name: "Back", muscles: ["Lats", "Rhomboids"] },
  { name: "Shoulders", muscles: ["Front Delts", "Side Delts"] },
  { name: "Quads", muscles: ["Quads"] },
  { name: "Hamstrings", muscles: ["Hamstrings"] },
  { name: "Glutes", muscles: ["Glutes"] },
];

/// The smaller muscles listed under the bars, by their display names.
const SMALL: [string, string][] = [
  ["Biceps", "Biceps"],
  ["Triceps", "Triceps"],
  ["Rear Delts", "Rear delts"],
  ["Traps", "Traps"],
  ["Calves", "Calves"],
  ["Abs", "Abs"],
];

export type RecoveryRow = {
  name: string;
  state: "over" | "recovering" | "ready";
  /// 0–1, how far through recovery; 1 only when ready. An overworked
  /// muscle shows its progress too, in red — it's still recovering.
  fraction: number;
  /// Right-hand label: "Ready" or "Ready in 52h" (red when overworked).
  label: string;
  /// Small line under the name: when it's ready, why it's over, or that it
  /// hasn't been trained lately.
  note: string | null;
};

/// Under an overworked muscle's name, laid out like the others' "Fri
/// morning": the state, and the week's sets when that's the reason.
function overNote(m: MuscleStat): string {
  return m.weekSets > m.mrv ? `Overworked · ${Math.round(m.weekSets)} sets` : "Overworked";
}

/// How far through its recovery window a muscle is, kept off the very ends
/// so a bar never reads as empty or as ready.
function progress(m: MuscleStat): number {
  return Math.min(0.95, Math.max(0.05, 1 - hoursToRecovered(m) / m.recoveryHours));
}

function overRow(name: string, m: MuscleStat): RecoveryRow {
  return {
    name,
    state: "over",
    fraction: progress(m),
    label: `Ready in ${hoursToRecovered(m)}h`,
    note: overNote(m),
  };
}

/// "this evening", "tomorrow morning", "Fri evening" — when `hours` from now
/// lands, in the athlete's timezone.
export function whenReady(hours: number, tz: string, now = new Date()): string {
  const at = new Date(now.getTime() + hours * 3_600_000);
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(at),
  );
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const today = day(now);
  const tomorrow = day(new Date(now.getTime() + 86_400_000));
  if (day(at) === today) return part === "evening" ? "tonight" : `this ${part}`;
  if (day(at) === tomorrow) return `tomorrow ${part}`;
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(at);
  return `${wd} ${part}`;
}

function groupRow(name: string, muscles: string[], load: Load, tz: string): RecoveryRow {
  const stats = muscles.map((m) => load[m]);
  const over = stats.find((m) => m && isOverworked(m));
  if (over) return overRow(name, over);
  let worst: MuscleStat | undefined;
  let left = 0;
  for (const m of stats) {
    const h = hoursToRecovered(m);
    if (h > left) {
      left = h;
      worst = m;
    }
  }
  if (worst && left > 0) {
    return {
      name,
      state: "recovering",
      fraction: progress(worst),
      label: `Ready in ${left}h`,
      note: whenReady(left, tz),
    };
  }
  const rested = stats.every((m) => muscleHeat(m) === 0);
  return { name, state: "ready", fraction: 1, label: "Ready", note: rested ? "not trained lately" : null };
}

export type RecoveryView = {
  rows: RecoveryRow[];
  readyMajors: number;
  small: { name: string; text: string; tone: "recovering" | "rested" }[];
};

export function recoveryView(load: Load, tz: string): RecoveryView {
  const majors = MAJOR_GROUPS.map((g) => groupRow(g.name, g.muscles, load, tz));
  const inMajors = new Set(MAJOR_GROUPS.flatMap((g) => g.muscles));
  // Any other overworked muscle joins the bars, at the top with the major
  // groups that are over: that's the thing to act on.
  const otherOver: RecoveryRow[] = SMALL.filter(([m]) => !inMajors.has(m) && isOverworked(load[m])).map(
    ([m, label]) => overRow(label, load[m]!),
  );
  const rows = [
    ...otherOver,
    ...majors.filter((r) => r.state === "over"),
    ...majors.filter((r) => r.state !== "over"),
  ];
  const small = SMALL.filter(([m]) => !isOverworked(load[m]))
    .map(([m, label]) => {
      const h = hoursToRecovered(load[m]);
      if (h > 0) return { name: label, text: `ready in ${h}h`, tone: "recovering" as const, h };
      if (muscleHeat(load[m]) === 0) return { name: label, text: "not trained in a while", tone: "rested" as const, h: -1 };
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.h - a.h)
    .slice(0, 4)
    .map(({ name, text, tone }) => ({ name, text, tone }));
  return { rows, readyMajors: majors.filter((r) => r.state === "ready").length, small };
}
