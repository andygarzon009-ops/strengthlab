import Link from "next/link";
import { prisma } from "@/lib/db";
import { localDateKey, resolveBlock } from "@/lib/blockStamp";

// Where the athlete is in their training cycle, from the same resolveBlock the
// coach programs off — so the feed can never say a different week than the
// coach does. Renders nothing until a cycle is set up on the profile.
export default async function PhaseCard({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { periodization: true, timezone: true },
  });
  if (!user?.periodization) return null;

  const today = localDateKey(new Date(), user.timezone || "UTC");
  const resolved = await resolveBlock(userId, today, {
    periodization: user.periodization,
    timezone: user.timezone,
  });
  if (!resolved) return null;
  const { state, config } = resolved;

  const deload = state.isDeloadWeek;
  const color = deload ? "#facc15" : "var(--accent)";
  const footer = [
    deload
      ? `Cut ~${config.deloadReductionPct}% · clean reps`
      : state.weeksUntilDeload == null
        ? null
        : state.weeksUntilDeload === 0
          ? "Deload next week"
          : `Deload in ${state.weeksUntilDeload} wk${state.weeksUntilDeload === 1 ? "" : "s"}`,
    `Next: ${state.nextUp}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href="/profile" className="card block p-4 mb-3 transition-colors">
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
