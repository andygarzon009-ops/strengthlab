import { cache } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { localDateKey, resolveBlock, type ResolvedBlock } from "@/lib/blockStamp";
import { blockSpec, DELOAD_SUMMARY } from "@/lib/periodization";
import { blockKindOf, type BlockKind } from "@/lib/prescribe";

// Deloads read in the same blue as the DELOAD tag on the log and on a workout.
export const DELOAD_BLUE = "#60a5fa";

// Where the athlete is in their training cycle, from the same resolveBlock the
// coach programs off — so the feed can never say a different week than the
// coach does. Null until a cycle is set up on the profile. Cached per request:
// the Today card and the cycle card both need it.
export const loadPhase = cache(
  async (userId: string): Promise<ResolvedBlock | null> => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { periodization: true, timezone: true },
    });
    if (!user?.periodization) return null;
    const today = localDateKey(new Date(), user.timezone || "UTC");
    return resolveBlock(userId, today, {
      periodization: user.periodization,
      timezone: user.timezone,
    });
  },
);

// The feed's cycle card: the whole cycle on one line, then what this phase is
// for. Taps straight through to the cycle editor on the profile.
export default async function CycleCard({ userId }: { userId: string }) {
  const phase = await loadPhase(userId).catch(() => null);
  if (!phase) return null;
  return (
    <div className="card p-[18px] mb-3 overflow-hidden">
      <PhaseSection phase={phase} />
    </div>
  );
}

type Seg =
  | { kind: "week"; state: "past" | "current" | "future" }
  | { kind: "deload"; current: boolean };

/// Every block of the cycle as week segments, with the next deload dropped in
/// where it falls. A deload's position is only knowable forward from today,
/// so only the upcoming one is drawn (or this week's, during a deload).
function cycleSegments(
  phase: ResolvedBlock,
): { name: string; segs: Seg[]; current: boolean }[] {
  const { state, config } = phase;
  const cur = state.blockIndex;
  const deload = state.isDeloadWeek;
  const doneInCur = deload
    ? (state.pausedWeeksDone ?? 0)
    : state.weekInBlock - 1;

  const groups = config.blocks.map((b, j) => ({
    name: b.name,
    current: j === cur,
    segs: Array.from(
      { length: b.weeks },
      (_, k): Seg => ({
        kind: "week",
        state:
          j < cur || (j === cur && k < doneInCur)
            ? "past"
            : j === cur && k === doneInCur && !deload
              ? "current"
              : "future",
      }),
    ),
  }));

  if (deload) {
    groups[cur]?.segs.splice(doneInCur, 0, { kind: "deload", current: true });
  } else if (state.weeksUntilDeload != null) {
    // Walk forward from this week by the training weeks left before the
    // deload; it lands right after the week the walk stops on.
    let j = cur;
    let k = doneInCur;
    for (let left = state.weeksUntilDeload; left > 0 && j < groups.length; left--) {
      k++;
      if (k >= config.blocks[j].weeks) {
        j++;
        k = 0;
      }
    }
    if (j < groups.length) {
      groups[j].segs.splice(k + 1, 0, { kind: "deload", current: false });
    }
  }
  return groups;
}

// All-green palette: every block is a shade of the app's green, so the cycle
// reads as one thing; only the block being run lights up in lime.
const LIME = "#a3e635";
const BLOCK_GREEN: Record<BlockKind, string> = {
  power: "#3f7a3a",
  hypertrophy: "#22a35a",
  strength: "#4d8f2a",
  peaking: "#2f6b45",
  endurance: "#2a8a6a",
  deload: DELOAD_BLUE,
  generic: "#22a35a",
};
const SHORT: Partial<Record<BlockKind, string>> = {
  power: "Power",
  hypertrophy: "Hyper",
  strength: "Strength",
  peaking: "Peak",
  endurance: "Endure",
  deload: "Deload",
};
/// What the block means at the gym, as three chips. Same numbers as the block
/// guides in lib/periodization.ts.
const CHIPS: Partial<Record<BlockKind, [string, string][]>> = {
  power: [["3–5", "top set"], ["6–10", "back-offs"], ["3–5 min", "rest"]],
  hypertrophy: [["6–12", "reps"], ["RIR 1–2", "effort"], ["90–120 s", "rest"]],
  strength: [["1–5", "reps"], ["RIR 1–3", "effort"], ["3–5 min", "rest"]],
  peaking: [["1–3", "reps"], ["RIR 1–2", "effort"], ["4–8 min", "rest"]],
  endurance: [["12–20+", "reps"], ["RIR 1–2", "effort"], ["30–75 s", "rest"]],
  deload: [["RIR 4+", "effort"], ["fewer", "sets"]],
};

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function PhaseSection({ phase }: { phase: ResolvedBlock }) {
  const { state, config } = phase;
  const deload = state.isDeloadWeek;
  // A deload pauses the block rather than replacing it, so the card keeps
  // naming the block, with the deload flagged in blue.
  const block = config.blocks[state.blockIndex];
  const name = block?.name ?? state.blockName;
  const total = deload ? (block?.weeks ?? 0) : state.blockWeeks;
  const done = deload ? (state.pausedWeeksDone ?? 0) : state.weekInBlock;
  const kind = blockKindOf(name, false);
  const hue = deload ? DELOAD_BLUE : LIME;
  const chips = CHIPS[deload ? "deload" : kind];
  const summary = deload ? DELOAD_SUMMARY : chips ? null : blockSpec(name).summary;

  // weeksUntilDeload counts training weeks AFTER this one, so the deload
  // itself is one further out.
  const deloadLine = deload
    ? `Back to week ${done + 1} of ${total} next week`
    : state.weeksUntilDeload == null
      ? null
      : state.weeksUntilDeload === 0
        ? "deload next week"
        : `deload in ${state.weeksUntilDeload + 1} weeks`;
  const nextBlock =
    !deload && done >= total && state.weeksUntilDeload !== 0
      ? config.blocks[(state.blockIndex + 1) % config.blocks.length]?.name
      : null;
  const foot = [nextBlock ? `Next: ${nextBlock}` : null, deloadLine]
    .filter(Boolean)
    .join(" · ");
  const footText = foot ? foot[0].toUpperCase() + foot.slice(1) : null;

  const groups = cycleSegments(phase);

  return (
    <Link href="/profile#cycle" className="relative block active:opacity-70">
      {/* The current block's colour glows from the corner. */}
      <div
        className="pointer-events-none absolute -inset-[18px] rounded-[inherit]"
        style={{ background: `radial-gradient(90% 70% at 100% 0%, ${rgba(hue, 0.13)}, transparent 60%)` }}
        aria-hidden
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-[10px] font-bold uppercase tracking-[0.16em]"
            style={{ color: hue }}
          >
            {deload ? "Deload week" : "Current block"}
          </p>
          <h2 className="text-[24px] font-extrabold tracking-tight leading-none mt-1 truncate">
            {name}
          </h2>
          <div className="flex gap-[5px] mt-2" aria-hidden>
            {Array.from({ length: total }, (_, i) => {
              const isNow = !deload && i === done - 1;
              const past = deload ? i < done : i < done - 1;
              return (
                <span
                  key={i}
                  className="h-2 w-[22px] rounded-full"
                  style={{
                    background: isNow || past ? hue : "var(--bg-elevated)",
                    opacity: past ? 0.4 : 1,
                    boxShadow: isNow ? `0 0 10px ${rgba(hue, 0.7)}` : undefined,
                  }}
                />
              );
            })}
          </div>
        </div>
        <div className="text-right shrink-0">
          {deload ? (
            <p className="text-[15px] font-bold mt-1" style={{ color: DELOAD_BLUE }}>
              Recover
            </p>
          ) : (
            <>
              <p
                className="text-[30px] font-extrabold leading-none tabular-nums"
                style={{ letterSpacing: "-0.04em", fontFamily: "var(--font-geist-mono)" }}
              >
                {done}
                <span className="text-[18px]" style={{ color: "var(--fg-dim)" }}>/{total}</span>
              </p>
              <p className="text-[10px] mt-1" style={{ color: "var(--fg-muted)" }}>
                {done >= total ? "Final week" : `Week ${done}`}
              </p>
            </>
          )}
        </div>
      </div>

      {/* The whole cycle: one bar per block, deloads as blue dots, a glowing
          dot on this week. */}
      <div className="relative flex gap-1 mt-4" aria-hidden>
        {groups.map((g, gi) => {
          const gKind = blockKindOf(g.name, false);
          const isCur = g.current;
          const past = gi < state.blockIndex;
          const color = isCur ? hue : BLOCK_GREEN[gKind];
          // Runs of weeks between any deload dots inside this block.
          const parts: ({ weeks: number } | { dot: boolean })[] = [];
          let run = 0;
          for (const sg of g.segs) {
            if (sg.kind === "deload") {
              if (run) parts.push({ weeks: run });
              parts.push({ dot: sg.current });
              run = 0;
            } else run++;
          }
          if (run) parts.push({ weeks: run });
          const weeks = g.segs.filter((x) => x.kind === "week").length;
          const herePct = ((Math.max(1, done) - 0.5) / Math.max(1, total)) * 100;
          return (
            <div key={gi} className="min-w-0" style={{ flexGrow: weeks, flexBasis: 0 }}>
              <div className="relative flex items-center gap-1 h-2">
                {parts.map((pt, pi) =>
                  "weeks" in pt ? (
                    <span
                      key={pi}
                      className="h-2 rounded-full"
                      style={{
                        flexGrow: pt.weeks,
                        flexBasis: 0,
                        background: color,
                        opacity: isCur ? 1 : past ? 0.3 : 0.16,
                      }}
                    />
                  ) : (
                    <span
                      key={pi}
                      className="shrink-0 rounded-full"
                      style={{
                        width: pt.dot ? 12 : 8,
                        height: pt.dot ? 12 : 8,
                        background: DELOAD_BLUE,
                        boxShadow: pt.dot ? `0 0 10px ${rgba(DELOAD_BLUE, 0.7)}` : undefined,
                      }}
                    />
                  ),
                )}
                {isCur && !deload && (
                  <span
                    className="absolute rounded-full"
                    style={{
                      left: `${herePct}%`,
                      top: -5,
                      width: 18,
                      height: 18,
                      transform: "translateX(-50%)",
                      background: "#fff",
                      border: `3px solid ${hue}`,
                      boxShadow: `0 0 12px ${rgba(hue, 0.7)}`,
                    }}
                  />
                )}
              </div>
              <p
                className="text-[9px] font-bold uppercase tracking-[0.1em] mt-2 truncate"
                style={{ color: isCur ? hue : "var(--fg-dim)" }}
              >
                {SHORT[gKind] ?? g.name}
              </p>
            </div>
          );
        })}
      </div>

      {chips && (
        <div className="relative flex flex-wrap gap-1.5 mt-3.5">
          {chips.map(([v, l]) => (
            <span
              key={l}
              className="inline-flex items-baseline gap-1.5 px-2.5 py-1.5 rounded-[10px] text-[12px] font-semibold"
              style={{ background: "var(--bg-elevated)" }}
            >
              {v}
              <span
                className="text-[9px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: "var(--fg-muted)" }}
              >
                {l}
              </span>
            </span>
          ))}
        </div>
      )}
      {summary && (
        <p className="relative text-[13px] leading-snug mt-3" style={{ color: "var(--fg-muted)" }}>
          {summary}
        </p>
      )}
      {footText && (
        <p className="relative text-[12px] mt-3" style={{ color: "var(--fg-dim)" }}>
          {footText}
        </p>
      )}
    </Link>
  );
}
