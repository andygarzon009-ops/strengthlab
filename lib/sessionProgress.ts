/// Per-session "did it go up?" for the feed's workout cards: each strength
/// session's headline lift (its heaviest working set), compared with the last
/// time that lift was trained, plus the lift's recent top-set trend.

import { prisma } from "@/lib/db";
import { formatPlates, isTimedExercise, shapeForType } from "@/lib/exercises";

const HISTORY_DAYS = 180;
const TREND_POINTS = 8;

export type SessionProgress = {
  lift: string;
  top: string; // "205 × 8" or "3 plates × 8"
  delta: string | null; // "↑ 10 lb", "↓ 1 rep", "= same"
  direction: "up" | "down" | "same" | null;
  trend: number[];
  isPR: boolean;
};

type FeedWorkout = {
  id: string;
  type: string;
  date: Date;
  exercises: {
    exerciseId: string;
    exercise: { name: string };
    sets: { type: string; weight: number | null; reps: number | null }[];
  }[];
};

export async function loadSessionProgress(
  userId: string,
  workouts: FeedWorkout[],
): Promise<Record<string, SessionProgress>> {
  // Headline lift per strength session.
  const heads = new Map<
    string,
    { exerciseId: string; name: string; weight: number; reps: number; date: Date }
  >();
  for (const w of workouts) {
    if (shapeForType(w.type) !== "STRENGTH") continue;
    let best: { exerciseId: string; name: string; weight: number; reps: number } | null = null;
    for (const ex of w.exercises) {
      if (isTimedExercise(ex.exercise.name)) continue;
      for (const s of ex.sets) {
        if (s.type !== "WORKING" || !s.weight || s.weight <= 0) continue;
        if (
          !best ||
          s.weight > best.weight ||
          (s.weight === best.weight && (s.reps ?? 0) > best.reps)
        ) {
          best = {
            exerciseId: ex.exerciseId,
            name: ex.exercise.name,
            weight: s.weight,
            reps: s.reps ?? 0,
          };
        }
      }
    }
    if (best) heads.set(w.id, { ...best, date: w.date });
  }
  if (heads.size === 0) return {};

  const exerciseIds = [...new Set([...heads.values()].map((h) => h.exerciseId))];
  const [history, prs] = await Promise.all([
    prisma.set.findMany({
      where: {
        type: "WORKING",
        weight: { gt: 0 },
        workoutExercise: {
          exerciseId: { in: exerciseIds },
          workout: {
            userId,
            date: { gte: new Date(Date.now() - HISTORY_DAYS * 86_400_000) },
          },
        },
      },
      select: {
        weight: true,
        reps: true,
        workoutExercise: {
          select: {
            exerciseId: true,
            workout: { select: { id: true, date: true } },
          },
        },
      },
    }),
    prisma.personalRecord.findMany({
      where: { userId, type: "WEIGHT", workoutId: { in: [...heads.keys()] } },
      select: { workoutId: true },
    }),
  ]);
  const prWorkouts = new Set(prs.map((p) => p.workoutId));

  // exerciseId → sessions (date-ordered) with their top set.
  const byExercise = new Map<
    string,
    Map<string, { date: Date; weight: number; reps: number }>
  >();
  for (const s of history) {
    const exId = s.workoutExercise.exerciseId;
    const w = s.workoutExercise.workout;
    const sessions = byExercise.get(exId) ?? new Map();
    byExercise.set(exId, sessions);
    const cur = sessions.get(w.id);
    const weight = s.weight ?? 0;
    const reps = s.reps ?? 0;
    if (!cur || weight > cur.weight || (weight === cur.weight && reps > cur.reps)) {
      sessions.set(w.id, { date: w.date, weight, reps });
    }
  }

  const out: Record<string, SessionProgress> = {};
  for (const [workoutId, h] of heads) {
    const sessions = [...(byExercise.get(h.exerciseId)?.entries() ?? [])]
      .map(([id, v]) => ({ id, ...v }))
      .filter((s) => s.date <= h.date)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const idx = sessions.findIndex((s) => s.id === workoutId);
    const prev = idx > 0 ? sessions[idx - 1] : null;

    let delta: string | null = null;
    let direction: SessionProgress["direction"] = null;
    if (prev) {
      const dw = Math.round((h.weight - prev.weight) * 10) / 10;
      const dr = h.reps - prev.reps;
      if (dw !== 0) {
        direction = dw > 0 ? "up" : "down";
        delta = `${dw > 0 ? "↑" : "↓"} ${Math.abs(dw)} lb`;
      } else if (dr !== 0) {
        direction = dr > 0 ? "up" : "down";
        delta = `${dr > 0 ? "↑" : "↓"} ${Math.abs(dr)} rep${Math.abs(dr) === 1 ? "" : "s"}`;
      } else {
        direction = "same";
        delta = "= same";
      }
    }

    const plates = formatPlates(h.name, h.weight);
    out[workoutId] = {
      lift: h.name,
      top: `${plates || h.weight} × ${h.reps || 1}`,
      delta,
      direction,
      // The lift's top sets up to and including this session.
      trend: sessions
        .slice(0, idx === -1 ? sessions.length : idx + 1)
        .slice(-TREND_POINTS)
        .map((s) => s.weight),
      isPR: prWorkouts.has(workoutId),
    };
  }
  return out;
}
