/// The feed's "Start <split> day" session: the last session of that split,
/// re-prescribed for today instead of copied. Same lifts in the same order,
/// but every set's load, reps and RIR come from the block being run this week
/// and each lift's LAST — the rules the coach is given in its prompt
/// (lib/periodization.ts), applied deterministically so the button is instant
/// and two taps on the same morning agree.
///
/// Pure — the caller fetches the template, each lift's LAST and the block.

import { blockSpec } from "@/lib/periodization";
import { isMainCompoundLift, rampUpSets } from "@/lib/workoutPlan";
import {
  isBodyweightCapable,
  isTimedExercise,
  plateSides,
  usesPlates,
} from "@/lib/exercises";

export type PSet = {
  type: string;
  weight: number | null;
  reps: number | null;
  rir: number | null;
};

export type BlockKind =
  | "power"
  | "hypertrophy"
  | "strength"
  | "peaking"
  | "endurance"
  | "deload"
  | "generic";

export type PrescribeContext = {
  /// Null when the athlete hasn't set up a cycle.
  block: { kind: BlockKind; deloadPct: number } | null;
  /// Recovery band "low": hold loads and cut a set, as the Today card says.
  lowRecovery: boolean;
  /// Pounds. On a pull-up or dip the logged weight is what's ADDED, so the
  /// rep/load conversion has to count the athlete too. Null → 180.
  bodyweight?: number | null;
};

/// Which house prescription a block name resolves to. Goes through
/// blockSpec() so the matching rules exist in one place.
export function blockKindOf(name: string, isDeloadWeek: boolean): BlockKind {
  if (isDeloadWeek) return "deload";
  const head = blockSpec(name).detail.split("\n")[0];
  if (head.includes("POWER-BUILDING")) return "power";
  if (head.includes("HYPERTROPHY")) return "hypertrophy";
  if (head.includes("PURE STRENGTH")) return "strength";
  if (head.includes("PEAKING")) return "peaking";
  if (head.includes("ENDURANCE")) return "endurance";
  if (head.includes("DELOAD")) return "deload";
  return "generic";
}

// Multi-joint movements that can carry a top set when the day has no main
// barbell lift (a dumbbell push day, a pull-up pull day).
const COMPOUND =
  /\b(press|row|squat|deadlift|rdl|pull[- ]?ups?|chin[- ]?ups?|dips?|lunges?|hip thrust|clean|snatch|good ?morning)\b/i;
const ACCESSORY =
  /\b(calf|calves|curl|extension|raise|fly|flye|pushdown|kickback|shrug|face pull|tricep|triceps|skull|crunch|abduct|adduct)\b/i;

export function isOtherCompound(name: string): boolean {
  return COMPOUND.test(name) && !ACCESSORY.test(name);
}

export function isCompoundLift(name: string): boolean {
  return isMainCompoundLift(name) || isOtherCompound(name);
}

// ── Load arithmetic ─────────────────────────────────────────────────────────

const HEAVY_LOWER = /\b(squat|deadlift|rdl|hip thrust|good ?morning)\b/i;

/// One sensible jump: 10 lb on a barbell squat/hinge, a 10 a side on a
/// plate-loaded machine, 5 lb on everything else.
function loadStep(name: string): number {
  if (usesPlates(name)) return 10 * plateSides(name);
  if (HEAVY_LOWER.test(name) && !/\b(dumbbell|db|kettlebell|kb)\b/i.test(name))
    return 10;
  return 5;
}

const floor5 = (n: number) => Math.max(5, Math.floor(n / 5) * 5);

/// Estimated max from a set, counting the reps left in reserve (Epley).
const e1rm = (w: number, reps: number, rir: number) => w * (1 + (reps + rir) / 30);
const loadFor = (e1: number, reps: number, rir: number) =>
  e1 / (1 + (reps + rir) / 30);

type Scheme = { lo: number; hi: number; rir: number; count: number };

/// Where reps land converting into a range from outside it.
const landing = (s: Scheme) => s.lo + Math.floor((s.hi - s.lo) / 3);

/// Reps after a load jump off the top of the range: one fewer on heavy low-rep
/// work; on a wide range, what the old set's e1RM says the new load allows.
/// `bw` is the bodyweight a pull-up's added load sits on top of.
const afterJump = (s: Scheme, a: { w: number; reps: number; rir: number }, newW: number, bw: number) => {
  if (s.hi - s.lo < 4) return Math.max(s.lo, a.reps - 1);
  const e1 = e1rm(a.w + bw, a.reps, a.rir);
  const reps = Math.floor(30 * (e1 / (newW + bw) - 1) - s.rir);
  return clamp(Math.min(reps, a.reps - 1), s.lo, s.hi);
};

/// Next set from an anchor (a logged set), double-progression style — the
/// "BEAT THIS: more reps at W, or more load at ×reps" the coach is handed:
/// - in range, taken to RIR 0–1 → CEILING: hold, don't ask for more reps
/// - in range with 3+ in reserve → add load at the same reps
/// - at the top of the range → add load, reps drop back
/// - otherwise → same load, one more rep
/// - out of this block's range → convert through e1RM into it
/// `strict` (pure strength): load goes up only off an RIR 3+ LAST.
function progress(
  anchor: { w: number; reps: number; rir: number | null },
  s: Scheme,
  step: number,
  strict: boolean,
  hold: boolean,
  bw: number,
): { w: number; reps: number } {
  const rir = anchor.rir ?? 2;
  if (anchor.w <= 0) {
    // Bodyweight: reps are the only lever.
    return { w: 0, reps: hold || rir <= 1 ? anchor.reps : anchor.reps + 1 };
  }
  const inRange = anchor.reps >= s.lo && anchor.reps <= s.hi;
  let next: { w: number; reps: number };
  if (!inRange) {
    const reps = landing(s);
    const w = loadFor(e1rm(anchor.w + bw, anchor.reps, rir), reps, s.rir) - bw;
    next = { w: bw > 0 ? Math.max(0, Math.floor(w / 5) * 5) : floor5(w), reps };
  } else if (rir <= 1) {
    next = { w: anchor.w, reps: anchor.reps };
  } else if (rir >= 3) {
    next = { w: anchor.w + step, reps: anchor.reps };
  } else if (anchor.reps >= s.hi) {
    next = strict
      ? { w: anchor.w, reps: anchor.reps }
      : { w: anchor.w + step, reps: afterJump(s, { ...anchor, rir }, anchor.w + step, bw) };
  } else {
    next = { w: anchor.w, reps: anchor.reps + 1 };
  }
  if (hold && next.w > anchor.w) {
    next = { w: anchor.w, reps: inRange ? anchor.reps : next.reps };
  }
  return next;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/// The rep range a lift was already being trained in, for athletes with no
/// cycle configured — progress it in place rather than imposing one.
function bucketFor(reps: number): [number, number] {
  if (reps <= 5) return [3, 5];
  if (reps <= 10) return [6, 10];
  return [10, 15];
}

const WORKING_TYPES = new Set(["WORKING", "SUPERSET", "DROP_SET"]);

/// One exercise's sets for today. `last` is its most recent logged session's
/// sets; `template` the sets in the session being re-run (usually the same).
export function prescribeExercise(
  name: string,
  last: PSet[],
  template: PSet[],
  ctx: PrescribeContext,
  rampThis: boolean,
): PSet[] {
  const source = last.length ? last : template;
  const working = source.filter(
    (s) => WORKING_TYPES.has(s.type) && s.type !== "DROP_SET" && (s.reps ?? 0) > 0,
  );
  // Timed holds, cardio rows, or nothing usable to progress from: as logged.
  if (isTimedExercise(name) || working.length === 0) {
    return template.map((s) => ({ ...s }));
  }

  const setType = working[0].type === "SUPERSET" ? "SUPERSET" : "WORKING";
  const dropSets = source.filter((s) => s.type === "DROP_SET");
  const warmups = source.filter((s) => s.type === "WARMUP");
  const top = working.reduce((a, b) =>
    (b.weight ?? 0) > (a.weight ?? 0) ||
    ((b.weight ?? 0) === (a.weight ?? 0) && (b.reps ?? 0) > (a.reps ?? 0))
      ? b
      : a,
  );
  const anchor = { w: top.weight ?? 0, reps: top.reps ?? 0, rir: top.rir };
  const main = isMainCompoundLift(name);
  const compound = main || isOtherCompound(name);
  const step = loadStep(name);
  const bw = isBodyweightCapable(name) ? (ctx.bodyweight ?? 180) : 0;
  const hold = ctx.lowRecovery;
  const cut = (n: number) => (hold ? Math.max(1, n - 1) : n);
  const n = working.length;
  const kind = ctx.block?.kind ?? null;

  const straight = (s: Scheme, strict = false): PSet[] => {
    const p = progress(anchor, s, step, strict, hold, bw);
    return Array.from({ length: cut(s.count) }, () => ({
      type: setType,
      weight: p.w > 0 ? p.w : null,
      reps: p.reps,
      rir: s.rir,
    }));
  };

  // Heavy top set, then volume under it (power-building, peaking).
  const topAndBackoffs = (
    topS: Scheme,
    back: Scheme,
    backPct: number,
    ownTrack: boolean,
  ): PSet[] => {
    if (anchor.w <= 0) return straight({ ...back, count: back.count + 1 });
    const t = progress(anchor, topS, step, false, hold, bw);
    // Last session's back-offs, if it had any, progress on their own track —
    // in power-building. Peaking pins them to a share of the day's top.
    const lastBack = ownTrack
      ? working.filter(
          (s) => (s.weight ?? 0) > 0 && (s.weight ?? 0) < anchor.w * 0.85,
        )
      : [];
    let b: { w: number; reps: number };
    if (lastBack.length) {
      const hb = lastBack.reduce((a, c) => ((c.weight ?? 0) > (a.weight ?? 0) ? c : a));
      b = progress(
        { w: hb.weight ?? 0, reps: hb.reps ?? 0, rir: hb.rir },
        back,
        5,
        false,
        hold,
        bw,
      );
      if (b.w > t.w * (backPct + 0.05)) b = { ...b, w: floor5(t.w * backPct) };
    } else {
      b = { w: floor5(t.w * backPct), reps: landing(back) + 1 };
    }
    const backCount = cut(
      ownTrack ? clamp(lastBack.length || back.count, back.count, back.count + 1) : back.count,
    );
    return [
      { type: setType, weight: t.w, reps: t.reps, rir: topS.rir },
      ...Array.from({ length: backCount }, () => ({
        type: setType,
        weight: b.w,
        reps: b.reps,
        rir: back.rir,
      })),
    ];
  };

  let sets: PSet[];
  switch (kind) {
    // Top-set structure belongs to the main barbell lifts; other compounds
    // (leg press, dips, pull-ups) run straight sets between those and the
    // isolation work rather than testing a machine for a 3-rep max.
    case "power":
      sets = main
        ? topAndBackoffs(
            { lo: 3, hi: 5, rir: 2, count: 1 },
            { lo: 6, hi: 10, rir: 2, count: 3 },
            0.7,
            true,
          )
        : compound
          ? straight({ lo: 6, hi: 10, rir: 2, count: clamp(n, 3, 4) })
          : straight({ lo: 8, hi: 12, rir: 2, count: clamp(n, 2, 3) });
      break;
    case "hypertrophy":
      sets = compound
        ? straight({ lo: 6, hi: 12, rir: 2, count: clamp(n, 3, 4) })
        : straight({ lo: 8, hi: 12, rir: 2, count: 3 });
      break;
    case "strength":
      sets = main
        ? straight({ lo: 3, hi: 5, rir: 2, count: clamp(n, 3, 5) }, true)
        : compound
          ? straight({ lo: 6, hi: 10, rir: 2, count: clamp(n, 2, 3) }, true)
          : straight({ lo: 6, hi: 10, rir: 3, count: clamp(n, 2, 3) });
      break;
    case "peaking":
      sets = main
        ? topAndBackoffs(
            { lo: 1, hi: 2, rir: 2, count: 1 },
            { lo: 2, hi: 3, rir: 3, count: 2 },
            0.85,
            false,
          )
        : straight({ lo: 8, hi: 10, rir: 3, count: 2 }, true);
      break;
    case "endurance":
      sets = straight({ lo: 12, hi: 20, rir: 2, count: clamp(n, 3, 4) });
      break;
    case "deload": {
      // Set count comes out first; same load, two reps short → RIR 4+.
      const pct = ctx.block?.deloadPct ?? 40;
      const count = Math.max(1, Math.round(n * (1 - pct / 100)));
      // Already low-rep: shaving two would leave singles, so take ~25% off
      // the load instead and keep the reps.
      const lowRep = anchor.reps - 2 < 3;
      const w = lowRep && anchor.w > 0
        ? Math.max(0, Math.floor(((anchor.w + bw) * 0.75 - bw) / 5) * 5)
        : anchor.w;
      sets = Array.from({ length: count }, () => ({
        type: setType,
        weight: w > 0 ? w : null,
        reps: lowRep ? anchor.reps : anchor.reps - 2,
        rir: 4,
      }));
      break;
    }
    case "generic":
      sets = straight({ lo: 6, hi: 10, rir: 2, count: clamp(n, 3, 4) });
      break;
    default: {
      const [lo, hi] = bucketFor(anchor.reps);
      sets = straight({ lo, hi, rir: 2, count: n });
    }
  }

  if (kind !== "deload" && kind !== "peaking") {
    sets.push(...dropSets.map((s) => ({ ...s })));
  }

  // Warm-ups climb to today's first working weight, not last time's.
  const firstW = sets[0]?.weight ?? 0;
  if (isMainCompoundLift(name) && firstW > 0 && (warmups.length > 0 || rampThis)) {
    const ramp = rampUpSets(firstW).map((s) => ({
      type: "WARMUP",
      weight: Number(s.weight),
      reps: Number(s.reps),
      rir: null,
    }));
    return [...ramp, ...sets];
  }
  return [...warmups.map((s) => ({ ...s, rir: null })), ...sets];
}

/// Every exercise of the session. The first main barbell lift gets a ramp-up
/// even if last time's didn't — the coach is told to add one there too.
export function prescribeSession<
  E extends { name: string; last: PSet[]; template: PSet[] },
>(exercises: E[], ctx: PrescribeContext): (E & { sets: PSet[] })[] {
  let ramped = false;
  return exercises.map((e) => {
    const rampThis = !ramped && isMainCompoundLift(e.name);
    if (rampThis) ramped = true;
    return { ...e, sets: prescribeExercise(e.name, e.last, e.template, ctx, rampThis) };
  });
}
