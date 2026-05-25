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

// Parse a JSON string into a WorkoutPlan, tolerating the most common model
// glitches (trailing commas before } or ]). Returns null unless the result
// is plan-shaped (object with a non-empty exercises array).
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
        return parsed;
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
