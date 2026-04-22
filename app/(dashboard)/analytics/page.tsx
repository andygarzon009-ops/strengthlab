import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { WORKOUT_TYPES } from "@/lib/exercises";
import { format, subDays } from "date-fns";
import VolumeChart from "@/components/VolumeChart";
import PRList from "@/components/PRList";

export default async function AnalyticsPage() {
  const userId = await requireAuth();

  const [workouts, prs] = await Promise.all([
    prisma.workout.findMany({
      where: { userId },
      include: {
        exercises: {
          include: { sets: true, exercise: true },
        },
      },
      orderBy: { date: "asc" },
    }),
    prisma.personalRecord.findMany({
      where: { userId },
      include: { exercise: true },
      orderBy: { date: "desc" },
    }),
  ]);

  const last30 = workouts.filter(
    (w) => new Date(w.date) >= subDays(new Date(), 30)
  );

  const volumeData = last30.map((w) => ({
    date: format(new Date(w.date), "MMM d"),
    volume: w.exercises
      .flatMap((e) => e.sets.filter((s) => s.type === "WORKING"))
      .reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0),
    sets: w.exercises.flatMap((e) =>
      e.sets.filter((s) => s.type === "WORKING")
    ).length,
  }));

  const typeDistribution = WORKOUT_TYPES.map((t) => ({
    type: t.label,
    count: workouts.filter((w) => w.type === t.value).length,
  })).filter((t) => t.count > 0);

  const muscleGroupCounts: Record<string, number> = {};
  for (const w of workouts) {
    for (const ex of w.exercises) {
      const mg = ex.exercise.muscleGroup ?? "Other";
      muscleGroupCounts[mg] = (muscleGroupCounts[mg] ?? 0) + 1;
    }
  }

  const exerciseCounts: Record<string, { name: string; count: number }> = {};
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (!exerciseCounts[ex.exerciseId]) {
        exerciseCounts[ex.exerciseId] = { name: ex.exercise.name, count: 0 };
      }
      exerciseCounts[ex.exerciseId].count++;
    }
  }
  const topExercises = Object.values(exerciseCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const weightPRs = prs
    .filter((pr) => pr.type === "WEIGHT")
    .reduce(
      (acc, pr) => {
        if (!acc[pr.exerciseId] || pr.value > acc[pr.exerciseId].value) {
          acc[pr.exerciseId] = pr;
        }
        return acc;
      },
      {} as Record<string, (typeof prs)[0]>
    );

  const topPRs = Object.values(weightPRs)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const totalVolume30 = volumeData.reduce((s, d) => s + d.volume, 0);
  const totalSets30 = volumeData.reduce((s, d) => s + d.sets, 0);

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="mb-8">
        <p className="label">Analytics</p>
        <h1 className="text-[28px] font-bold tracking-tight leading-none mt-1">
          Your numbers
        </h1>
      </div>

      {workouts.length === 0 ? (
        <div className="text-center py-16 card">
          <p
            className="text-[14px]"
            style={{ color: "var(--fg-muted)" }}
          >
            Log some workouts to see your analytics.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 30-day hero stats */}
          <div
            className="grid grid-cols-3 gap-px card overflow-hidden"
            style={{ background: "var(--border)", padding: 0 }}
          >
            {[
              { label: "Sessions", value: last30.length },
              {
                label: "Volume",
                value:
                  totalVolume30 >= 1000
                    ? `${(totalVolume30 / 1000).toFixed(1)}k`
                    : totalVolume30,
                suffix: totalVolume30 > 0 ? "lb" : undefined,
              },
              { label: "Sets", value: totalSets30 },
            ].map((s) => (
              <div
                key={s.label}
                className="px-3 py-4 text-center"
                style={{ background: "var(--bg-card)" }}
              >
                <p
                  className="font-semibold text-[20px] leading-none tracking-tight nums"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  {s.value}
                  {s.suffix && (
                    <span
                      className="text-[11px] ml-0.5 font-normal"
                      style={{ color: "var(--fg-dim)" }}
                    >
                      {s.suffix}
                    </span>
                  )}
                </p>
                <p
                  className="label text-[9px] mt-1.5"
                  style={{ color: "var(--fg-dim)" }}
                >
                  {s.label}
                </p>
              </div>
            ))}
          </div>
          <p
            className="label text-[9px] -mt-2 mb-2 px-1"
            style={{ color: "var(--fg-dim)" }}
          >
            Last 30 days
          </p>

          {volumeData.length > 0 && (
            <div className="card p-5">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-semibold text-[14px] tracking-tight">
                  Volume trend
                </h2>
                <p
                  className="label text-[9px]"
                  style={{ color: "var(--fg-dim)" }}
                >
                  30d
                </p>
              </div>
              <VolumeChart data={volumeData} />
            </div>
          )}

          {topPRs.length > 0 && (
            <div className="card p-5">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-semibold text-[14px] tracking-tight">
                  Top lifts
                </h2>
                <p
                  className="label text-[9px]"
                  style={{ color: "var(--fg-dim)" }}
                >
                  Personal records
                </p>
              </div>
              <PRList prs={topPRs} />
            </div>
          )}

          {typeDistribution.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-[14px] tracking-tight mb-4">
                Split distribution
              </h2>
              <div className="space-y-3">
                {typeDistribution.map((t) => {
                  const pct = (t.count / workouts.length) * 100;
                  return (
                    <div key={t.type} className="flex items-center gap-3">
                      <span
                        className="text-[12px] w-16 shrink-0"
                        style={{ color: "var(--fg-muted)" }}
                      >
                        {t.type}
                      </span>
                      <div
                        className="flex-1 h-1.5 rounded-full overflow-hidden"
                        style={{ background: "var(--bg-elevated)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: "var(--accent)",
                          }}
                        />
                      </div>
                      <span
                        className="text-[11px] w-8 text-right nums"
                        style={{
                          color: "var(--fg-muted)",
                          fontFamily: "var(--font-geist-mono)",
                        }}
                      >
                        {t.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {topExercises.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-[14px] tracking-tight mb-4">
                Most frequent
              </h2>
              <div className="space-y-2">
                {topExercises.map((ex, i) => (
                  <div
                    key={ex.name}
                    className="flex items-center justify-between py-1"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="text-[11px] w-4 nums"
                        style={{
                          color: "var(--fg-dim)",
                          fontFamily: "var(--font-geist-mono)",
                        }}
                      >
                        0{i + 1}
                      </span>
                      <span className="text-[13px] truncate">{ex.name}</span>
                    </div>
                    <span
                      className="text-[12px] nums shrink-0 ml-2"
                      style={{
                        color: "var(--fg-muted)",
                        fontFamily: "var(--font-geist-mono)",
                      }}
                    >
                      {ex.count}×
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(muscleGroupCounts).length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-[14px] tracking-tight mb-4">
                Muscle groups
              </h2>
              <div className="space-y-3">
                {Object.entries(muscleGroupCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([mg, count]) => {
                    const max = Math.max(...Object.values(muscleGroupCounts));
                    return (
                      <div key={mg} className="flex items-center gap-3">
                        <span
                          className="text-[12px] w-20 truncate shrink-0"
                          style={{ color: "var(--fg-muted)" }}
                        >
                          {mg}
                        </span>
                        <div
                          className="flex-1 h-1.5 rounded-full overflow-hidden"
                          style={{ background: "var(--bg-elevated)" }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(count / max) * 100}%`,
                              background: "var(--fg-muted)",
                            }}
                          />
                        </div>
                        <span
                          className="text-[11px] w-8 text-right nums"
                          style={{
                            color: "var(--fg-muted)",
                            fontFamily: "var(--font-geist-mono)",
                          }}
                        >
                          {count}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
