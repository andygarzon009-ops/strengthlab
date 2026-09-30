import { cache } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { localDateKey, resolveBlock, type ResolvedBlock } from "@/lib/blockStamp";
import { blockSpec, DELOAD_SUMMARY } from "@/lib/periodization";

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
// for. Taps through to the cycle editor on the profile.
export default async function CycleCard({ userId }: { userId: string }) {
  const phase = await loadPhase(userId).catch(() => null);
  if (!phase) return null;
  return (
    <div className="card p-[18px] mb-3">
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

export function PhaseSection({ phase }: { phase: ResolvedBlock }) {
  const { state, config } = phase;
  const deload = state.isDeloadWeek;
  // A deload pauses the block rather than replacing it, so the card keeps
  // naming the block, with the deload flagged in blue.
  const block = config.blocks[state.blockIndex];
  const name = block?.name ?? state.blockName;
  const total = deload ? (block?.weeks ?? 0) : state.blockWeeks;
  const done = deload ? (state.pausedWeeksDone ?? 0) : state.weekInBlock;
  const summary = deload ? DELOAD_SUMMARY : blockSpec(name).summary;
  // weeksUntilDeload counts training weeks AFTER this one, so the deload
  // itself is one further out.
  const next = deload
    ? `Back to week ${done + 1} of ${total} next week`
    : state.weeksUntilDeload == null
      ? null
      : state.weeksUntilDeload === 0
        ? "Deload next week"
        : `Deload in ${state.weeksUntilDeload + 1} weeks`;
  const groups = cycleSegments(phase);

  return (
    <Link href="/profile" className="block active:opacity-70">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-bold tracking-tight leading-none truncate">
          {name}
        </h2>
        <p
          className="text-[12px] nums leading-none shrink-0"
          style={{
            color: deload ? DELOAD_BLUE : "var(--fg-dim)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {deload ? "Deload week" : `Week ${done} of ${total}`}
        </p>
      </div>

      <div className="flex gap-[7px] mt-4" aria-hidden>
        {groups.map((g, gi) => (
          <div
            key={gi}
            className="min-w-0"
            style={{
              flexGrow: g.segs.filter((s) => s.kind === "week").length,
              flexBasis: 0,
            }}
          >
            <div className="flex items-center gap-[3px] h-[12px]">
              {g.segs.map((s, si) =>
                s.kind === "deload" ? (
                  <span
                    key={si}
                    className="shrink-0 rounded-full"
                    style={{
                      width: s.current ? 12 : 6,
                      height: s.current ? 12 : 6,
                      background: DELOAD_BLUE,
                      boxShadow: s.current
                        ? "0 0 0 3px rgba(96,165,250,0.25)"
                        : undefined,
                    }}
                  />
                ) : (
                  <span
                    key={si}
                    className="flex-1 rounded-full"
                    style={{
                      height: s.state === "current" ? 10 : 6,
                      background:
                        s.state === "future"
                          ? "var(--bg-elevated)"
                          : "var(--accent)",
                      opacity: s.state === "past" ? 0.35 : 1,
                      boxShadow:
                        s.state === "current"
                          ? "0 0 0 3px rgba(34,197,94,0.2)"
                          : undefined,
                    }}
                  />
                ),
              )}
            </div>
            <p
              className="label text-[9px] mt-2 truncate"
              style={{
                color: g.current
                  ? deload
                    ? DELOAD_BLUE
                    : "var(--accent)"
                  : "var(--fg-dim)",
              }}
            >
              {g.name}
            </p>
          </div>
        ))}
      </div>

      {deload && (
        <p
          className="text-[13px] font-semibold mt-3.5"
          style={{ color: DELOAD_BLUE }}
        >
          Recover &amp; reset · cut ~{config.deloadReductionPct}%
        </p>
      )}
      {summary && (
        <p
          className={`text-[13px] leading-snug ${deload ? "mt-1" : "mt-3.5"}`}
          style={{ color: "var(--fg-muted)" }}
        >
          {summary}
        </p>
      )}
      {next && (
        <p className="text-[12px] mt-1" style={{ color: "var(--fg-dim)" }}>
          {next}
        </p>
      )}
    </Link>
  );
}
