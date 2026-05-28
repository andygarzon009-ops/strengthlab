import Link from "next/link";
import type { LiftTrend } from "@/lib/strengthProgression";

function formatLbs(n: number): string {
  return `${Math.round(n).toLocaleString()} lb`;
}

function relativeDate(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60 * 60) return "just now";
  if (sec < 60 * 60 * 24) return `${Math.floor(sec / 3600)}h ago`;
  const day = Math.floor(sec / 86400);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function TopLiftsCard({ lifts }: { lifts: LiftTrend[] }) {
  if (lifts.length === 0) {
    return (
      <div className="mt-6">
        <h2 className="text-[15px] font-bold tracking-tight mb-3">
          Top lifts
        </h2>
        <div
          className="rounded-2xl p-5 text-center"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
            Log a few strength sessions and your top lifts will appear here
            with their projected 1-rep max trend.
          </p>
        </div>
      </div>
    );
  }

  const targetCount = lifts.filter((l) => l.target).length;
  const topCount = lifts.length - targetCount;
  const subtitle =
    targetCount > 0
      ? `${targetCount} target${targetCount === 1 ? "" : "s"} · ${topCount} top lift${topCount === 1 ? "" : "s"}`
      : "Est. 1RM · 4-wk trend";

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[15px] font-bold tracking-tight">Strength</h2>
        <span
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--fg-dim)" }}
        >
          {subtitle}
        </span>
      </div>
      <div
        className="rounded-2xl divide-y"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        {lifts.map((l) => (
          <LiftRow key={l.exerciseId} lift={l} />
        ))}
      </div>
    </div>
  );
}

function LiftRow({ lift }: { lift: LiftTrend }) {
  return (
    <Link
      href={`/strength/${encodeURIComponent(lift.exerciseId)}`}
      className="block transition-colors"
    >
      <LiftRowBody lift={lift} />
    </Link>
  );
}

function LiftRowBody({ lift }: { lift: LiftTrend }) {
  const target = lift.target;
  const targetPct = target ? Math.min(1, target.progressPct) : 0;
  const targetOver = target ? target.progressPct >= 1 : false;
  const targetColor = targetOver
    ? "var(--accent)"
    : lift.direction === "down" && target
      ? "#f97316"
      : "#1dd2e6";
  const arrow =
    lift.direction === "up"
      ? "↑"
      : lift.direction === "down"
        ? "↓"
        : lift.direction === "flat"
          ? "→"
          : "·";
  const color =
    lift.direction === "up"
      ? "var(--accent)"
      : lift.direction === "down"
        ? "#f97316"
        : "var(--fg-muted)";
  const trendLabel = (() => {
    if (lift.deltaLb === null) return "first week tracked";
    const sign = lift.deltaLb > 0 ? "+" : "";
    const abs = Math.abs(Math.round(lift.deltaLb));
    if (lift.direction === "flat") return "flat vs 4-wk avg";
    return `${sign}${Math.round(lift.deltaLb)} lb vs 4-wk avg`;
  })();

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1 pr-3">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-[14px] font-medium truncate">{lift.name}</p>
            {target && (
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  background: "rgba(29,210,230,0.12)",
                  border: "1px solid rgba(29,210,230,0.35)",
                  color: "#1dd2e6",
                }}
              >
                Target
              </span>
            )}
          </div>
          <p
            className="text-[11px] tabular-nums"
            style={{ color: "var(--fg-dim)" }}
          >
            {lift.sessions === 0
              ? "No sessions logged yet"
              : `${lift.currentWeight} × ${lift.currentReps} · ${relativeDate(lift.lastSessionAt)}`}
          </p>
        </div>
        <div className="text-right tabular-nums shrink-0 flex items-center gap-2">
          <div>
            <p className="text-[16px] font-bold">
              {formatLbs(lift.currentE1rm)}
            </p>
            <p className="text-[11px]" style={{ color }}>
              {arrow} {trendLabel}
            </p>
          </div>
          <span style={{ color: "var(--fg-dim)" }}>→</span>
        </div>
      </div>

      {target && (
        <div className="mt-2.5">
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: "var(--bg-elevated)" }}
          >
            <div
              className="h-full transition-all"
              style={{
                width: `${Math.round(targetPct * 100)}%`,
                background: targetColor,
              }}
            />
          </div>
          <div
            className="flex items-center justify-between mt-1 tabular-nums"
            style={{ color: "var(--fg-dim)" }}
          >
            <span className="text-[10px]">
              Goal {target.targetWeight} × {target.targetReps} ·{" "}
              {formatLbs(target.targetE1rm)}
            </span>
            <span
              className="text-[10px] font-semibold"
              style={{ color: targetColor }}
            >
              {Math.round(target.progressPct * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
