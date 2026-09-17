import { prisma } from "@/lib/db";
import Link from "next/link";
import { subDays, format } from "date-fns";
import {
  shapeForType,
  isTimedExercise,
  specificMuscleFor,
  broadGroupForSpecific,
  formatPlates,
} from "@/lib/exercises";

export default async function WeeklyRecap({ userId }: { userId: string }) {
  // Two weeks is everything this card compares: this week against last.
  // It used to pull five, for a 4-week HR baseline that no longer shows —
  // the heart-rate card below covers HR properly.
  const since = subDays(new Date(), 14);
  const weekAgo = subDays(new Date(), 7);
  const twoWeeksAgo = subDays(new Date(), 14);

  const workouts = await prisma.workout.findMany({
    where: { userId, date: { gte: since } },
    include: {
      exercises: {
        include: { exercise: true, sets: true },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { date: "desc" },
  });

  if (workouts.length === 0) return null;

  const thisWeek = workouts.filter((w) => new Date(w.date) >= weekAgo);
  const lastWeek = workouts.filter(
    (w) => new Date(w.date) >= twoWeeksAgo && new Date(w.date) < weekAgo
  );

  // --- Avg HR across sessions with recorded heart-rate data ---
  // Weight each workout's average by its duration so a 45-min run doesn't
  // get equal pull with a 5-min warmup. Falls back to a plain mean when
  // duration is missing.
  const avgHrOf = (list: typeof workouts) => {
    const withHr = list.filter(
      (w): w is (typeof list)[number] & { avgHeartRate: number } =>
        typeof w.avgHeartRate === "number" && w.avgHeartRate > 0
    );
    if (withHr.length === 0) return null;
    let num = 0;
    let den = 0;
    for (const w of withHr) {
      const weight = w.duration && w.duration > 0 ? w.duration : 1;
      num += w.avgHeartRate * weight;
      den += weight;
    }
    return den > 0 ? Math.round(num / den) : null;
  };
  const thisAvgHr = avgHrOf(thisWeek);

  // --- Sessions delta ---
  const sessionDelta = thisWeek.length - lastWeek.length;

  // --- PRs set in the last 7 days ---
  const thisWeekWorkoutIds = thisWeek.map((w) => w.id);
  const prsThisWeek =
    thisWeekWorkoutIds.length === 0
      ? []
      : await prisma.personalRecord.findMany({
          where: {
            userId,
            type: "WEIGHT",
            workoutId: { in: thisWeekWorkoutIds },
          },
          include: { exercise: true },
          orderBy: { value: "desc" },
        });

  // --- Top muscle (broad) this week, by working set count ---
  const setsPerBroad: Record<string, number> = {};
  for (const w of thisWeek) {
    if (shapeForType(w.type) !== "STRENGTH") continue;
    for (const we of w.exercises) {
      const workingCount = we.sets.filter((s) => s.type === "WORKING").length;
      if (workingCount === 0) continue;
      const broad = broadGroupForSpecific(specificMuscleFor(we.exercise.name));
      if (!broad) continue;
      setsPerBroad[broad] = (setsPerBroad[broad] ?? 0) + workingCount;
    }
  }
  const topMuscle = Object.entries(setsPerBroad).sort(
    (a, b) => b[1] - a[1]
  )[0] as [string, number] | undefined;

  // --- Biggest lift: top PR from this week, or heaviest working set ---
  const biggestPR = prsThisWeek[0] ?? null;
  let biggestLift: {
    name: string;
    value: number;
    reps: number | null;
    workoutId: string;
    isPR: boolean;
  } | null = null;
  if (biggestPR) {
    biggestLift = {
      name: biggestPR.exercise.name,
      value: biggestPR.value,
      reps: biggestPR.reps,
      workoutId: biggestPR.workoutId ?? "",
      isPR: true,
    };
  } else {
    let best: { w: number; reps: number | null; name: string; wid: string } | null = null;
    for (const w of thisWeek) {
      if (shapeForType(w.type) !== "STRENGTH") continue;
      for (const we of w.exercises) {
        if (isTimedExercise(we.exercise.name)) continue;
        for (const s of we.sets) {
          if (s.type !== "WORKING" || !s.weight) continue;
          if (!best || s.weight > best.w) {
            best = {
              w: s.weight,
              reps: s.reps,
              name: we.exercise.name,
              wid: w.id,
            };
          }
        }
      }
    }
    if (best) {
      biggestLift = {
        name: best.name,
        value: best.w,
        reps: best.reps,
        workoutId: best.wid,
        isPR: false,
      };
    }
  }

  // Plate-loaded lifts read as what went on the sleeve; "" for everything else.
  const biggestLiftPlates = biggestLift
    ? formatPlates(biggestLift.name, biggestLift.value)
    : "";

  const weekStart = format(weekAgo, "MMM d");
  const weekEnd = format(new Date(), "MMM d");

  const deltaLabel =
    lastWeek.length === 0
      ? null
      : sessionDelta === 0
        ? "same as last wk"
        : `${sessionDelta > 0 ? "+" : "−"}${Math.abs(sessionDelta)} vs last wk`;

  return (
    <div className="card p-4 mb-3">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="label text-[9px]" style={{ color: "var(--fg-dim)" }}>
          This week ·{" "}
          <span style={{ fontFamily: "var(--font-geist-mono)" }}>
            {weekStart} – {weekEnd}
          </span>
        </p>
        {deltaLabel && (
          <span
            className="nums text-[10px] font-semibold shrink-0"
            style={{
              fontFamily: "var(--font-geist-mono)",
              color:
                sessionDelta > 0
                  ? "var(--accent)"
                  : sessionDelta < 0
                    ? "#f87171"
                    : "var(--fg-dim)",
            }}
          >
            {deltaLabel}
          </span>
        )}
      </div>

      {/* Four numbers on one row. They used to be a 2×2 grid where every tile
          carried its own hint line, which is what made the card tall — and
          most of those hints repeated a card sitting right above or below
          this one. */}
      <div className="grid grid-cols-4 gap-2">
        <Stat value={String(thisWeek.length)} label="Sessions" />
        <Stat
          value={String(prsThisWeek.length)}
          label="PRs"
          accent={prsThisWeek.length > 0}
          href={prsThisWeek.length > 0 ? "/analytics" : undefined}
        />
        <Stat
          value={topMuscle?.[0] ?? "—"}
          label={topMuscle ? `${topMuscle[1]} sets` : "Top muscle"}
          text
        />
        <Stat
          value={thisAvgHr !== null ? String(thisAvgHr) : "—"}
          label="Avg HR"
        />
      </div>

      {biggestLift && biggestLift.workoutId && (
        <Link
          href={`/workout/${biggestLift.workoutId}`}
          className="flex items-center gap-2 mt-3 pt-3 transition-colors active:opacity-70"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <span className="text-[13px] shrink-0">
            {biggestLift.isPR ? "🏆" : "🏋️"}
          </span>
          <span className="text-[12px] font-semibold truncate flex-1 min-w-0">
            {biggestLift.name}
          </span>
          <span
            className="nums text-[12px] font-bold shrink-0"
            style={{
              fontFamily: "var(--font-geist-mono)",
              color: "var(--accent)",
            }}
          >
            {biggestLiftPlates || biggestLift.value}
            <span className="font-normal opacity-70">
              {biggestLiftPlates ? "" : " lb"} × {biggestLift.reps ?? 1}
            </span>
          </span>
          <span className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
            ›
          </span>
        </Link>
      )}
    </div>
  );
}

/// One number and what it is. Deliberately two lines tall — the hint line each
/// of these used to carry is what turned four stats into half a screen.
function Stat({
  value,
  label,
  accent,
  href,
  text,
}: {
  value: string;
  label: string;
  accent?: boolean;
  href?: string;
  /// A word rather than a number ("Legs"), so it sizes down to fit.
  text?: boolean;
}) {
  const inner = (
    <>
      <p
        className={`nums ${text ? "text-[13px]" : "text-[19px]"} font-bold leading-none tracking-tight truncate`}
        style={{
          fontFamily: "var(--font-geist-mono)",
          color: accent ? "var(--accent)" : "var(--fg)",
          paddingTop: text ? 4 : 0,
        }}
      >
        {value}
      </p>
      <p
        className="label text-[9px] mt-1.5 truncate"
        style={{ color: "var(--fg-dim)" }}
      >
        {label}
      </p>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="block min-w-0">
        {inner}
      </Link>
    );
  }
  return <div className="min-w-0">{inner}</div>;
}
