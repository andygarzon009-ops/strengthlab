import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { e1rm } from "@/lib/strengthProgression";
import { isMachineExercise } from "@/lib/exercises";
import { normalizeExerciseName } from "@/lib/exerciseIdentity";
import StrengthScoreChart, {
  type ScorePoint,
} from "@/components/StrengthScoreChart";
import Projections from "@/components/Projections";
import BackButton from "@/components/BackButton";

export const dynamic = "force-dynamic";

export default async function StrengthOverviewPage() {
  const userId = await requireAuth();

  const yearAgo = new Date(new Date().getTime() - 365 * 24 * 60 * 60 * 1000);
  const workouts = await prisma.workout.findMany({
    where: { userId, date: { gte: yearAgo } },
    select: {
      date: true,
      startedAt: true,
      endedAt: true,
      exercises: {
        select: {
          exercise: { select: { id: true, name: true } },
          sets: { select: { type: true, weight: true, reps: true } },
        },
      },
    },
    orderBy: { date: "asc" },
  });

  // ---- Projections list (best straight working set per lift, reps ≤ 10) ----
  const bestByExercise = new Map<
    string,
    { exerciseName: string; weight: number; reps: number; oneRM: number }
  >();
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (isMachineExercise(ex.exercise.name)) continue;
      const key = normalizeExerciseName(ex.exercise.name) || ex.exercise.id;
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
    .map((p) => ({
      exerciseName: p.exerciseName,
      baseWeight: p.weight,
      baseReps: p.reps,
      oneRepMax: p.oneRM,
    }));

  // ---- Strength score series ----
  // Combines every (non-machine) lift into one number: the running sum of
  // each lift's best est. 1RM so far. The line steps up whenever any lift
  // sets a new best, so it reads as "am I getting stronger overall."
  const bestByLift = new Map<string, number>();
  const points: ScorePoint[] = [];
  for (const w of workouts) {
    let newBest = false;
    for (const ex of w.exercises) {
      if (isMachineExercise(ex.exercise.name)) continue;
      const key = normalizeExerciseName(ex.exercise.name) || ex.exercise.id;
      for (const s of ex.sets) {
        if (s.type !== "WORKING") continue;
        const proj = e1rm(s.weight ?? 0, s.reps ?? 0);
        if (proj <= 0) continue;
        const prev = bestByLift.get(key) ?? 0;
        if (proj > prev + 0.5) {
          bestByLift.set(key, proj);
          newBest = true;
        }
      }
    }
    if (bestByLift.size === 0) continue;
    let score = 0;
    for (const v of bestByLift.values()) score += v;
    const at = (w.endedAt ?? w.startedAt ?? w.date).toISOString();
    points.push({ at, score: Math.round(score), isPR: newBest });
  }

  const hasData = points.length > 0;

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center gap-3 mb-5">
        <BackButton href="/consistency" ariaLabel="Back to progress" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-bold tracking-tight leading-none">
            Strength
          </h1>
          <p className="text-[12px] mt-1" style={{ color: "var(--fg-dim)" }}>
            Your overall strength trend across every lift
          </p>
        </div>
      </div>

      {hasData ? (
        <StrengthScoreChart points={points} liftsTracked={bestByLift.size} />
      ) : (
        <div
          className="rounded-2xl p-6 text-center"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
            Log some strength sessions and your overall strength trend will
            appear here.
          </p>
        </div>
      )}

      <div className="mt-4">
        <Projections items={projections} />
      </div>
    </div>
  );
}
