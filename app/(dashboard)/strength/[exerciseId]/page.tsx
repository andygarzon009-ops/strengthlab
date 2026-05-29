import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { e1rm } from "@/lib/strengthProgression";
import { buildLiftCoachInsight } from "@/lib/coachInsights";
import LiftDrilldownChart from "@/components/LiftDrilldownChart";
import CoachInsightCard from "@/components/CoachInsightCard";
import BackButton from "@/components/BackButton";

export const dynamic = "force-dynamic";

type SessionRow = {
  workoutId: string;
  at: string; // ISO
  topWeight: number;
  topReps: number;
  topE1rm: number;
  isPR: boolean;
  // Every working set's e1rm for the volume-aware scatter overlay.
  setE1rms: number[];
};

export default async function LiftDrilldownPage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const userId = await requireAuth();
  const { exerciseId: encoded } = await params;
  const exerciseId = decodeURIComponent(encoded);

  const exercise = await prisma.exercise.findFirst({
    where: {
      id: exerciseId,
      OR: [{ ownerId: null }, { ownerId: userId }],
    },
    select: { id: true, name: true, muscleGroup: true },
  });
  if (!exercise) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
        <p className="text-[14px]" style={{ color: "var(--fg-dim)" }}>
          Lift not found.
        </p>
        <Link href="/consistency" className="text-[12px] underline">
          ← Back
        </Link>
      </div>
    );
  }

  // Pull a full year of sessions so W/M/Y all render from the same data.
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const workouts = await prisma.workout.findMany({
    where: {
      userId,
      date: { gte: yearAgo },
      exercises: { some: { exerciseId } },
    },
    select: {
      id: true,
      date: true,
      startedAt: true,
      endedAt: true,
      title: true,
      exercises: {
        where: { exerciseId },
        select: {
          sets: { select: { type: true, weight: true, reps: true } },
        },
      },
    },
    orderBy: { date: "asc" },
  });

  // Build per-session top-set point + running PR marker, plus an array of
  // every working set's e1rm so the chart can render volume sessions as a
  // vertical column of dots.
  const sessions: SessionRow[] = [];
  let runningMax = 0;
  for (const w of workouts) {
    let topE1 = 0;
    let topWeight = 0;
    let topReps = 0;
    const setE1rms: number[] = [];
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        if (s.type === "WARMUP") continue;
        const weight = s.weight ?? 0;
        const reps = s.reps ?? 0;
        if (weight <= 0 || reps <= 0) continue;
        const proj = e1rm(weight, reps);
        setE1rms.push(proj);
        if (proj > topE1) {
          topE1 = proj;
          topWeight = weight;
          topReps = reps;
        }
      }
    }
    if (topE1 <= 0) continue;
    const at = w.endedAt ?? w.startedAt ?? w.date;
    const isPR = topE1 > runningMax + 0.5; // half-lb buffer for rounding
    if (isPR) runningMax = topE1;
    sessions.push({
      workoutId: w.id,
      at: at.toISOString(),
      topWeight,
      topReps,
      topE1rm: Math.round(topE1 * 10) / 10,
      isPR,
      setE1rms: setE1rms.map((v) => Math.round(v * 10) / 10),
    });
  }

  const coachInsight = buildLiftCoachInsight(sessions, exercise.name);

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center gap-3 mb-5">
        <BackButton href="/consistency" ariaLabel="Back to rhythm" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] font-bold tracking-tight leading-snug truncate">
            {exercise.name}
          </h1>
          {exercise.muscleGroup && (
            <p
              className="text-[11px] mt-0.5"
              style={{ color: "var(--fg-dim)" }}
            >
              {exercise.muscleGroup}
            </p>
          )}
        </div>
      </div>

      {coachInsight && <CoachInsightCard insight={coachInsight} />}

      <LiftDrilldownChart sessions={sessions} />
    </div>
  );
}
