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
  const footer = [
    deload
      ? `Cut ~${config.deloadReductionPct}% · clean reps`
      : state.weeksUntilDeload == null
        ? null
        : // weeksUntilDeload counts training weeks AFTER this one, so the
          // deload itself is one further out.
          state.weeksUntilDeload === 0
          ? "Deload next week"
          : `Deload in ${state.weeksUntilDeload + 1} wks`,
    `Next: ${state.nextUp}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href="/profile" className="block active:opacity-70">
      <div className="flex items-baseline justify-between">
        <div className="min-w-0">
          <p className="label" style={{ color }}>
            {deload ? "Deload week" : "Current phase"}
          </p>
          <h2 className="text-[18px] font-bold tracking-tight leading-none mt-1.5 truncate">
            {deload ? "Recover & reset" : state.blockName}
          </h2>
        </div>
        <div className="text-right shrink-0 pl-3">
          {!deload && (
            <p
              className="text-[13px] nums leading-none"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
              Wk {state.weekInBlock}
              <span style={{ color: "var(--fg-dim)" }}>/{state.blockWeeks}</span>
            </p>
          )}
          <p
            className="text-[10px] label mt-1.5"
            style={{ color: "var(--fg-dim)" }}
          >
            Cycle wk {state.weekNumber}
          </p>
        </div>
      </div>

      {!deload && (
        <div className="flex gap-1 mt-3.5">
          {Array.from({ length: state.blockWeeks }, (_, i) => (
            <span
              key={i}
              className="h-1.5 flex-1 rounded-full"
              style={{
                background:
                  i < state.weekInBlock ? color : "var(--bg-elevated)",
                opacity: i < state.weekInBlock - 1 ? 0.55 : 1,
              }}
            />
          ))}
        </div>
      )}

      <p
        className="text-[12px] mt-3 truncate"
        style={{ color: "var(--fg-muted)" }}
      >
        {footer}
      </p>
    </Link>
  );
}
