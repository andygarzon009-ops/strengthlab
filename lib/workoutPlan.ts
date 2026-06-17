// Shared parsing for the coach's structured workout-plan block. Used by
// both the client (to decide whether to render the "Do this workout"
// button) and the trainer API route (to decide whether the reply already
// carries a usable plan, or needs a synthesis rescue pass). Keeping one
// implementation guarantees the two sides agree on what counts as valid.

export type WorkoutPlanSet = {
  type?: "WARMUP" | "WORKING";
  weight?: number | string | null;
  reps?: number | string | null;
  rir?: number | string | null;
};

export type WorkoutPlan = {
  title?: string;
  type?: string;
  split?: string | null;
  exercises: {
    name: string;
    restSeconds?: number;
    sets: WorkoutPlanSet[];
  }[];
};

// Coerce a weight/reps field (number, "225", "225 lb") into a number.
function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// True for the session's main compound BARBELL lift — the movement that
// earns a ramp-up warm-up set. Deliberately excludes dumbbell, machine,
// cable, Smith, and single-leg variants (those don't get an auto warm-up),
// matching the coach prompt's "first heavy compound barbell lift" rule.
const NOT_BARBELL =
  /\b(dumbbell|db|machine|smith|cable|goblet|split|bulgarian|pistol|sissy|hack|landmine|arnold|kettlebell|kb|single[- ]?leg|leg press|chest[- ]?supported|seated)\b/;

export function isMainCompoundLift(name: string): boolean {
  const n = (name || "").toLowerCase();
  if (!n || NOT_BARBELL.test(n)) return false;
  if (/\bbench press\b/.test(n)) return true;
  if (/\bsquat\b/.test(n)) return true;
  if (/\bdeadlift\b/.test(n) || /\brdl\b/.test(n)) return true;
  if (/\b(overhead|military|shoulder|strict|push)\s+press\b/.test(n)) return true;
  if (/\bohp\b/.test(n)) return true;
  if (/\b(barbell|bent[- ]?over|pendlay|t[- ]?bar)\b[\s\S]*\brow\b/.test(n))
    return true;
  return false;
}

// Deterministic safeguard for the coach's ramp-up warm-up set. The system
// prompt asks the model to prepend ONE WARMUP set to the session's main
// compound barbell lift, but the model emits it inconsistently — so we
// guarantee it here, in the single parser every consumer (the "Do this
// workout" button, the pushed log, history hydration) flows through. Only
// the first qualifying barbell lift gets it, never accessories, and never
// when the coach already supplied a warm-up or the lift is unloaded.
export function ensureRampUpWarmup(plan: WorkoutPlan): WorkoutPlan {
  if (!plan || !Array.isArray(plan.exercises)) return plan;
  for (const ex of plan.exercises) {
    if (!ex || !Array.isArray(ex.sets)) continue;
    if (!isMainCompoundLift(ex.name)) continue;
    // Coach already put a warm-up on the main lift — respect it.
    if (ex.sets.some((s) => s?.type === "WARMUP")) return plan;
    const firstWorking = ex.sets.find((s) => s?.type !== "WARMUP");
    if (!firstWorking) return plan;
    const w = toNum(firstWorking.weight);
    // Bodyweight / unloaded / non-numeric load — no barbell ramp-up to add.
    if (!w || w <= 0) return plan;
    // ~50% of the working load, rounded to the nearest 5 lb, floored to the
    // empty 45 lb bar.
    const warmupWeight = Math.max(45, Math.round((w * 0.5) / 5) * 5);
    ex.sets = [{ type: "WARMUP", weight: warmupWeight, reps: 8 }, ...ex.sets];
    return plan; // only the first main compound lift earns it
  }
  return plan;
}

// Parse a JSON string into a WorkoutPlan, tolerating the most common model
// glitches (trailing commas before } or ]). Returns null unless the result
// is plan-shaped (object with a non-empty exercises array). A valid plan is
// passed through ensureRampUpWarmup so the main lift always carries its
// ramp-up set, regardless of whether the model remembered to emit one.
export function tryParsePlan(jsonRaw: string): WorkoutPlan | null {
  if (!jsonRaw) return null;
  const cleaned = jsonRaw.replace(/,(\s*[}\]])/g, "$1");
  for (const candidate of [jsonRaw, cleaned]) {
    try {
      const parsed = JSON.parse(candidate) as WorkoutPlan;
      if (
        parsed &&
        Array.isArray(parsed.exercises) &&
        parsed.exercises.length > 0
      ) {
        return ensureRampUpWarmup(parsed);
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

// Strip the fenced workout-plan block from displayed coach text and return
// the parsed plan if present. Tolerates streaming partials, fence-tag
// variants (workout-plan / workout_plan / workoutplan, any case), and also
// rescues plans the model emitted as a bare ```json block.
export function extractPlan(raw: string): {
  text: string;
  plan: WorkoutPlan | null;
} {
  // Pass 1 — workout-plan fences. There can be more than one: the model may
  // emit a malformed block AND the server may append a clean one as a
  // rescue. Strip every workout-plan block from the visible text, and adopt
  // the FIRST whose JSON actually parses, so a broken earlier block can't
  // mask a valid later one.
  const fenceRe = /```[ \t]*workout[-_ ]?plan[ \t]*\r?\n?/gi;
  let plan: WorkoutPlan | null = null;
  let sawFence = false;
  const kept: string[] = [];
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(raw)) !== null) {
    sawFence = true;
    const openStart = m.index;
    const openEnd = openStart + m[0].length;
    const closeAt = raw.indexOf("```", openEnd);
    kept.push(raw.slice(cursor, openStart));
    if (closeAt === -1) {
      // Still streaming — hide everything from the opening fence onward.
      cursor = raw.length;
      break;
    }
    if (!plan) plan = tryParsePlan(raw.slice(openEnd, closeAt).trim());
    cursor = closeAt + 3;
    fenceRe.lastIndex = cursor;
  }
  if (sawFence) {
    kept.push(raw.slice(cursor));
    const text = kept
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n\n");
    return { text, plan };
  }

  // Pass 2 — any fenced code block whose contents parse as a plan. Covers
  // the model using ```json or a bare ``` fence by accident. Only strip and
  // convert if the parse succeeds; otherwise the block stays visible.
  const anyFenceRe = /```[ \t]*[a-zA-Z0-9_-]*[ \t]*\r?\n?/g;
  while ((m = anyFenceRe.exec(raw)) !== null) {
    const openStart = m.index;
    const openEnd = openStart + m[0].length;
    const closeAt = raw.indexOf("```", openEnd);
    if (closeAt === -1) break;
    const parsed = tryParsePlan(raw.slice(openEnd, closeAt).trim());
    if (parsed) {
      const before = raw.slice(0, openStart).trimEnd();
      const after = raw.slice(closeAt + 3).trimStart();
      return {
        text: [before, after].filter(Boolean).join("\n\n"),
        plan: parsed,
      };
    }
    anyFenceRe.lastIndex = closeAt + 3;
  }

  return { text: raw, plan: null };
}

// True when the raw text already carries a parseable plan — i.e. the client
// would render a working "Do this workout" button. The trainer route uses
// this (not mere fence presence) to decide whether to run the rescue pass.
export function hasValidPlan(raw: string): boolean {
  return extractPlan(raw).plan !== null;
}
