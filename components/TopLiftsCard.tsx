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

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[15px] font-bold tracking-tight">Top lifts</h2>
        <span
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--fg-dim)" }}
        >
          Est. 1RM · 4-wk trend
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
          <LiftRow key={l.name} lift={l} />
        ))}
      </div>
    </div>
  );
}

function LiftRow({ lift }: { lift: LiftTrend }) {
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
    <div className="flex items-center justify-between px-4 py-3">
      <div className="min-w-0 flex-1 pr-3">
        <p className="text-[14px] font-medium truncate">{lift.name}</p>
        <p
          className="text-[11px] mt-0.5 tabular-nums"
          style={{ color: "var(--fg-dim)" }}
        >
          {lift.currentWeight} × {lift.currentReps} ·{" "}
          {relativeDate(lift.lastSessionAt)}
        </p>
      </div>
      <div className="text-right tabular-nums shrink-0">
        <p className="text-[16px] font-bold">
          {formatLbs(lift.currentE1rm)}
        </p>
        <p className="text-[11px]" style={{ color }}>
          {arrow} {trendLabel}
        </p>
      </div>
    </div>
  );
}
