import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { e1rm } from "@/lib/strengthProgression";
import { isMachineExercise } from "@/lib/exercises";
import { normalizeExerciseName } from "@/lib/exerciseIdentity";
import StrengthScoreChart, {
  type ScorePoint,
} from "@/components/StrengthScoreChart";
import Projections from "@/components/Projections";
import { buildProjections } from "@/lib/projections";
import BackButton from "@/components/BackButton";
import TopLiftsCard from "@/components/TopLiftsCard";
import { mergeLiftsWithTargets } from "@/lib/strengthProgression";
import Link from "next/link";
import BodyScanCard from "@/components/BodyScanCard";

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
      type: true,
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
  const projections = buildProjections(workouts);

  // ---- Targets: same 12-week window the old Progress page used, so the
  // 4-week baseline and session counts read the same. ----
  const twelveWeeksAgo = new Date(new Date().getTime() - 12 * 7 * 86400_000);
  const [goals, exercises] = await Promise.all([
    prisma.goal.findMany({
      where: { userId, completed: false, exerciseId: { not: null } },
      select: { id: true, exerciseId: true, targetValue: true, targetReps: true },
    }),
    prisma.exercise.findMany({
      where: { OR: [{ ownerId: null }, { ownerId: userId }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const topLifts = mergeLiftsWithTargets(
    workouts.filter((w) => w.date >= twelveWeeksAgo),
    goals,
  );
  // Stub-row targets have no exercise name yet — backfill from the library.
  const nameById = new Map(exercises.map((e) => [e.id, e.name]));
  for (const l of topLifts) {
    if (l.sessions === 0 && nameById.has(l.exerciseId)) {
      l.name = nameById.get(l.exerciseId)!;
    }
  }

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
    <div className="max-w-lg mx-auto px-4 pt-8 pb-8">
      <div className="flex items-center gap-3 mb-5">
        <BackButton href="/" ariaLabel="Back to feed" />
        <h1 className="text-[22px] font-bold tracking-tight">Progress</h1>
      </div>

      {hasData ? (
        <StrengthScoreChart points={points} liftsTracked={activeLifts} />
      ) : (
        <div
          className="rounded-3xl p-6 text-center mb-4"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-strong)",
          }}
        >
          <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
            Log some strength sessions and your overall strength trend will
            appear here.
          </p>
        </div>
      )}

      <BodyScanCard userId={userId} />

      <Projections items={projections} />

      <div className="mt-4">
        <TopLiftsCard lifts={topLifts} exercises={exercises} />
      </div>

      <Link
        href="/consistency"
        className="mt-4 flex items-center justify-between rounded-2xl px-4 py-3.5"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-strong)",
        }}
      >
        <span>
          <span className="block text-[14px] font-semibold">This week &amp; coverage</span>
          <span className="block text-[12px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
            Week rhythm, muscles hit, weak spots
          </span>
        </span>
        <span className="text-[18px]" style={{ color: "var(--fg-muted)" }}>›</span>
      </Link>
    </div>
  );
}
