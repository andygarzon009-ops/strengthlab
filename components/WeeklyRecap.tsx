import { prisma } from "@/lib/db";
import Link from "next/link";
import { subDays } from "date-fns";
import {
  shapeForType,
  specificMuscleFor,
  broadGroupForSpecific,
} from "@/lib/exercises";
import { loadPhase, PhaseSection } from "@/components/PhaseCard";

// The feed's lead card: where the cycle is, then three numbers for the last
// seven days. It used to carry a date range, a vs-last-week chip, average HR
// and a biggest-lift row as well — each fine alone, together the busiest thing
// on the screen. Detail lives one tap away on the pages these link to.
export default async function WeeklyRecap({ userId }: { userId: string }) {
  const weekAgo = subDays(new Date(), 7);

  const [phase, workouts] = await Promise.all([
    loadPhase(userId).catch(() => null),
    prisma.workout.findMany({
      where: { userId, date: { gte: weekAgo } },
      include: {
        exercises: {
          include: { exercise: true, sets: true },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { date: "desc" },
    }),
  ]);

  if (workouts.length === 0) {
    return phase ? (
      <div className="card p-4 mb-3">
        <PhaseSection phase={phase} />
      </div>
    ) : null;
  }

  const prCount = await prisma.personalRecord.count({
    where: {
      userId,
      type: "WEIGHT",
      workoutId: { in: workouts.map((w) => w.id) },
    },
  });

  // Top muscle (broad) this week, by working set count.
  const setsPerBroad: Record<string, number> = {};
  for (const w of workouts) {
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
    (a, b) => b[1] - a[1],
  )[0] as [string, number] | undefined;

  return (
    <div className="card p-4 mb-3">
      {phase && (
        <div
          className="pb-4 mb-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <PhaseSection phase={phase} />
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Stat value={String(workouts.length)} label="Sessions" />
        <Stat
          value={String(prCount)}
          label="PRs"
          href={prCount > 0 ? "/analytics" : undefined}
        />
        <Stat value={topMuscle?.[0] ?? "—"} label="Top muscle" text />
      </div>
    </div>
  );
}

/// One number and what it is.
function Stat({
  value,
  label,
  href,
  text,
}: {
  value: string;
  label: string;
  href?: string;
  /// A word rather than a number ("Legs"), so it sizes down to fit.
  text?: boolean;
}) {
  const inner = (
    <>
      <p
        className={`nums ${text ? "text-[15px]" : "text-[20px]"} font-bold leading-none tracking-tight truncate`}
        style={{
          fontFamily: "var(--font-geist-mono)",
          paddingTop: text ? 3 : 0,
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
