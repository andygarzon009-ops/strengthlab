import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { findExistingExerciseByName } from "@/lib/exerciseIdentity";

// Hydrate the coach's planned-workout JSON into a payload the existing
// WorkoutForm can consume. Resolves exercise names against the user's
// pool (built-ins + their customs) and creates new custom rows for
// anything the coach invented that we don't have on file.

type PlanSet = {
  type?: "WARMUP" | "WORKING";
  weight?: number | string | null;
  reps?: number | string | null;
  rir?: number | string | null;
};

type PlanExercise = {
  name: string;
  sets: PlanSet[];
};

type PlanPayload = {
  title?: string;
  type?: string;
  split?: string | null;
  exercises: PlanExercise[];
};

const VALID_TYPES = new Set([
  "WEIGHT_TRAINING",
  "CALISTHENICS",
  "RUNNING",
  "CYCLING",
  "SWIMMING",
  "ROWING",
  "HIIT",
  "COMBAT",
  "MOBILITY",
  "SPORT",
  "OTHER",
]);
const VALID_SPLITS = new Set([
  "PUSH",
  "PULL",
  "LEGS",
  "UPPER",
  "LOWER",
  "ARMS",
  "FULL_BODY",
  "CORE",
]);

const toStr = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? String(n) : "";
};

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = (await req.json()) as { plan?: PlanPayload };
    const plan = body.plan;
    if (!plan || !Array.isArray(plan.exercises) || plan.exercises.length === 0) {
      return Response.json(
        { error: "Plan must include at least one exercise" },
        { status: 400 }
      );
    }

    const pool = await prisma.exercise.findMany({
      where: { OR: [{ ownerId: null }, { ownerId: userId }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const resolvedExercises: {
      exerciseId: string;
      exerciseName: string;
      notes: string;
      sets: {
        type: "WARMUP" | "WORKING";
        setNumber: number;
        weight: string;
        reps: string;
        rir: string;
        notes: string;
      }[];
    }[] = [];

    for (const ex of plan.exercises) {
      const name = ex.name?.trim();
      if (!name) continue;
      const sets = Array.isArray(ex.sets) ? ex.sets : [];
      if (sets.length === 0) continue;

      let match = findExistingExerciseByName(name, pool);
      if (!match) {
        const created = await prisma.exercise.create({
          data: { name, isCustom: true, ownerId: userId },
        });
        match = { id: created.id, name: created.name };
        pool.push(match);
      }

      resolvedExercises.push({
        exerciseId: match.id,
        exerciseName: match.name,
        notes: "",
        sets: sets.map((s, i) => ({
          type: s.type === "WARMUP" ? "WARMUP" : "WORKING",
          setNumber: i + 1,
          weight: toStr(s.weight),
          reps: toStr(s.reps),
          rir: toStr(s.rir),
          notes: "",
        })),
      });
    }

    if (resolvedExercises.length === 0) {
      return Response.json(
        { error: "No valid exercises in plan" },
        { status: 400 }
      );
    }

    const type =
      plan.type && VALID_TYPES.has(plan.type) ? plan.type : "WEIGHT_TRAINING";
    const split =
      plan.split && VALID_SPLITS.has(plan.split) ? plan.split : null;

    return Response.json({
      initial: {
        id: "",
        title: plan.title?.trim() || "Coach plan",
        type,
        split,
        date: new Date().toISOString(),
        notes: "",
        feeling: "",
        isDeload: false,
        exercises: resolvedExercises,
        duration: null,
        distance: null,
        pace: null,
        avgHeartRate: null,
        maxHeartRate: null,
        rounds: null,
        elevation: null,
        rpe: null,
      },
    });
  } catch (err) {
    console.error("coach-plan error:", err);
    const errMsg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: errMsg }, { status: 500 });
  }
}
