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

  // ---- Strength score series (current form, not all-time) ----
  // Each lift contributes its best est. 1RM from the trailing 6 weeks; the
  // score is the sum across lifts trained in that window, sampled weekly.
  // Unlike a running max it can fall — when recent sessions are lighter, or
  // when a lift goes untrained long enough that its peak ages out — so the
  // line shows when you're slipping, not just when you PR.
  const WINDOW_DAYS = 42;
  const windowMs = WINDOW_DAYS * 24 * 60 * 60 * 1000;

  // All working-set e1RM points per lift.
  const liftPoints = new Map<string, { t: number; e: number }[]>();
  for (const w of workouts) {
    const at = (w.endedAt ?? w.startedAt ?? w.date).getTime();
    for (const ex of w.exercises) {
      if (isMachineExercise(ex.exercise.name)) continue;
      const key = normalizeExerciseName(ex.exercise.name) || ex.exercise.id;
      for (const s of ex.sets) {
        if (s.type !== "WORKING") continue;
        const proj = e1rm(s.weight ?? 0, s.reps ?? 0);
        if (proj <= 0) continue;
        const arr = liftPoints.get(key);
        if (arr) arr.push({ t: at, e: proj });
        else liftPoints.set(key, [{ t: at, e: proj }]);
      }
    }
  }

  const points: ScorePoint[] = [];
  let activeLifts = 0;
  const allTimes = [...liftPoints.values()].flat().map((p) => p.t);
  if (allTimes.length > 0) {
    const nowMs = new Date().getTime();
    const firstT = Math.min(...allTimes);
    const sampleTimes: number[] = [];
    for (let t = nowMs; t >= firstT; t -= 7 * 24 * 60 * 60 * 1000) {
      sampleTimes.push(t);
    }
    sampleTimes.reverse(); // chronological
    let runningMax = 0;
    for (const t of sampleTimes) {
      let score = 0;
      let active = 0;
      for (const arr of liftPoints.values()) {
        let best = 0;
        for (const p of arr) {
          if (p.t <= t && p.t >= t - windowMs && p.e > best) best = p.e;
        }
        if (best > 0) {
          score += best;
          active++;
        }
      }
      if (score <= 0) continue;
      score = Math.round(score);
      const isPeak = score > runningMax + 0.5;
      if (isPeak) runningMax = score;
      points.push({ at: new Date(t).toISOString(), score, isPR: isPeak });
      activeLifts = active;
    }
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
        <StrengthScoreChart points={points} liftsTracked={activeLifts} />
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
