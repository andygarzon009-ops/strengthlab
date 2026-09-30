import Link from "next/link";
import { prisma } from "@/lib/db";
import { localDateKey, resolveBlock, type ResolvedBlock } from "@/lib/blockStamp";

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
  const color = deload ? DELOAD_BLUE : "var(--accent)";
  // One short line under the bar. weeksUntilDeload counts training weeks
  // AFTER this one, so the deload itself is one further out.
  const footer = deload
    ? `Cut ~${config.deloadReductionPct}% this week`
    : state.weeksUntilDeload == null
      ? null
      : state.weeksUntilDeload === 0
        ? "Deload next week"
        : `Deload in ${state.weeksUntilDeload + 1} weeks`;

  return (
    <Link href="/profile" className="block active:opacity-70">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="text-[17px] font-bold tracking-tight leading-none truncate"
          style={deload ? { color } : undefined}
        >
          {deload ? "Deload week" : state.blockName}
        </h2>
        {!deload && (
          <p
            className="text-[12px] nums leading-none shrink-0"
            style={{
              color: "var(--fg-dim)",
              fontFamily: "var(--font-geist-mono)",
            }}
          >
            Week {state.weekInBlock} of {state.blockWeeks}
          </p>
        )}
      </div>

      {!deload && (
        <div className="flex gap-1 mt-3">
          {Array.from({ length: state.blockWeeks }, (_, i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{
                background:
                  i < state.weekInBlock ? color : "var(--bg-elevated)",
              }}
            />
          ))}
        </div>
      )}

      {footer && (
        <p
          className="text-[12px] mt-2.5"
          style={{ color: "var(--fg-dim)" }}
        >
          {footer}
        </p>
      )}
    </Link>
  );
}
