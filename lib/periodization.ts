/// Block periodization: where the athlete is in their training cycle, computed
/// rather than inferred.
///
/// The coach can already be *told* how to periodize (the athlete's coaching
/// instructions are injected as hard overrides), but it had no way to work out
/// which block it was in — its deepest view is the last 30 workouts, and
/// nothing marked a block start or a deload. Asking a model to infer "week 5 of
/// hypertrophy, deload due" from a handful of top sets produces a confident
/// answer that is frequently wrong, which is worse than no answer at all.
///
/// So the athlete declares the cycle, and this module resolves it to a week.
/// Pure — no IO, no dates from the environment beyond what callers pass in — so
/// the coach, the UI, and tests all agree on the same arithmetic.

export type PeriodizationBlock = {
  name: string;
  weeks: number;
};

export type PeriodizationConfig = {
  /// The cycle, in order. It repeats once the last block finishes.
  blocks: PeriodizationBlock[];
  /// Local calendar date (YYYY-MM-DD) of the first day of week 1.
  startDate: string;
  /// Insert a deload every N *training* weeks. Null disables scheduled deloads.
  deloadEveryWeeks: number | null;
  /// How much to pull back in a deload week, as a percentage of normal work.
  deloadReductionPct: number;
};

export type PeriodizationState = {
  /// Weeks since the cycle started, 1-based, counting deloads.
  weekNumber: number;
  /// The block being run this week — or "Deload" during a deload week.
  blockName: string;
  isDeloadWeek: boolean;
  /// Position within the current block, ignoring deload weeks. Both 0 during a
  /// deload week, when the block is paused rather than progressing.
  weekInBlock: number;
  blockWeeks: number;
  /// Training weeks until the next scheduled deload; 0 means this week is one.
  /// Null when no deload cadence is configured.
  weeksUntilDeload: number | null;
  /// What comes after this week — the same block, the next one, or a deload.
  nextUp: string;
};

/// The default cycle, matching the classic power-building rotation: a
/// power-building block, then hypertrophy, then pure strength, then hypertrophy
/// again, with a deload every 7 training weeks.
export const DEFAULT_PERIODIZATION: PeriodizationConfig = {
  blocks: [
    { name: "Power-building", weeks: 4 },
    { name: "Hypertrophy", weeks: 4 },
    { name: "Pure strength", weeks: 4 },
    { name: "Hypertrophy", weeks: 4 },
  ],
  startDate: "",
  deloadEveryWeeks: 7,
  deloadReductionPct: 40,
};

const MAX_WEEKS = 520; // a decade — a runaway-loop backstop, not a real limit

export function isValidConfig(
  c: PeriodizationConfig | null | undefined,
): c is PeriodizationConfig {
  return (
    !!c &&
    Array.isArray(c.blocks) &&
    c.blocks.length > 0 &&
    c.blocks.every((b) => !!b.name?.trim() && Number.isFinite(b.weeks) && b.weeks > 0) &&
    typeof c.startDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(c.startDate)
  );
}

/// Whole weeks between two local calendar dates. Both are parsed at UTC noon so
/// neither daylight saving nor the athlete's timezone can shift the boundary.
export function weeksBetween(startDate: string, onDate: string): number {
  const a = Date.parse(`${startDate}T12:00:00Z`);
  const b = Date.parse(`${onDate}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / (7 * 86_400_000));
}

/// Resolves the cycle to the week containing `onDate`.
///
/// Deloads are *inserted* between training weeks rather than consuming one:
/// during a deload the block pauses and resumes where it left off, which is how
/// the athlete described it ("deload every ~6–8 weeks" running across blocks
/// rather than being carved out of one). Walking the weeks one at a time is
/// what keeps that honest — with an inserted week the position isn't a modulo,
/// because deloads and block boundaries drift relative to each other.
export function periodizationState(
  config: PeriodizationConfig,
  onDate: string,
): PeriodizationState | null {
  if (!isValidConfig(config)) return null;
  const elapsed = weeksBetween(config.startDate, onDate);
  if (elapsed < 0) return null; // cycle hasn't started yet

  const deloadEvery =
    config.deloadEveryWeeks && config.deloadEveryWeeks > 0
      ? config.deloadEveryWeeks
      : null;

  let blockIdx = 0;
  let weekInBlock = 0; // completed weeks of the current block
  let sinceDeload = 0; // training weeks since the last deload

  // Replay every week up to and including the target so the state is the
  // product of the whole history, not a formula that assumes nothing shifted.
  for (let w = 0; w <= Math.min(elapsed, MAX_WEEKS); w++) {
    const isDeload = deloadEvery != null && sinceDeload >= deloadEvery;

    if (w === elapsed) {
      const block = config.blocks[blockIdx];
      if (isDeload) {
        return {
          weekNumber: elapsed + 1,
          blockName: "Deload",
          isDeloadWeek: true,
          weekInBlock: 0,
          blockWeeks: 0,
          weeksUntilDeload: 0,
          nextUp: `${block.name} week ${weekInBlock + 1} of ${block.weeks}`,
        };
      }
      const nextIsDeload = deloadEvery != null && sinceDeload + 1 >= deloadEvery;
      const finishesBlock = weekInBlock + 1 >= block.weeks;
      const nextBlock = config.blocks[(blockIdx + 1) % config.blocks.length];
      return {
        weekNumber: elapsed + 1,
        blockName: block.name,
        isDeloadWeek: false,
        weekInBlock: weekInBlock + 1,
        blockWeeks: block.weeks,
        weeksUntilDeload: deloadEvery != null ? deloadEvery - sinceDeload - 1 : null,
        nextUp: nextIsDeload
          ? "Deload week"
          : finishesBlock
            ? `${nextBlock.name} week 1 of ${nextBlock.weeks}`
            : `${block.name} week ${weekInBlock + 2} of ${block.weeks}`,
      };
    }

    // Advance past week w.
    if (isDeload) {
      sinceDeload = 0; // the block is paused, not advanced
    } else {
      sinceDeload++;
      weekInBlock++;
      if (weekInBlock >= config.blocks[blockIdx].weeks) {
        weekInBlock = 0;
        blockIdx = (blockIdx + 1) % config.blocks.length;
      }
    }
  }
  return null;
}

/// One-line summary for the coach prompt, e.g.
/// "Week 9 — Hypertrophy, week 1 of 4. 3 training weeks until the next deload."
export function describeState(
  state: PeriodizationState,
  config: PeriodizationConfig,
): string {
  if (state.isDeloadWeek) {
    return (
      `Week ${state.weekNumber} — DELOAD WEEK. Cut working weight and/or volume by ` +
      `~${config.deloadReductionPct}% and use the lighter sets to clean up technique. ` +
      `Next up: ${state.nextUp}.`
    );
  }
  const deload =
    state.weeksUntilDeload == null
      ? "No scheduled deload."
      : state.weeksUntilDeload === 0
        ? "Next week is a deload."
        : `${state.weeksUntilDeload} training week${state.weeksUntilDeload === 1 ? "" : "s"} until the next deload.`;
  return (
    `Week ${state.weekNumber} — ${state.blockName} block, week ${state.weekInBlock} of ` +
    `${state.blockWeeks}. ${deload} Next up: ${state.nextUp}.`
  );
}
