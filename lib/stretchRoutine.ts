// Shared parsing for the coach's structured stretch-routine block. Mirrors
// lib/workoutPlan.ts: one implementation used by both the client (to decide
// whether to render the "Do this stretching routine" button) and, if ever
// needed, the trainer API route — so the two sides always agree on what
// counts as a valid routine.
//
// A routine is a short, hands-free sequence the athlete performs live: each
// item is a timed hold/movement, with a little rest between so they can move
// into the next position. Items can be static stretches, dynamic mobility
// drills, foam rolling / soft-tissue work, or breathing — whatever the coach
// prescribed for the athlete's soreness, prehab goal, or time budget. Per-side
// items (hamstring stretch, quad foam roll) get done left then right with a
// quick switch in between.

export type StretchSide = "both" | "left" | "right";

// The modality of an item — drives the label/color in the live player so a
// mixed routine (foam roll → dynamic → static) reads clearly. Everything is
// still timed; "dynamic" just means keep moving for the window rather than
// holding a position.
export type StretchKind = "static" | "dynamic" | "foamroll" | "breathing";

export type Stretch = {
  name: string;
  durationSec: number; // hold/work time per side, clamped 5–300
  side?: StretchSide | null; // "both" = do left then right; null/undefined = symmetric, once
  kind?: StretchKind | null; // modality label; defaults to a plain static hold
  instructions?: string;
};

export type StretchRoutine = {
  title?: string;
  // Rest between distinct stretches (transition time to reposition), seconds.
  restSec?: number;
  stretches: Stretch[];
};

// Default rest windows (seconds). restSec is the gap between two different
// stretches; SWITCH_SEC is the shorter gap between the left and right side of
// the SAME stretch; GET_READY_SEC leads into the very first hold so the
// athlete has time to get into position before the clock moves.
export const DEFAULT_REST_SEC = 15;
export const SWITCH_SEC = 7;
export const GET_READY_SEC = 10;

const VALID_SIDES = new Set<StretchSide>(["both", "left", "right"]);
const VALID_KINDS = new Set<StretchKind>([
  "static",
  "dynamic",
  "foamroll",
  "breathing",
]);

// Map the model's likely kind synonyms onto our set so a "mobility" or
// "smr"/"roll" tag still colors correctly instead of falling back to static.
function coerceKind(v: unknown): StretchKind | null {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase().replace(/[\s_-]/g, "");
  if (VALID_KINDS.has(k as StretchKind)) return k as StretchKind;
  if (k === "mobility" || k === "movement" || k === "activation") return "dynamic";
  if (k === "foamrolling" || k === "smr" || k === "roll" || k === "release")
    return "foamroll";
  if (k === "breath" || k === "breathwork" || k === "downregulation") return "breathing";
  if (k === "hold" || k === "stretch") return "static";
  return null;
}

function clampDuration(v: unknown): number | null {
  let n: number | null = null;
  if (typeof v === "number" && Number.isFinite(v)) n = v;
  else if (typeof v === "string") {
    const p = parseFloat(v.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(p)) n = p;
  }
  if (n === null || n <= 0) return null;
  return Math.min(300, Math.max(5, Math.round(n)));
}

// Normalize a parsed routine into a shape every consumer can trust. Drops
// nameless / durationless stretches (a stretch with no hold time is useless)
// and coerces side into the known set. Returns null if nothing usable
// survives — same contract as normalizePlan in workoutPlan.ts.
function normalizeRoutine(parsed: unknown): StretchRoutine | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (!Array.isArray(o.stretches)) return null;

  const stretches: Stretch[] = [];
  for (const raw of o.stretches) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    const name = typeof s.name === "string" ? s.name.trim().slice(0, 80) : "";
    if (!name) continue;
    const durationSec = clampDuration(s.durationSec ?? s.duration ?? s.seconds);
    if (durationSec === null) continue;
    const side =
      typeof s.side === "string" && VALID_SIDES.has(s.side as StretchSide)
        ? (s.side as StretchSide)
        : s.side === "each" // tolerate the model saying "each"
          ? "both"
          : null;
    const kind = coerceKind(s.kind);
    const instructions =
      typeof s.instructions === "string"
        ? s.instructions.trim().slice(0, 200) || undefined
        : undefined;
    stretches.push({ name, durationSec, side, kind, instructions });
  }
  if (stretches.length === 0) return null;

  const restSec =
    typeof o.restSec === "number" && o.restSec >= 0
      ? Math.min(60, Math.round(o.restSec))
      : DEFAULT_REST_SEC;
  const title =
    typeof o.title === "string" ? o.title.trim().slice(0, 80) || undefined : undefined;

  return { title, restSec, stretches: stretches.slice(0, 20) };
}

// Parse a JSON string into a StretchRoutine, tolerating the most common model
// glitch (trailing commas). Returns null unless the result is routine-shaped.
export function tryParseRoutine(jsonRaw: string): StretchRoutine | null {
  if (!jsonRaw) return null;
  const cleaned = jsonRaw.replace(/,(\s*[}\]])/g, "$1");
  for (const candidate of [jsonRaw, cleaned]) {
    try {
      const normalized = normalizeRoutine(JSON.parse(candidate));
      if (normalized) return normalized;
    } catch {
      // try next candidate
    }
  }
  return null;
}

// Strip the fenced stretch-routine block from displayed coach text and return
// the parsed routine if present. Tolerates streaming partials and fence-tag
// variants (stretch-routine / stretch_routine / stretchroutine, any case).
// Mirrors extractPlan's Pass 1 in workoutPlan.ts.
export function extractStretchRoutine(raw: string): {
  text: string;
  routine: StretchRoutine | null;
} {
  const fenceRe = /```[ \t]*stretch[-_ ]?routine[ \t]*\r?\n?/gi;
  let routine: StretchRoutine | null = null;
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
    if (!routine) routine = tryParseRoutine(raw.slice(openEnd, closeAt).trim());
    cursor = closeAt + 3;
    fenceRe.lastIndex = cursor;
  }
  if (!sawFence) return { text: raw, routine: null };
  kept.push(raw.slice(cursor));
  const text = kept
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n");
  return { text, routine };
}

// True when the raw text already carries a parseable routine.
export function hasValidRoutine(raw: string): boolean {
  return extractStretchRoutine(raw).routine !== null;
}

// --- Live player step expansion -----------------------------------------
// The player is fully hands-free after the first tap: it walks a flat list of
// timed steps. A "hold" is the stretch itself; a "rest" is the gap before it
// (get-ready before the first, a transition before each later stretch, and a
// quick switch between the two sides of a per-side stretch). Building the
// sequence here (not in the component) keeps it testable and lets both the
// player and the summary agree on total duration.

export type StretchStep =
  | {
      kind: "hold";
      name: string;
      durationSec: number;
      side?: "left" | "right" | null;
      modality?: StretchKind | null; // the item's kind (static/dynamic/foamroll/breathing)
      instructions?: string;
      stretchIndex: number; // which stretch (0-based) this hold belongs to
    }
  | {
      kind: "rest";
      durationSec: number;
      // What the athlete should be moving into during this rest.
      nextName: string;
      nextSide?: "left" | "right" | null;
      variant: "getReady" | "transition" | "switch";
      stretchIndex: number; // the stretch this rest leads into
    };

export function buildStretchSteps(routine: StretchRoutine): StretchStep[] {
  const rest = routine.restSec ?? DEFAULT_REST_SEC;
  const steps: StretchStep[] = [];

  routine.stretches.forEach((s, i) => {
    const perSide = s.side === "both";
    // Lead-in rest before this stretch: get-ready for the very first, a normal
    // transition otherwise. A zero rest still gets a get-ready lead-in so the
    // athlete isn't thrown straight into the first hold cold.
    if (i === 0) {
      steps.push({
        kind: "rest",
        durationSec: GET_READY_SEC,
        nextName: s.name,
        nextSide: perSide
          ? "left"
          : s.side === "left" || s.side === "right"
            ? s.side
            : null,
        variant: "getReady",
        stretchIndex: i,
      });
    } else if (rest > 0) {
      steps.push({
        kind: "rest",
        durationSec: rest,
        nextName: s.name,
        nextSide: perSide
          ? "left"
          : s.side === "left" || s.side === "right"
            ? s.side
            : null,
        variant: "transition",
        stretchIndex: i,
      });
    }

    if (perSide) {
      steps.push({
        kind: "hold",
        name: s.name,
        durationSec: s.durationSec,
        side: "left",
        modality: s.kind,
        instructions: s.instructions,
        stretchIndex: i,
      });
      steps.push({
        kind: "rest",
        durationSec: SWITCH_SEC,
        nextName: s.name,
        nextSide: "right",
        variant: "switch",
        stretchIndex: i,
      });
      steps.push({
        kind: "hold",
        name: s.name,
        durationSec: s.durationSec,
        side: "right",
        modality: s.kind,
        instructions: s.instructions,
        stretchIndex: i,
      });
    } else {
      steps.push({
        kind: "hold",
        name: s.name,
        durationSec: s.durationSec,
        side: s.side === "left" || s.side === "right" ? s.side : null,
        modality: s.kind,
        instructions: s.instructions,
        stretchIndex: i,
      });
    }
  });

  return steps;
}

// Rough total wall-clock seconds for the whole routine (for the summary line).
export function routineDurationSec(routine: StretchRoutine): number {
  return buildStretchSteps(routine).reduce((sum, s) => sum + s.durationSec, 0);
}
