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
  restSeconds?: number;
  sets: PlanSet[];
};

/// One item in a coach-prescribed warmup. Either timed (durationSec) for
/// holds + light cardio, or counted (reps) for activation drills like
/// band pull-aparts. `kind` is a soft hint used for grouping/icon only.
export type PlanWarmupItem = {
  kind?: "cardio" | "mobility" | "activation";
  name: string;
  durationSec?: number;
  reps?: number;
  instructions?: string;
};

export type PlanWarmup = {
  items: PlanWarmupItem[];
};

type PlanPayload = {
  title?: string;
  type?: string;
  split?: string | null;
  warmup?: PlanWarmup;
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

// Reps need extra tolerance: the model occasionally emits ranges
// ("8-12"), AMRAP words ("AMRAP", "max", "to failure"), or an object
// ({min,max,target}). Pull a usable positive integer out of anything we
// can; fall back to "" only when there's truly no number to extract.
const repsToStr = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? String(Math.round(v)) : "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["min", "target", "reps", "value", "max"]) {
      const inner = repsToStr(o[k]);
      if (inner) return inner;
    }
    return "";
  }
  const s = String(v).trim();
  if (!s) return "";
  // AMRAP / to-failure / max — no specific number prescribed. Default
  // to 8 so the athlete has a target in the field and can adjust live,
  // rather than staring at a blank reps box.
  if (/^(amrap|max|to failure|failure|until failure|as many as possible)\b/i.test(s)) {
    return "8";
  }
  // Range like "8-12", "8–12", "8 to 12" → lower bound.
  const range = s.match(/(\d+)\s*(?:[-–—]|to)\s*(\d+)/);
  if (range) return range[1];
  const m = s.match(/\d+/);
  return m ? m[0] : "";
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
    // restPrefs map mirrors the localStorage shape the rest pill reads
    // from (strengthlab.rest.byExercise.v1) — keyed by exerciseId so the
    // client can merge it in before the athlete opens the form.
    const restPrefs: Record<string, number> = {};
    const REST_VALUES = new Set([60, 90, 120, 180, 240]);

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
          reps: repsToStr(s.reps),
          rir: toStr(s.rir),
          notes: "",
        })),
      });

      const rawRest =
        typeof ex.restSeconds === "number"
          ? ex.restSeconds
          : ex.restSeconds
            ? parseInt(String(ex.restSeconds), 10)
            : NaN;

      let restValue: number | null = null;
      if (Number.isFinite(rawRest) && REST_VALUES.has(rawRest)) {
        restValue = rawRest;
      } else if (Number.isFinite(rawRest) && rawRest > 0) {
        // Snap to the nearest valid pill value so a model emitting 75
        // or 150 still enables the timer instead of dropping silently.
        restValue = [60, 90, 120, 180, 240].reduce((best, v) =>
          Math.abs(v - rawRest) < Math.abs(best - rawRest) ? v : best
        );
      } else {
        // Coach forgot restSeconds — fall through to a flat 2-minute
        // default. Predictable, the right ballpark for most working
        // sets, and the athlete can always cycle it on the card.
        restValue = 120;
      }
      if (restValue !== null) {
        restPrefs[match.id] = restValue;
      }
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

    // Sanitize the warmup block. Be tolerant of model drift — accept several
    // common synonyms for duration/reps so a slightly-off model output still
    // produces a usable warmup instead of silently dropping every item.
    let warmup: PlanWarmup | null = null;
    const rawWarmup = (plan as { warmup?: unknown }).warmup;
    if (rawWarmup && typeof rawWarmup === "object") {
      // Tolerate either { items: [...] } or a bare [...] in case the model
      // collapsed the wrapper.
      const rawItems = Array.isArray(rawWarmup)
        ? rawWarmup
        : Array.isArray((rawWarmup as { items?: unknown }).items)
          ? ((rawWarmup as { items: unknown[] }).items)
          : [];

      const items: PlanWarmupItem[] = [];
      let totalSec = 0;
      for (const r of rawItems) {
        const raw = r as Record<string, unknown>;
        const name = typeof raw?.name === "string" ? raw.name.trim() : "";
        if (!name) continue;

        // Accept durationSec | duration | seconds | time. If it's a string
        // like "3 min" pull the number out.
        const durCandidate =
          raw.durationSec ?? raw.duration ?? raw.seconds ?? raw.time ?? raw.timeSec;
        let durationSec: number | undefined;
        if (typeof durCandidate === "number" && durCandidate > 0) {
          durationSec = Math.round(durCandidate);
        } else if (typeof durCandidate === "string") {
          const m = durCandidate.match(/(\d+(?:\.\d+)?)\s*(min|m)\b/i);
          const numMatch = durCandidate.match(/(\d+(?:\.\d+)?)/);
          if (m) durationSec = Math.round(parseFloat(m[1]) * 60);
          else if (numMatch) durationSec = Math.round(parseFloat(numMatch[1]));
        }
        if (durationSec !== undefined) {
          durationSec = Math.min(600, Math.max(1, durationSec));
        }

        const repsCandidate = raw.reps ?? raw.repetitions ?? raw.count;
        let reps: number | undefined;
        if (typeof repsCandidate === "number" && repsCandidate > 0) {
          reps = Math.round(repsCandidate);
        } else if (typeof repsCandidate === "string") {
          const m = repsCandidate.match(/\d+/);
          if (m) reps = parseInt(m[0]);
        }

        if (!durationSec && !reps) continue;
        if (durationSec) {
          if (totalSec + durationSec > 600) continue;
          totalSec += durationSec;
        }
        items.push({
          kind:
            raw.kind === "cardio" || raw.kind === "mobility" || raw.kind === "activation"
              ? (raw.kind as PlanWarmupItem["kind"])
              : undefined,
          name,
          durationSec,
          reps,
          instructions:
            typeof raw.instructions === "string"
              ? raw.instructions.slice(0, 200)
              : undefined,
        });
      }
      if (items.length > 0) warmup = { items };
    }

    // Logged so we can see in Vercel runtime logs whether the model is
    // actually emitting the warmup block as instructed.
    console.log("coach-plan warmup:", {
      raw: rawWarmup,
      sanitized: warmup,
    });

    return Response.json({
      restPrefs,
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
        warmup,
        duration: null,
        distance: null,
        pace: null,
        avgHeartRate: null,
        maxHeartRate: null,
        rounds: null,
        elevation: null,
        rpe: null,
        fromCoachPlan: true,
      },
    });
  } catch (err) {
    console.error("coach-plan error:", err);
    const errMsg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: errMsg }, { status: 500 });
  }
}
