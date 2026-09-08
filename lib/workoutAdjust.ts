// Mid-session adjustments.
//
// The coach's ```workout-plan``` block always means "here is a NEW session" —
// tapping its button seeds a fresh draft and orphans whatever the athlete has
// half-logged. That's wrong for the most common thing an athlete says in the
// middle of a workout: "only got 6 on that last one, what now?". They don't
// want a second workout, they want THIS one rewritten from where they stand.
//
// So there's a second block, ```workout-adjust```, carrying the live session
// as it should now stand. It's applied to the workout already in progress:
// every set the athlete has already ticked off is locked and survives
// untouched, and only the work still ahead of them is replaced.

import type { WorkoutPlanSet } from "@/lib/workoutPlan";

export type WorkoutAdjustExercise = {
  name: string;
  restSeconds?: number;
  sets: WorkoutPlanSet[];
};

export type WorkoutAdjust = {
  // One-line summary of the change, shown on the apply button's card. The
  // coach's prose says the same thing; this is what the card headlines.
  note?: string;
  exercises: WorkoutAdjustExercise[];
};

// ── Parsing ────────────────────────────────────────────────────────────────

function normalizeAdjust(parsed: unknown): WorkoutAdjust | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p.exercises)) return null;
  const exercises: WorkoutAdjustExercise[] = [];
  for (const raw of p.exercises) {
    if (!raw || typeof raw !== "object") continue;
    const ex = raw as Record<string, unknown>;
    const name = typeof ex.name === "string" ? ex.name.trim() : "";
    if (!name) continue;
    const sets = (Array.isArray(ex.sets) ? ex.sets : []).filter(
      (s): s is WorkoutPlanSet => !!s && typeof s === "object",
    );
    if (sets.length === 0) continue;
    exercises.push({
      name,
      ...(typeof ex.restSeconds === "number"
        ? { restSeconds: ex.restSeconds }
        : {}),
      sets,
    });
  }
  if (exercises.length === 0) return null;
  return {
    ...(typeof p.note === "string" && p.note.trim()
      ? { note: p.note.trim().slice(0, 200) }
      : {}),
    exercises,
  };
}

// Deliberately NOT tryParsePlan: that runs ensureRampUpWarmup, which would
// staple a fresh empty-bar ramp onto a lift the athlete is already three sets
// into. Mid-session, the warm-up is behind them.
export function tryParseAdjust(jsonRaw: string): WorkoutAdjust | null {
  if (!jsonRaw) return null;
  const cleaned = jsonRaw.replace(/,(\s*[}\]])/g, "$1");
  for (const candidate of [jsonRaw, cleaned]) {
    try {
      const out = normalizeAdjust(JSON.parse(candidate));
      if (out) return out;
    } catch {
      // try the comma-stripped candidate
    }
  }
  return null;
}

// Strip the fenced workout-adjust block out of the displayed coach text and
// return what it carried. MUST run before extractPlan — extractPlan's
// second pass adopts any fenced block whose JSON has an `exercises` array,
// so an unstripped adjust block would render as a "Do this workout" button,
// which is precisely the bug this whole path exists to fix.
export function extractAdjust(raw: string): {
  text: string;
  adjust: WorkoutAdjust | null;
} {
  const fenceRe = /```[ \t]*workout[-_ ]?adjust[ \t]*\r?\n?/gi;
  let adjust: WorkoutAdjust | null = null;
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
      // Mid-stream: hide everything from the opening fence on, so the raw
      // JSON never flashes onscreen while it's still arriving.
      cursor = raw.length;
      break;
    }
    if (!adjust) adjust = tryParseAdjust(raw.slice(openEnd, closeAt).trim());
    cursor = closeAt + 3;
    fenceRe.lastIndex = cursor;
  }
  if (!sawFence) return { text: raw, adjust: null };
  kept.push(raw.slice(cursor));
  const text = kept
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n");
  return { text, adjust };
}

// ── Merging into the live session ──────────────────────────────────────────

/// Dispatched on `window` when the athlete applies a coach adjustment. A
/// mounted WorkoutForm takes it in memory and flips `detail.handled`; if
/// nothing answers, the caller falls back to rewriting the stored draft.
export const COACH_ADJUST_EVENT = "sl:coach-adjust";

export type DraftSet = {
  type: "WARMUP" | "WORKING" | "SUPERSET" | "DROP_SET";
  setNumber: number;
  weight: string;
  reps: string;
  rir: string;
  notes: string;
  completed?: boolean;
  loggedAt?: string;
};

export type DraftExercise = {
  exerciseId: string;
  exerciseName: string;
  notes: string;
  supersetGroup?: string | null;
  sets: DraftSet[];
};

function key(ex: { exerciseId: string; exerciseName: string }): string {
  return (
    ex.exerciseId ||
    ex.exerciseName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  );
}

function renumber(sets: DraftSet[]): DraftSet[] {
  return sets.map((s, i) => ({ ...s, setNumber: i + 1 }));
}

// Same set, as far as "did the coach re-emit the work I've already done"
// goes. Loose on type so a set the athlete reclassified still lines up.
function sameSet(a: DraftSet, b: DraftSet): boolean {
  const n = (v: string) => (v === "" ? null : parseFloat(v));
  return n(a.weight) === n(b.weight) && n(a.reps) === n(b.reps);
}

// How many of `incoming`'s leading sets are the already-done ones repeated
// back to us. The coach is asked to re-emit the full exercise including
// completed sets, but it sometimes sends only the work that remains — and
// getting that wrong either duplicates the sets the athlete just finished or
// silently eats one. Comparing the head of the list tells us which
// convention this reply used, so both land correctly.
function overlapWithDone(done: DraftSet[], incoming: DraftSet[]): number {
  if (done.length === 0) return 0;
  let n = 0;
  while (n < done.length && n < incoming.length && sameSet(done[n], incoming[n])) {
    n += 1;
  }
  // A partial match means the coach re-stated some of the finished work and
  // then diverged — treat the matched prefix as the overlap.
  return n;
}

/// Fold a coach adjustment into the session already in progress.
///
/// Every set the athlete has ticked off is untouchable: it's what actually
/// happened, and the coach doesn't get to rewrite history. Only the sets
/// still ahead of them are replaced. An exercise the coach drops disappears
/// unless it has completed sets, in which case it stays, trimmed to the work
/// that was really done. Exercises keep the order the athlete is training
/// them in; anything genuinely new lands at the end.
export function mergeCoachAdjust(
  current: DraftExercise[],
  incoming: DraftExercise[],
): DraftExercise[] {
  // Fold repeats of the same lift in the incoming list into one entry, so a
  // top set and its back-offs emitted as two objects don't fight over the
  // same slot.
  const byKey = new Map<string, DraftExercise>();
  const order: string[] = [];
  for (const ex of incoming) {
    if (!ex || !Array.isArray(ex.sets) || ex.sets.length === 0) continue;
    const k = key(ex);
    const seen = byKey.get(k);
    if (seen) seen.sets = [...seen.sets, ...ex.sets];
    else {
      byKey.set(k, { ...ex, sets: [...ex.sets] });
      order.push(k);
    }
  }

  const used = new Set<string>();
  const out: DraftExercise[] = [];

  for (const ex of current) {
    const k = key(ex);
    const done = ex.sets.filter((s) => s.completed);
    const next = byKey.get(k);

    if (!next) {
      // Coach removed this lift from the session. Work already logged stays.
      if (done.length > 0) out.push({ ...ex, sets: renumber(done) });
      continue;
    }
    used.add(k);

    const skip = overlapWithDone(done, next.sets);
    const remaining = next.sets.slice(skip);
    out.push({
      ...ex,
      exerciseName: next.exerciseName || ex.exerciseName,
      sets: renumber([...done, ...remaining]),
    });
  }

  for (const k of order) {
    if (used.has(k)) continue;
    const ex = byKey.get(k)!;
    out.push({ ...ex, notes: ex.notes ?? "", sets: renumber(ex.sets) });
  }

  return out;
}

// ── Chat-reported sets, into the live session ──────────────────────────────

/// Dispatched on `window` when the athlete confirms sets they reported in
/// chat. Same handshake as COACH_ADJUST_EVENT: a mounted WorkoutForm takes it
/// and flips `handled`.
export const COACH_LOG_EVENT = "sl:coach-log-sets";

export type ReportedExercise = {
  exerciseId: string;
  exerciseName: string;
  sets: { type: "WARMUP" | "WORKING"; weight: string; reps: string; rir: string }[];
};

/// Write sets the athlete reported in chat into the session in progress.
///
/// The set they're telling the coach about is, nearly always, a set already
/// sitting unchecked on their logger — the third of three, done at six reps
/// instead of eight. So each reported set fills the next unticked slot for
/// that lift and takes the numbers actually achieved, rather than piling a
/// fourth set onto a session that only ever had three. Only once the planned
/// slots run out does a set get appended, which is the right answer for extra
/// work and for a lift that wasn't on the card at all.
export function applyLoggedSets(
  current: DraftExercise[],
  reported: ReportedExercise[],
): DraftExercise[] {
  const loggedAt = new Date().toISOString();
  const out = current.map((ex) => ({ ...ex, sets: [...ex.sets] }));

  for (const rep of reported) {
    if (!rep || !Array.isArray(rep.sets) || rep.sets.length === 0) continue;
    const k = key(rep);
    let target = out.find((ex) => key(ex) === k);
    if (!target) {
      target = {
        exerciseId: rep.exerciseId,
        exerciseName: rep.exerciseName,
        notes: "",
        sets: [],
      };
      out.push(target);
    }
    for (const s of rep.sets) {
      const slot = target.sets.findIndex((x) => !x.completed);
      const filled: DraftSet = {
        type: s.type === "WARMUP" ? "WARMUP" : "WORKING",
        setNumber: 0,
        weight: s.weight ?? "",
        reps: s.reps ?? "",
        rir: s.rir ?? "",
        notes: slot >= 0 ? target.sets[slot].notes : "",
        completed: true,
        loggedAt,
      };
      if (slot >= 0) target.sets[slot] = filled;
      else target.sets.push(filled);
    }
    target.sets = renumber(target.sets);
  }

  return out;
}
