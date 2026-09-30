import Link from "next/link";
import { prisma } from "@/lib/db";
import { localDateKey, resolveBlock, type ResolvedBlock } from "@/lib/blockStamp";
import { blockSpec, DELOAD_SUMMARY } from "@/lib/periodization";

// Deloads read in the same blue as the DELOAD tag on the log and on a workout.
export const DELOAD_BLUE = "#60a5fa";

// Where the athlete is in their training cycle, from the same resolveBlock the
// coach programs off — so the feed can never say a different week than the
// coach does. Null until a cycle is set up on the profile.
export async function loadPhase(userId: string): Promise<ResolvedBlock | null> {
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
}

// The phase header of the feed's week card (WeeklyRecap). Taps through to the
// cycle editor on the profile.
export function PhaseSection({ phase }: { phase: ResolvedBlock }) {
  const { state, config } = phase;
  const deload = state.isDeloadWeek;
  // A deload pauses the block rather than replacing it, so the card keeps
  // showing the block and its bars — the weeks done so far — with the deload
  // flagged in blue beside them.
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

      {total > 0 && (
        <div className="flex gap-1 mt-3">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className="h-1.5 flex-1 rounded-full"
              style={{
                background: i < done ? "var(--accent)" : "var(--bg-elevated)",
                // Past weeks recede; the current one reads full strength.
                // In a deload nothing is current, so all done weeks recede.
                opacity: i < done && (deload || i < done - 1) ? 0.55 : 1,
              }}
            />
          ))}
        </div>
      )}

      {deload && (
        <p
          className="text-[13px] font-semibold mt-3"
          style={{ color: DELOAD_BLUE }}
        >
          Recover &amp; reset · cut ~{config.deloadReductionPct}%
        </p>
      )}
      {summary && (
        <p
          className={`text-[12px] ${deload ? "mt-1" : "mt-2.5"}`}
          style={{ color: "var(--fg-muted)" }}
        >
          {summary}
        </p>
      )}
      {next && (
        <p
          className="text-[11px] mt-1"
          style={{ color: "var(--fg-dim)" }}
        >
          {next}
        </p>
      )}
    </Link>
  );
}
