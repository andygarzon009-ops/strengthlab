import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { syncDefaultExercises } from "@/lib/actions/exercises";
import {
  WORKOUT_TYPES,
  shapeForType,
  formatDuration,
  isMachineExercise,
  isTimedExercise,
  specificMuscleFor,
  PRIORITY_MUSCLES,
  isPriorityMuscle,
} from "@/lib/exercises";
import { format, subDays, differenceInDays } from "date-fns";
import PRList from "@/components/PRList";
import Projections from "@/components/Projections";
import ActivityRings from "@/components/ActivityRings";
import GoalsSection, {
  type GoalWithProgress,
} from "@/components/GoalsSection";
import WeakSpots from "@/components/WeakSpots";
import { computeWeakSpots } from "@/lib/weakSpots";
import {
  normalizeExerciseName,
  similarExerciseIds,
} from "@/lib/exerciseIdentity";

export default async function AnalyticsPage() {
  const userId = await requireAuth();

  // Make sure the default library is seeded before we render the goal
  // picker — otherwise new athletes only see the handful of exercises
  // they've personally logged.
  try {
    await syncDefaultExercises();
  } catch {
    // non-fatal: the page still works with whatever's already in the DB
  }

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

  const last7 = workouts.filter(
    (w) => new Date(w.date) >= subDays(new Date(), 7)
  );
  const last14 = workouts.filter(
    (w) => new Date(w.date) >= subDays(new Date(), 14)
  );

  // ---------- Activity rings ----------
  const workingSetsIn = (list: typeof workouts) =>
    list
      .filter((w) => shapeForType(w.type) === "STRENGTH")
      .flatMap((w) => w.exercises.flatMap((e) => e.sets))
      .filter((s) => s.type === "WORKING");

  // Volume = Σ (weight × reps) for STRENGTH working sets. Timed/isometric
  // movements (planks, holds) are excluded — their "reps" field is seconds,
  // so including them would distort tonnage.
  const volumeIn = (list: typeof workouts) =>
    list
      .filter((w) => shapeForType(w.type) === "STRENGTH")
      .flatMap((w) =>
        w.exercises
          .filter((e) => !isTimedExercise(e.exercise.name))
          .flatMap((e) => e.sets)
      )
      .filter((s) => s.type === "WORKING")
      .reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);

  // The activity ring uses a tighter 13-muscle list — hitting all 6
  // broad groups was automatic on a normal split, so the ring sat at
  // 100% all the time. Priority muscles surface gaps the broad-group
  // bucket hides (rear delts, side delts, calves, hamstrings, etc.).
  const priorityMusclesHitIn = (list: typeof workouts): Set<string> => {
    const hit = new Set<string>();
    for (const w of list) {
      if (shapeForType(w.type) !== "STRENGTH") continue;
      for (const we of w.exercises) {
        const hasWorkingSet = we.sets.some((s) => s.type === "WORKING");
        if (!hasWorkingSet) continue;
        const m = specificMuscleFor(we.exercise.name);
        if (isPriorityMuscle(m)) hit.add(m);
      }
    }
    return hit;
  };

  const thisWeekSessions = last7.length;
  const thisWeekVolume = volumeIn(last7);
  const thisWeekPriorityMuscles = priorityMusclesHitIn(last7);
  const thisWeekMuscleGroups = thisWeekPriorityMuscles.size;

  // Average of previous 4 full weeks (5w → 1w ago), not the current week
  const prior4Start = subDays(new Date(), 35);
  const prior4End = subDays(new Date(), 7);
  const prior4Workouts = workouts.filter(
    (w) =>
      new Date(w.date) >= prior4Start && new Date(w.date) < prior4End
  );
  const avgWeeklyVolumePrior4 = volumeIn(prior4Workouts) / 4;

  const sessionsGoal = user?.trainingDays ?? 4;
  const volumeGoal =
    avgWeeklyVolumePrior4 > 0 ? avgWeeklyVolumePrior4 : thisWeekVolume || 5000;
  const muscleGroupsGoal = PRIORITY_MUSCLES.length;

  const prsThisWeek = prs.filter(
    (p) => new Date(p.date) >= subDays(new Date(), 7)
  ).length;

  // ---------- Goal progress ----------
  const goalsWithProgress: GoalWithProgress[] = goals.map((g) => {
    let currentValue = 0;
    let currentReps: number | null = null;

    if (g.type === "STRENGTH" && g.exerciseId) {
      // Match by id AND by near-identical exercise name so sets logged
      // against a duplicate/misspelled exercise row still count.
      const matchingExerciseIds = similarExerciseIds(
        g.exerciseId,
        g.exercise?.name ?? null,
        exercises
      );
      let bestWeight = 0;
      let bestReps: number | null = null;
      for (const w of workouts) {
        for (const ex of w.exercises) {
          if (!matchingExerciseIds.has(ex.exerciseId)) continue;
          for (const s of ex.sets) {
            if (s.type !== "WORKING") continue;
            const weight = s.weight ?? 0;
            const reps = s.reps ?? 0;
            if (g.targetReps != null && reps < g.targetReps) continue;
            // Tie-break on reps so 270×6 outranks 270×5 at the same load.
            if (
              weight > bestWeight ||
              (weight === bestWeight && reps > (bestReps ?? 0))
            ) {
              bestWeight = weight;
              bestReps = reps;
            }
          }
        }
      }
      currentValue = bestWeight;
      currentReps = bestReps;
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
    } else if (g.type === "STRENGTH" && g.targetReps != null && g.targetReps > 0) {
      // Estimated 1RM (Epley) on both sides so an extra rep at the
      // same load actually moves the bar — pure weight ratio would
      // miss progress like 270×5 → 270×6 against a 315×5 target.
      const targetOneRM = g.targetValue * (1 + g.targetReps / 30);
      const reps = currentReps ?? 0;
      const currentOneRM =
        currentValue > 0 && reps > 0 ? currentValue * (1 + reps / 30) : 0;
      progressPct = targetOneRM > 0 ? (currentOneRM / targetOneRM) * 100 : 0;
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
      targetReps: g.targetReps ?? null,
      unit: g.unit,
      deadline: g.deadline?.toISOString() ?? null,
      currentValue,
      currentReps,
      progressPct,
    };
  });

  const activeTargetCount = goalsWithProgress.length;
  const targetsAvgPct =
    activeTargetCount > 0
      ? goalsWithProgress.reduce(
          (sum, g) => sum + Math.min(100, Math.max(0, g.progressPct)),
          0
        ) / activeTargetCount
      : 0;

  // ---------- Weak spots ----------
  const weakSpots = computeWeakSpots(workouts, user);

  // ---------- Existing analytics ----------
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

  // Heal PR rows:
  //  1. Drop PRs whose workout has been deleted — their dates point at
  //     sessions that no longer exist.
  //  2. Realign PR.date to match the source workout's current date, in case
  //     the workout was edited/backdated after the PR was first recorded.
  const workoutById = new Map(workouts.map((w) => [w.id, w]));
  const orphanPrIds: string[] = [];
  const dateFixes: { id: string; date: Date }[] = [];
  const livePrsRaw: typeof prs = [];
  for (const pr of prs) {
    if (pr.workoutId) {
      const w = workoutById.get(pr.workoutId);
      if (!w) {
        orphanPrIds.push(pr.id);
        continue;
      }
      const wTime = new Date(w.date).getTime();
      if (new Date(pr.date).getTime() !== wTime) {
        dateFixes.push({ id: pr.id, date: w.date });
        livePrsRaw.push({ ...pr, date: w.date });
        continue;
      }
    }
    livePrsRaw.push(pr);
  }
  if (orphanPrIds.length > 0) {
    prisma.personalRecord
      .deleteMany({ where: { id: { in: orphanPrIds }, userId } })
      .catch(() => {});
  }
  if (dateFixes.length > 0) {
    Promise.all(
      dateFixes.map((f) =>
        prisma.personalRecord.update({
          where: { id: f.id },
          data: { date: f.date },
        })
      )
    ).catch(() => {});
  }
  const livePrs = livePrsRaw;

  const weightPRs = livePrs
    .filter((pr) => pr.type === "WEIGHT" && !isMachineExercise(pr.exercise.name))
    .reduce(
      (acc, pr) => {
        const key =
          normalizeExerciseName(pr.exercise.name) || pr.exerciseId;
        if (!acc[key] || pr.value > acc[key].value) {
          acc[key] = pr;
        }
        return acc;
      },
      {} as Record<string, (typeof prs)[0]>
    );
  const topPRs = Object.values(weightPRs)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // ---------- Projections (estimated 1RM via Epley) ----------
  // Base on the best working set per exercise where reps ≤ 10 (Epley is
  // unreliable at higher reps). Collapse near-duplicate exercise names so
  // minor misspellings don't split a lift across rows.
  const bestByExercise = new Map<
    string,
    { exerciseName: string; weight: number; reps: number; oneRM: number }
  >();
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (isMachineExercise(ex.exercise.name)) continue;
      const key =
        normalizeExerciseName(ex.exercise.name) || ex.exerciseId;
      for (const s of ex.sets) {
        if (s.type !== "WORKING") continue;
        const weight = s.weight ?? 0;
        const reps = s.reps ?? 0;
        if (weight <= 0 || reps <= 0 || reps > 10) continue;
        const oneRM = weight * (1 + reps / 30);
        const prev = bestByExercise.get(key);
        if (!prev || oneRM > prev.oneRM) {
          bestByExercise.set(key, {
            exerciseName: ex.exercise.name,
            weight,
            reps,
            oneRM,
          });
        }
      }
    }
  }
  const projections = [...bestByExercise.values()]
    .sort((a, b) => b.oneRM - a.oneRM)
    .slice(0, 5)
    .map((p) => ({
      exerciseName: p.exerciseName,
      baseWeight: p.weight,
      baseReps: p.reps,
      oneRepMax: p.oneRM,
    }));

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
          <ActivityRings
            sessions={thisWeekSessions}
            sessionsGoal={sessionsGoal}
            volume={thisWeekVolume}
            volumeGoal={volumeGoal}
            muscleGroups={thisWeekMuscleGroups}
            muscleGroupsGoal={muscleGroupsGoal}
            prsThisWeek={prsThisWeek}
            targetsAvgPct={targetsAvgPct}
            targetsCount={activeTargetCount}
          />

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

          <Projections items={projections} />

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

