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
    "one heavy top set of 3-5 @RPE8-9, then 65-75% back-offs and 8-12 accessories",
  detail: `— POWER-BUILDING —
Every compound lift gets one heavy top set, then volume work under it.

Top set: 3-5 reps at RPE 8-9. Prescribe equal or greater load than LAST's
top set unless naming a reason not to.

Back-off sets: 3-4 sets at 65-75% of the top set load, 6-10 reps, RPE 7-8.
This is where the volume lives — the top set is a strength test, not the
stimulus.

Isolation/accessory work: 2-3 sets, 8-12 reps, RPE 8-9, stop 1-2 reps
short of failure. Straight sets only, no top-set structure.

Rest: 3-5 min after the top set, 2-3 min on back-off sets, 60-90s on
isolation.

Weekly structure: one top-set attempt per lift per week, no retesting.
The block earns strength through back-off volume, not through repeated
top-set attempts.`,
};

const HYPERTROPHY: BlockSpec = {
  oneLine:
    "no top sets, everything 6-12 @RPE8-9, 10-20 weekly sets per muscle",
  detail: `— HYPERTROPHY —
No top-set structure. Every working set in the 6-12 rep range, RPE 8-9
(1-2 reps in reserve), last set of each exercise may go to RPE 9-10.

Sets: 3-4 working sets per compound, 3 per isolation exercise. Weekly
sets per muscle group: 10-20, ramping across the block — lower end early
in the block, upper end deep in the block.

Load: pick a weight that fails inside the rep range, not above it. If
LAST hit 12 reps, add 2.5-5% and expect reps to land near the bottom of
the range (6-8) this session. If LAST hit under 8 reps, hold load and
chase reps before adding weight.

Order: compound movement first per muscle group while fresh, then
isolation from 2-3 angles (mid-stretch, deep-stretch/contraction,
long-length) to finish the muscle. Do not stack two exercises hitting the
same joint angle back to back early in the session.

Rest: 60-90s on isolation, 90-120s on compounds. Do not let rest drift
past 2 min on volume work.

Failure policy: last set of an exercise can go to true failure. Sets
before that stop at RPE 8-9. Never prescribe failure on every set.`,
};

const PURE_STRENGTH: BlockSpec = {
  oneLine: "3-5 sets of 1-5 @RPE7-9, long rests, minimal accessories",
  detail: `— PURE STRENGTH —
Lower total volume, heavier average load, longer rest. Trade reps for
load, not the reverse.

Sets: 3-5 sets per compound lift, 1-5 reps, RPE 7-9. No AMRAPs unless the
week is explicitly programmed as a testing week.

Load: match LAST's load at the same or lower RPE, or add load only if
LAST was completed at RPE 7 or below with reps in reserve. Never add load
on top of an RPE 9-10 LAST without naming why.

Accessory work: 2-3 sets, 6-10 reps, RPE 7-8. Minimal — maintain
positions and address named weak points only, not additional stimulus.

Rest: 3-5 min on primary lifts, non-negotiable. Do not compress rest to
save session time.

Weekly structure: no more than one true heavy attempt (RPE 9+) per lift
per week. The rest of that lift's weekly work stays submaximal and
technical.`,
};

/// The three canonical blocks, always emitted together under the header
/// below so the coach can see the block it is in as one option among three.
const CANONICAL: BlockSpec[] = [POWER_BUILDING, HYPERTROPHY, PURE_STRENGTH];

/// Preamble for the rules section. The RPE/RIR bridge is not decoration: the
/// specs are written in RPE, every set this app has ever logged is stored as
/// RIR, and the PROGRESSION lines the specs point at render as "@RIR2". With
/// no mapping the coach has to guess which direction the scale runs, and it
/// guesses wrong often enough to inverse the intensity of a whole session.
export const BLOCK_RULES_HEADER = `BLOCK-SPECIFIC PRESCRIPTION RULES:
Apply the section below matching the computed block. Loads always trace
forward from each lift's LAST line. The block sets the rep range; LAST
anchors the load. Never prescribe under LAST without naming a reason
(deload, missed reps last time, flagged joint pain, declining recovery
score).

These rules are written in RPE. The athlete's logged data is in RIR, and
every set in the PROGRESSION and RECENT SESSIONS blocks renders as @RIRn.
Convert: RPE 10 = RIR 0 (failure), RPE 9 = RIR 1, RPE 8 = RIR 2,
RPE 7 = RIR 3. When you TALK to the athlete use RIR, because that is what
they log and what the app asks them for.`;

/// Every canonical section, with the computed one marked. `activeDetail` is
/// the spec that actually applies this week — usually one of the three, but a
/// deload, a peaking block or a custom name resolves to a section that isn't
/// in the canonical set, so it gets appended rather than matched.
export function blockRules(activeDetail: string): string {
  const sections = CANONICAL.map((b) =>
    b.detail === activeDetail
      ? `${b.detail.replace(/^— (.+) —/, "— $1 —   ◀ THIS IS THE COMPUTED BLOCK — APPLY THIS SECTION")}`
      : b.detail,
  );
  if (!CANONICAL.some((b) => b.detail === activeDetail)) {
    sections.push(
      `${activeDetail}
   ◀ THIS IS THE COMPUTED BLOCK — APPLY THIS SECTION, not one of the three above.`,
    );
  }
  return [BLOCK_RULES_HEADER, ...sections].join("\n\n");
}

const PEAKING: BlockSpec = {
  oneLine: "singles and doubles at RPE 8-9, minimal volume, freshness first",
  detail: `— PEAKING —
The competition or test lifts only, plus the bare minimum to stay healthy.
Nothing novel — this is not the block to introduce an exercise.

Primary: work up to 1-3 singles or doubles at RPE 8-9 off LAST's top set.
Stop the moment bar speed or position degrades.

Back-off: 1-2 sets of 2-3 at ~85% of the day's top, only if it moved well.

Accessory work: 1-2 easy sets at RPE 7 or below, or skip entirely.
Accumulated fatigue is the enemy for the whole block.

Rest: 4-8 min between heavy attempts. Full recovery, every time.

Weekly structure: intensity creeps up while total volume falls, never both
at once. Weekly sets per muscle group: 5-9 and trending down. No AMRAPs,
no failure, no "one more if it feels good".`,
};

const ENDURANCE: BlockSpec = {
  oneLine: "12-20+ reps at RPE 8-9, short rest, work capacity",
  detail: `— MUSCULAR ENDURANCE / WORK CAPACITY —
Circuits or paired supersets, moderate loads, continuous work.

Sets: 3-4 sets of 12-20+ reps at RPE 8-9. Pick loads that let the rep
target be hit with clean technique on the last set.

Rest: 30-75s. The short rest IS the training stimulus — do not lengthen it
to protect the load.

Weekly sets per muscle group: 10-16.

Progression: add reps or subtract rest before adding load. Keep heavy work
minimal so the conditioning stimulus is what accumulates.`,
};

/// Generic fallback for a custom block name the keywords don't recognise.
const GENERIC: BlockSpec = {
  oneLine: "athlete-defined block",
  detail: `— ATHLETE-DEFINED BLOCK —
The athlete named this block themselves, so there is no house prescription
for it. Program it from its name, their coaching instructions, and their
recent sessions.

Default to 3-4 working sets of 6-10 reps at RPE 8-9 unless the block's name
or their instructions clearly imply otherwise.

Anchor every load to LAST for that lift. Keep the shape of a session
consistent from week to week within this block so progression is readable.`,
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
  return `— DELOAD —
Cut roughly ${reductionPct}% of the normal work. Take it out of SET COUNT
first, load second — dropping sets preserves the groove better than
dropping weight does. A ${reductionPct}% cut on a normal 4-set exercise is
2-3 sets. If you cut load instead, take 20-30% off recent working weight
and keep the sets.

Every set finishes at RPE 6 or easier (RIR 4+). Nothing goes above RPE 7,
ever. This is the one block where prescribing UNDER LAST is correct and
needs no further justification beyond naming the deload.

Reps: stay in the middle, 5-8. Neither heavy singles nor high-rep burnouts.

Keep the same movements they have been running. A deload is the same
session made easy, not a different session.

Rest: as long as they want. There is nothing to be gained from density.

FORBIDDEN: PR attempts, AMRAPs, sets to failure, new exercises, added
weight over last week.

Give one technique focus per main lift and say it plainly — the light
loads are the reason this week is the best time to fix something. Tell the
athlete explicitly that this is a deload week, in one short clause.`;
}
