import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { subDays, format } from "date-fns";
import {
  shapeForType,
  isTimedExercise,
  specificMuscleFor,
  broadGroupForSpecific,
} from "@/lib/exercises";

export default async function WeeklyRecap({ userId }: { userId: string }) {
  const since = subDays(new Date(), 35);
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
  const prior4Weeks = workouts.filter(
    (w) => new Date(w.date) >= subDays(new Date(), 35) && new Date(w.date) < weekAgo
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
  const maxHrOf = (list: typeof workouts) => {
    let m = 0;
    for (const w of list) {
      if (typeof w.maxHeartRate === "number" && w.maxHeartRate > m) {
        m = w.maxHeartRate;
      }
    }
    return m > 0 ? m : null;
  };

  const thisAvgHr = avgHrOf(thisWeek);
  const prior4wkAvgHr = avgHrOf(prior4Weeks);
  const hrDelta =
    thisAvgHr !== null && prior4wkAvgHr !== null
      ? thisAvgHr - prior4wkAvgHr
      : null;
  const thisMaxHr = maxHrOf(thisWeek);

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

  const weekStart = format(weekAgo, "MMM d");
  const weekEnd = format(new Date(), "MMM d");

  return (
    <div
      className="card p-5 mb-4"
      style={{
        background:
          "linear-gradient(135deg, rgba(34,197,94,0.06) 0%, var(--bg-card) 70%)",
        border: "1px solid rgba(34,197,94,0.2)",
      }}
    >
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <p className="label text-[10px]" style={{ color: "var(--accent)" }}>
            This week
          </p>
          <h2 className="text-[17px] font-bold tracking-tight mt-0.5">
            Your recap
          </h2>
        </div>
        <p
          className="label text-[9px] nums"
          style={{
            color: "var(--fg-dim)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {weekStart} – {weekEnd}
        </p>
      </div>

      <div
        className="grid grid-cols-2 gap-px rounded-xl overflow-hidden mb-3"
        style={{ background: "var(--border)" }}
      >
        <Tile
          value={String(thisWeek.length)}
          label="Sessions"
          hint={
            lastWeek.length > 0
              ? sessionDelta === 0
                ? "same as last wk"
                : `${sessionDelta > 0 ? "+" : ""}${sessionDelta} vs last wk`
              : undefined
          }
          hintColor={
            sessionDelta > 0
              ? "accent"
              : sessionDelta < 0
                ? "negative"
                : "dim"
          }
        />
        <Tile
          value={thisAvgHr !== null ? String(thisAvgHr) : "—"}
          suffix={thisAvgHr !== null ? "bpm" : undefined}
          label="Avg HR in workout"
          icon={<HeartIcon />}
          hint={
            thisAvgHr === null
              ? "sync a workout"
              : hrDelta !== null
                ? `${hrDelta > 0 ? "+" : ""}${hrDelta} vs 4-wk avg`
                : thisMaxHr !== null
                  ? `max ${thisMaxHr}`
                  : undefined
          }
          hintColor="dim"
        />
        <Tile
          value={String(prsThisWeek.length)}
          label="PRs set"
          hint={prsThisWeek.length > 0 ? "🏆 new records" : "push next session"}
          hintColor={prsThisWeek.length > 0 ? "accent" : "dim"}
          href={prsThisWeek.length > 0 ? "/analytics" : undefined}
        />
        <Tile
          value={topMuscle?.[0] ?? "—"}
          label="Top muscle"
          hint={
            topMuscle ? `${topMuscle[1]} working sets` : "log a session"
          }
          hintColor="dim"
          small
        />
      </div>

      {biggestLift && biggestLift.workoutId && (
        <Link
          href={`/workout/${biggestLift.workoutId}`}
          className="flex items-center gap-3 p-3 rounded-xl transition-colors"
          style={{ background: "var(--bg-elevated)" }}
        >
          <div className="text-[22px]">{biggestLift.isPR ? "🏆" : "🏋️"}</div>
          <div className="flex-1 min-w-0">
            <p
              className="label text-[9px]"
              style={{ color: "var(--accent)" }}
            >
              {biggestLift.isPR ? "Biggest PR" : "Biggest lift"}
            </p>
            <p className="text-[13px] font-semibold truncate">
              {biggestLift.name}
            </p>
          </div>
          <p
            className="nums text-[15px] font-bold shrink-0 flex items-baseline"
            style={{
              fontFamily: "var(--font-geist-mono)",
              color: "var(--accent)",
            }}
          >
            {biggestLift.value}
            <span className="text-[10px] font-normal opacity-70 ml-0.5">
              lb × {biggestLift.reps ?? 1}
            </span>
          </p>
          <span
            className="text-[14px] ml-1"
            style={{ color: "var(--fg-dim)" }}
          >
            ›
          </span>
        </Link>
      )}
    </div>
  );
}

function HeartIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="#f87171"
      stroke="#f87171"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden
      className="animate-pulse"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function Tile({
  value,
  suffix,
  label,
  hint,
  hintColor,
  href,
  small,
  icon,
}: {
  value: string;
  suffix?: string;
  label: string;
  hint?: string;
  hintColor: "accent" | "negative" | "dim";
  href?: string;
  small?: boolean;
  icon?: ReactNode;
}) {
  const hintC =
    hintColor === "accent"
      ? "var(--accent)"
      : hintColor === "negative"
        ? "#f87171"
        : "var(--fg-dim)";
  const inner = (
    <div className="p-3 h-full" style={{ background: "var(--bg-elevated)" }}>
      <p
        className={`nums ${small ? "text-[15px]" : "text-[22px]"} font-bold leading-none tracking-tight flex items-center gap-1.5`}
        style={{ fontFamily: "var(--font-geist-mono)" }}
      >
        {icon}
        {value}
        {suffix && (
          <span className="text-[10px] font-normal opacity-70 ml-0.5">
            {suffix}
          </span>
        )}
      </p>
      <p
        className="label text-[9px] mt-1.5"
        style={{ color: "var(--fg-dim)" }}
      >
        {label}
      </p>
      {hint && (
        <p
          className="text-[10px] mt-1 nums"
          style={{
            fontFamily: "var(--font-geist-mono)",
            color: hintC,
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}
