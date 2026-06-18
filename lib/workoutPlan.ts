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

// Build a proper multi-set ramp-up to a barbell working weight — an empty-bar
// set, then progressively heavier singles/doubles/triples climbing toward
// (but never reaching) the working load, with descending reps. Mirrors how a
// real lifter ramps a main compound: e.g. to 275 → 45×10, 150×5, 190×3,
// 235×2, 255×1. Returns [] for loads too light to ramp.
function buildRampUpSets(working: number): WorkoutPlanSet[] {
  const round5 = (n: number) => Math.round(n / 5) * 5;
  const BAR = 45;
  const steps: { weight: number; reps: number }[] = [
    { weight: BAR, reps: 10 }, // empty bar
    { weight: round5(working * 0.55), reps: 5 },
    { weight: round5(working * 0.7), reps: 3 },
    { weight: round5(working * 0.85), reps: 2 },
    { weight: round5(working * 0.92), reps: 1 },
  ];
  const out: WorkoutPlanSet[] = [];
  let prev = 0;
  for (const s of steps) {
    // Strictly increasing, and every warm-up stays below the working weight.
    if (s.weight <= prev || s.weight >= working) continue;
    out.push({ type: "WARMUP", weight: s.weight, reps: s.reps });
    prev = s.weight;
  }
  return out;
}

// Deterministic safeguard for the coach's ramp-up warm-up. The system prompt
// asks the model to prepend a ramp to the session's main compound barbell
// lift, but the model emits it inconsistently — so we guarantee it here, in
// the single parser every consumer (the "Do this workout" button, the pushed
// log, history hydration) flows through. Only the first qualifying barbell
// lift gets it, never accessories, and never when the coach already supplied
// a warm-up or the lift is unloaded.
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
    const ramp = buildRampUpSets(w);
    if (ramp.length === 0) return plan; // too light to ramp
    ex.sets = [...ramp, ...ex.sets];
    return plan; // only the first main compound lift earns it
  }
  return plan;
}

// Sanitize a parsed plan into a shape every consumer can trust. The model
// drifts most when EDITING a prescription — asked to swap, remove, or
// reorder a lift it may leave a null hole in the exercises array, drop the
// sets key, or emit sets as a string ("3x5") instead of an array. Any of
// those crashes the render math (ex.sets.reduce / e.name) and white-screens
// the app. We drop non-object / nameless exercises and coerce sets to an
// array of set objects, so a botched edit degrades gracefully instead of
// taking down the chat. Returns null if nothing usable survives.
function normalizePlan(parsed: WorkoutPlan | null): WorkoutPlan | null {
  if (!parsed || !Array.isArray(parsed.exercises)) return null;
  const exercises = [];
  for (const ex of parsed.exercises) {
    if (!ex || typeof ex !== "object") continue;
    const name = typeof ex.name === "string" ? ex.name.trim() : "";
    if (!name) continue;
    const rawSets = Array.isArray(ex.sets) ? ex.sets : [];
    const sets = rawSets.filter(
      (s): s is WorkoutPlanSet => !!s && typeof s === "object"
    );
    exercises.push({
      name,
      ...(typeof ex.restSeconds === "number" ? { restSeconds: ex.restSeconds } : {}),
      sets,
    });
  }
  if (exercises.length === 0) return null;
  return { ...parsed, exercises };
}

// Parse a JSON string into a WorkoutPlan, tolerating the most common model
// glitches (trailing commas before } or ]). Returns null unless the result
// is plan-shaped (object with a non-empty exercises array). A valid plan is
// normalized (drop malformed exercises/sets) and passed through
// ensureRampUpWarmup so the main lift always carries its ramp-up set,
// regardless of whether the model remembered to emit one.
export function tryParsePlan(jsonRaw: string): WorkoutPlan | null {
  if (!jsonRaw) return null;
  const cleaned = jsonRaw.replace(/,(\s*[}\]])/g, "$1");
  for (const candidate of [jsonRaw, cleaned]) {
    try {
      const normalized = normalizePlan(JSON.parse(candidate) as WorkoutPlan);
      if (normalized) return ensureRampUpWarmup(normalized);
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
