import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { WORKOUT_TYPES, shapeForType, formatDuration } from "@/lib/exercises";
import { format, subDays, differenceInDays } from "date-fns";
import VolumeChart from "@/components/VolumeChart";
import PRList from "@/components/PRList";
import GoalsSection, {
  type GoalWithProgress,
} from "@/components/GoalsSection";
import WeakSpots, { type WeakSpot } from "@/components/WeakSpots";

export default async function AnalyticsPage() {
  const userId = await requireAuth();

  const [user, workouts, prs, goals, exercises] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
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
    prisma.goal.findMany({
      where: { userId, completed: false },
      include: { exercise: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.exercise.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const last30 = workouts.filter(
    (w) => new Date(w.date) >= subDays(new Date(), 30)
  );
  const last7 = workouts.filter(
    (w) => new Date(w.date) >= subDays(new Date(), 7)
  );
  const last14 = workouts.filter(
    (w) => new Date(w.date) >= subDays(new Date(), 14)
  );

  // ---------- Goal progress ----------
  const goalsWithProgress: GoalWithProgress[] = goals.map((g) => {
    let currentValue = 0;
    let currentReps: number | null = null;

    if (g.type === "STRENGTH" && g.exerciseId) {
      const bestPR = prs
        .filter(
          (p) => p.type === "WEIGHT" && p.exerciseId === g.exerciseId
        )
        .sort((a, b) => b.value - a.value)[0];
      currentValue = bestPR?.value ?? 0;
      currentReps = bestPR?.reps ?? null;
    } else if (g.type === "FREQUENCY") {
      currentValue = last7.length;
    } else if (g.type === "BODYWEIGHT_GAIN" || g.type === "BODYWEIGHT_CUT") {
      currentValue = user?.bodyweight ?? 0;
    } else if (g.type === "DISTANCE") {
      // Best single-session distance
      currentValue = Math.max(
        0,
        ...workouts
          .filter(
            (w) => shapeForType(w.type) === "DISTANCE" && w.distance != null
          )
          .map((w) => w.distance ?? 0)
      );
    }

    let progressPct: number;
    if (g.type === "BODYWEIGHT_CUT") {
      // Progress increases as current drops toward target
      // Need a baseline — use whichever is higher between current and target as the start
      progressPct =
        currentValue > g.targetValue
          ? ((currentValue - g.targetValue) /
              (currentValue * 0.1 + Math.abs(currentValue - g.targetValue))) *
              100
          : 100;
      // Simpler: if at or below target, 100%. Otherwise 0 rising as we approach.
      progressPct =
        currentValue <= g.targetValue
          ? 100
          : Math.max(
              0,
              100 -
                ((currentValue - g.targetValue) / g.targetValue) * 100 * 5
            );
    } else {
      progressPct =
        g.targetValue > 0 ? (currentValue / g.targetValue) * 100 : 0;
    }

    return {
      id: g.id,
      type: g.type,
      title: g.title,
      exerciseId: g.exerciseId,
      exerciseName: g.exercise?.name ?? null,
      targetValue: g.targetValue,
      unit: g.unit,
      deadline: g.deadline?.toISOString() ?? null,
      currentValue,
      currentReps,
      progressPct,
    };
  });

  // ---------- Weak spots ----------
  const weakSpots: WeakSpot[] = [];

  // Muscle groups not hit in last 14 days
  const trainedMuscleGroups = new Set<string>();
  for (const w of last14) {
    for (const ex of w.exercises) {
      if (ex.exercise.muscleGroup) {
        trainedMuscleGroups.add(ex.exercise.muscleGroup);
      }
    }
  }
  const allMuscleGroups = new Set<string>();
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (ex.exercise.muscleGroup) allMuscleGroups.add(ex.exercise.muscleGroup);
    }
  }
  const untrained = [...allMuscleGroups].filter(
    (mg) => !trainedMuscleGroups.has(mg)
  );
  if (untrained.length > 0) {
    weakSpots.push({
      id: "untrained-mg",
      severity: untrained.length >= 3 ? "high" : "medium",
      title: `${untrained.length} muscle group${untrained.length === 1 ? "" : "s"} not hit in 14 days`,
      detail: untrained.join(", "),
    });
  }

  // Plateaued lifts — last 3 sessions of a given exercise show no weight increase
  const strengthWorkouts = workouts.filter(
    (w) => shapeForType(w.type) === "STRENGTH"
  );
  const exerciseHistory: Record<
    string,
    { name: string; topWeights: number[] }
  > = {};
  for (const w of strengthWorkouts) {
    for (const ex of w.exercises) {
      const ws = ex.sets.filter((s) => s.type === "WORKING");
      if (ws.length === 0) continue;
      const top = Math.max(...ws.map((s) => s.weight ?? 0));
      if (!exerciseHistory[ex.exerciseId]) {
        exerciseHistory[ex.exerciseId] = {
          name: ex.exercise.name,
          topWeights: [],
        };
      }
      exerciseHistory[ex.exerciseId].topWeights.push(top);
    }
  }
  for (const data of Object.values(exerciseHistory)) {
    const recent = data.topWeights.slice(-3);
    if (recent.length >= 3 && Math.max(...recent) - Math.min(...recent) < 0.01) {
      weakSpots.push({
        id: `plateau-${data.name}`,
        severity: "medium",
        title: `${data.name} has plateaued`,
        detail: `Last 3 sessions stuck at ${recent[0]}lb. Time to push or swap rep range.`,
      });
    }
  }

  // Frequency gap
  if (user?.trainingDays && last7.length < user.trainingDays) {
    weakSpots.push({
      id: "freq-gap",
      severity:
        user.trainingDays - last7.length >= 2 ? "high" : "medium",
      title: `Under your weekly target`,
      detail: `${last7.length} of ${user.trainingDays} sessions this week. ${user.trainingDays - last7.length} more to stay on pace.`,
    });
  }

  // Volume drop (strength volume week-over-week)
  const strengthVolumeThisWeek = last7
    .filter((w) => shapeForType(w.type) === "STRENGTH")
    .flatMap((w) => w.exercises.flatMap((e) => e.sets))
    .filter((s) => s.type === "WORKING")
    .reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);
  const prevWeekStart = subDays(new Date(), 14);
  const prevWeekEnd = subDays(new Date(), 7);
  const strengthVolumePrevWeek = workouts
    .filter(
      (w) =>
        shapeForType(w.type) === "STRENGTH" &&
        new Date(w.date) >= prevWeekStart &&
        new Date(w.date) < prevWeekEnd
    )
    .flatMap((w) => w.exercises.flatMap((e) => e.sets))
    .filter((s) => s.type === "WORKING")
    .reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);
  if (
    strengthVolumePrevWeek > 500 &&
    strengthVolumeThisWeek < strengthVolumePrevWeek * 0.75
  ) {
    const dropPct = Math.round(
      (1 - strengthVolumeThisWeek / strengthVolumePrevWeek) * 100
    );
    weakSpots.push({
      id: "volume-drop",
      severity: dropPct >= 40 ? "high" : "medium",
      title: `Strength volume dropped ${dropPct}%`,
      detail: `${Math.round(strengthVolumeThisWeek).toLocaleString()}lb this week vs ${Math.round(strengthVolumePrevWeek).toLocaleString()}lb last week.`,
    });
  }

  // Overtraining — 5+ consecutive days
  if (workouts.length >= 5) {
    const recentDates = [...new Set(
      workouts
        .slice(-10)
        .map((w) => format(new Date(w.date), "yyyy-MM-dd"))
    )].sort();
    let maxStreak = 1;
    let currentStreak = 1;
    for (let i = 1; i < recentDates.length; i++) {
      const diff = differenceInDays(
        new Date(recentDates[i]),
        new Date(recentDates[i - 1])
      );
      if (diff === 1) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }
    const lastDate = recentDates[recentDates.length - 1];
    const daysSinceLast = differenceInDays(new Date(), new Date(lastDate));
    if (daysSinceLast === 0 && maxStreak >= 5) {
      weakSpots.push({
        id: "overtraining",
        severity: "medium",
        title: `${maxStreak} consecutive training days`,
        detail: `Consider a recovery day. Fatigue compounds — a rest day often unlocks next week's PRs.`,
      });
    }
  }

  // ---------- Existing analytics ----------
  const volumeData = last30
    .filter((w) => shapeForType(w.type) === "STRENGTH")
    .map((w) => ({
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

  // Training streak — consecutive days ending today or yesterday
  const streakDays = (() => {
    if (workouts.length === 0) return 0;
    const dates = [
      ...new Set(
        workouts.map((w) => format(new Date(w.date), "yyyy-MM-dd"))
      ),
    ].sort();
    const today = format(new Date(), "yyyy-MM-dd");
    const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const lastDate = dates[dates.length - 1];
    if (lastDate !== today && lastDate !== yesterday) return 0;
    let streak = 1;
    for (let i = dates.length - 2; i >= 0; i--) {
      const diff = differenceInDays(
        new Date(dates[i + 1]),
        new Date(dates[i])
      );
      if (diff === 1) streak++;
      else break;
    }
    return streak;
  })();

  return (
    <div className="max-w-lg mx-auto px-4 pt-10 pb-24">
      <div className="mb-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="label" style={{ color: "var(--accent)" }}>
              Stats
            </p>
            <h1 className="text-[40px] font-bold tracking-[-0.02em] leading-none mt-1.5">
              Progress
            </h1>
          </div>
          {streakDays > 0 && (
            <div
              className="shrink-0 text-right px-3 py-2 rounded-xl"
              style={{
                background: "var(--accent-dim)",
                border: "1px solid rgba(34,197,94,0.3)",
              }}
            >
              <p
                className="label text-[9px]"
                style={{ color: "var(--accent)" }}
              >
                Streak
              </p>
              <p
                className="nums font-bold text-[18px] leading-none tracking-tight mt-0.5"
                style={{
                  color: "var(--accent)",
                  fontFamily: "var(--font-geist-mono)",
                }}
              >
                {streakDays}
                <span className="text-[11px] font-normal ml-0.5 opacity-70">
                  d
                </span>
              </p>
            </div>
          )}
        </div>
        <div
          className="mt-5 h-px"
          style={{
            background:
              "linear-gradient(90deg, var(--accent) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Goals at top */}
      <GoalsSection
        goals={goalsWithProgress}
        exercises={exercises}
      />

      {workouts.length === 0 ? (
        <div className="text-center py-16 card">
          <p
            className="text-[14px]"
            style={{ color: "var(--fg-muted)" }}
          >
            Log some sessions to see your analytics.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 30-day hero stats */}
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <p className="label">Last 30 days</p>
                <h2 className="text-[18px] font-bold tracking-tight leading-none mt-1">
                  Activity
                </h2>
              </div>
            </div>

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
          </div>

          {volumeData.length > 0 && (
            <div className="card p-5">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-semibold text-[14px] tracking-tight">
                  Strength volume
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
                Session mix
              </h2>
              <div className="space-y-3">
                {typeDistribution.map((t) => {
                  const pct = (t.count / workouts.length) * 100;
                  return (
                    <div key={t.type} className="flex items-center gap-3">
                      <span
                        className="text-[12px] w-24 shrink-0 truncate"
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

      {/* Weak spots at bottom */}
      <div className="mt-6">
        <WeakSpots spots={weakSpots} />
      </div>
    </div>
  );
}
