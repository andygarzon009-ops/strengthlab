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
  /// Index of that block in `config.blocks`. Needed because a cycle may run
  /// the same block name twice (the default runs Hypertrophy at 2 and 4), so
  /// the name alone can't identify which one this week belongs to. During a
  /// deload it is the index of the paused block that resumes afterwards.
  blockIndex: number;
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
          blockIndex: blockIdx,
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
        blockIndex: blockIdx,
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

// ─────────────────────────────────────────────────────────────────────────────
// Block specifications: what each block actually means in sets, reps and load.
//
// The prompt used to compress this to a single line ("Power-building = a heavy
// top set in the 3–5 range before normal volume work"), which named the rep
// range and left everything that decides whether a session is actually a
// power-building session — back-off load, rest, weekly set count, how to
// progress week to week — for the model to improvise. It improvised
// differently every time, so two Tuesdays in the same block could come back
// with 5×5 at RIR3 and 3×12 at RIR0.
//
// Note on how loads are expressed. The coach does NOT receive a 1RM or an
// e1RM for any lift — its load evidence is the logged top sets in the
// PROGRESSION block ("top 225lb×5@RIR2") plus the BEAT THIS / CEILING targets
// derived from them. So every spec below drives load from RIR and from the
// athlete's own logged numbers, and quotes %1RM only as a parenthetical for
// calibration. Writing the rules in %1RM would invite the model to invent the
// 1RM it needs to apply them.
//
// Block names are free text in the editor, so specs are matched on keywords
// with a generic fallback rather than looked up by exact name.

export type BlockSpec = {
  /// Compact one-liner for listing the rest of the cycle.
  oneLine: string;
  /// Full prescription, injected for the block being run this week.
  detail: string;
};

const POWER_BUILDING: BlockSpec = {
  oneLine:
    "heavy top set of 3–5 @RIR1–2, then 6–8 back-offs and 8–12 accessories",
  detail: `PRESCRIPTION FOR A POWER-BUILDING SESSION
- Shape: one main lift carrying a heavy TOP SET, then back-off volume on that same lift, then accessories. Top set and its back-offs are ONE exercise in the plan, not two.
- Top set: 1 set of 3–5 reps at RIR 1–2 (~85–90% 1RM territory). This is the heaviest thing they touch all day. Load it from their logged top set on that lift and the BEAT THIS / CEILING line attached to it — never from a percentage you worked out yourself.
- Back-offs: 3–4 sets of 6–8 reps at roughly 75–85% of the top set's load, RIR 2–3. These carry the growth stimulus; the top set carries the strength stimulus.
- Secondary compound: 3–4 sets of 6–10 at RIR 1–2.
- Accessories / isolation: 2–4 sets of 8–12 at RIR 0–2, last set may go to failure.
- Rest: 3–5 min before and after the top set, 2–3 min on back-offs and the secondary compound, 60–90s on isolation.
- Weekly hard sets per major muscle: 10–16. Enough volume to grow, capped so the heavy top sets stay fast.
- Weekly progression within the block: add load to the top set only when the prescribed reps were hit at RIR ≥1. If the top set came in at RIR 0–1, hold the load and add a back-off set instead.
- Bar speed governs the top set. If it grinds, that was the top set — do not chase the rep target with a second attempt.`,
};

const HYPERTROPHY: BlockSpec = {
  oneLine: "6–12 on compounds, 10–15 on isolation, RIR 0–2, double progression",
  detail: `PRESCRIPTION FOR A HYPERTROPHY SESSION
- Shape: 2 compounds then 3–4 isolation movements, ordered heaviest first. No single maximal set — the block is built on accumulated hard volume, not a daily peak.
- Compounds: 3–5 sets of 6–10 reps at RIR 1–2.
- Isolation: 3–4 sets of 10–15 reps at RIR 0–1 (delts, calves, arms and rear delts tolerate 12–20). The last set of an isolation movement can be taken to true failure; compounds should not be.
- Load: pick the weight that lands them in the prescribed rep range AT the prescribed RIR, anchored to their logged top set for that lift. Proximity to failure is the intensity control here, not the number on the bar.
- Rest: 2–3 min on compounds, 60–90s on isolation. Shorter rest on isolation is deliberate — it raises the volume the session fits without raising the load.
- Weekly hard sets per major muscle: 12–20. This is the highest-volume block in the cycle, and where per-muscle weekly volume, not per-session intensity, is the thing that goes up.
- Weekly progression within the block: DOUBLE PROGRESSION. Hold the load and add reps until the top of the rep range is hit on every set at the target RIR, then add ~2.5–5% load and drop back to the bottom of the range. Prefer this over adding load every week.
- Execution cues matter more here than in any other block: full range of motion, controlled eccentric (~2s), a real stretch under load at the bottom. Call these out when they change what the athlete should do.
- If a lift has hit its CEILING (a logged top set at RIR 0–1), progress it with an added set or with reps at a lighter load — not with more reps at the same weight.`,
};

const PURE_STRENGTH: BlockSpec = {
  oneLine: "1–5 heavy at RIR 1–3, long rests, low volume, small weekly jumps",
  detail: `PRESCRIPTION FOR A PURE-STRENGTH SESSION
- Shape: one primary lift taken heavy, one supporting compound, and a short accessory tail. Total session volume is LOWER than any other block — that is the point, not an oversight.
- Primary lift: 3–5 working sets of 1–5 reps. Early block weeks sit at RIR 2–3; late block weeks at RIR 1–2. Never to failure, never a grinder — a missed rep costs more than it buys.
- Back-off on the primary: 2–3 sets of 3–5 at ~80–85% of the day's top load, if the top sets moved well.
- Supporting compound: 3–4 sets of 5–8 at RIR 2.
- Accessories: 2–3 sets of 6–10, kept few and kept easy. They exist to hold structure together, not to add fatigue.
- Rest: 3–5 min on the primary, up to 5–8 min after a heavy single or double. Say the rest interval explicitly — under-resting is the most common way this block gets ruined.
- Weekly hard sets per major muscle: 8–12. Volume drops so intensity can rise.
- Weekly progression within the block: small and linear. ~2.5–5 lb per week on upper-body lifts, ~5–10 lb on lower-body lifts, off their logged top set. Do not make hypertrophy-sized jumps.
- Bar speed is the stop signal. When speed drops noticeably on a rep, that set is finished and the next set does not go up.
- Technique under heavy load is the priority cue. Prescribe fewer things and tell them what to hold together.`,
};

const PEAKING: BlockSpec = {
  oneLine: "singles and doubles at RIR 1–2, minimal volume, freshness first",
  detail: `PRESCRIPTION FOR A PEAKING SESSION
- Shape: the competition or test lifts only, plus the bare minimum to stay healthy. Nothing novel — this is not the block to introduce an exercise.
- Primary: work up to 1–3 singles or doubles at RIR 1–2 off their logged top set. Stop the moment bar speed or position degrades.
- Back-off: 1–2 sets of 2–3 at ~85% of the day's top, only if it moved well.
- Accessories: 1–2 easy sets, RIR 3+, or skip them entirely. Fatigue is the enemy for the whole block.
- Rest: 4–8 min between heavy attempts. Full recovery, every time.
- Weekly hard sets per major muscle: 5–9, and trending down week over week.
- Weekly progression: intensity creeps up while total volume falls. Never both at once.
- No AMRAPs, no failure, no "one more if it feels good".`,
};

const ENDURANCE: BlockSpec = {
  oneLine: "12–20+ reps, short rest, RIR 1–2, work capacity",
  detail: `PRESCRIPTION FOR A MUSCULAR-ENDURANCE / WORK-CAPACITY SESSION
- Shape: circuits or paired supersets, moderate loads, continuous work.
- Sets and reps: 3–4 sets of 12–20+ at RIR 1–2. Loads that let the rep target be hit with clean technique on the last set.
- Rest: 30–75s, and the short rest is the training stimulus — do not lengthen it to protect the load.
- Weekly hard sets per major muscle: 10–16.
- Weekly progression: add reps or subtract rest before adding load.
- Keep the heavy work minimal so the conditioning stimulus is what accumulates.`,
};

/// Generic fallback for a custom block name the keywords don't recognise.
const GENERIC: BlockSpec = {
  oneLine: "athlete-defined block",
  detail: `PRESCRIPTION FOR THIS BLOCK
- The athlete named this block themselves, so there is no house prescription for it. Program it from its name, their coaching instructions, and their recent sessions.
- Default to 3–4 working sets of 6–10 at RIR 1–2 unless the block's name or their instructions clearly imply otherwise.
- Anchor every load to their logged top set for that lift and its BEAT THIS / CEILING line.
- Keep the shape of a session consistent from week to week within this block so progression is readable.`,
};

/// The house prescription for a block, matched on its name. Names are free
/// text, so this is keyword matching over a normalised name, most specific
/// first — "power-building" has to beat both "power" and "building", and
/// "strength-endurance" has to land on endurance rather than pure strength.
export function blockSpec(name: string): BlockSpec {
  const n = name.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (/power ?build|powerbuild|power building/.test(n)) return POWER_BUILDING;
  // An athlete can also name a *block* "deload", separately from the deload
  // cadence, so the keyword has to resolve rather than fall through to generic.
  if (/deload|back off week|recovery week|rest week/.test(n))
    return { oneLine: "everything cut back, RIR 4+, nothing near failure", detail: deloadSpec(40) };
  if (/peak|taper|test week|max out/.test(n)) return PEAKING;
  if (/endurance|conditioning|metcon|work capacity|circuit/.test(n))
    return ENDURANCE;
  if (/hypertroph|volume|size|mass|build/.test(n)) return HYPERTROPHY;
  if (/strength|power|heavy|intensity/.test(n)) return PURE_STRENGTH;
  return GENERIC;
}

/// The deload prescription. Parameterised by the athlete's configured cut so
/// the prompt and the editor never disagree about how much to pull back.
export function deloadSpec(reductionPct: number): string {
  return `PRESCRIPTION FOR A DELOAD SESSION
- Cut roughly ${reductionPct}% of the normal work. Take it out of SET COUNT first, load second — dropping sets preserves the groove better than dropping weight does. A ${reductionPct}% cut on a normal 4-set exercise is 2–3 sets.
- If you cut load instead, take 20–30% off their recent working weight and keep the sets.
- Every set finishes at RIR 4 or easier. Nothing goes below RIR 3, ever.
- Reps: stay in the middle, 5–8. Neither heavy singles nor high-rep burnouts.
- Keep the same movements they have been running. A deload is the same session made easy, not a different session.
- Rest as long as they want. There is nothing to be gained from density this week.
- FORBIDDEN this week: PR attempts, AMRAPs, sets to failure, new exercises, added weight over last week.
- Give them one technique focus per main lift and say it plainly — the light loads are the reason this week is the best time to fix something.
- Tell the athlete explicitly that this is a deload week and why it is scheduled, in one short clause.`;
}
