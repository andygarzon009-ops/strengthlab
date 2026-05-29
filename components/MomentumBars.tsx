export type MomentumStats = {
  thisWeekSets: number;
  lastWeekSets: number;
  thisWeekSessions: number;
  lastWeekSessions: number;
};

const ACCENT = "#22c55e";
const UP = "#22c55e";
const DOWN = "#f97316";
const FLAT = "var(--fg-muted)";

/// Visual momentum: this week's training volume vs. last week, shown as two
/// stacked bars plus a signed delta chip. Replaces the old text-only card.
export default function MomentumBars({
  stats,
  line,
}: {
  stats: MomentumStats;
  line?: string;
}) {
  const { thisWeekSets, lastWeekSets, thisWeekSessions, lastWeekSessions } =
    stats;
  const max = Math.max(thisWeekSets, lastWeekSets, 1);
  const delta = thisWeekSets - lastWeekSets;
  const pct = lastWeekSets > 0 ? Math.round((delta / lastWeekSets) * 100) : null;

  const tone = delta > 0 ? UP : delta < 0 ? DOWN : FLAT;
  const deltaLabel =
    delta === 0
      ? "Even with last week"
      : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} sets${
          pct !== null ? ` (${delta > 0 ? "+" : "−"}${Math.abs(pct)}%)` : ""
        }`;

  return (
    <div>
      {/* Delta chip */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
          Working sets vs. last week
        </span>
        <span
          className="text-[11px] font-bold px-2.5 py-1 rounded-full tabular-nums"
          style={{
            background: `${tone === FLAT ? "var(--fg-muted)" : tone}22`,
            border: `1px solid ${tone === FLAT ? "var(--border-strong)" : `${tone}66`}`,
            color: tone,
          }}
        >
          {deltaLabel}
        </span>
      </div>

      {/* Two volume bars */}
      <div className="space-y-2.5">
        <VolumeBar
          label="This week"
          value={thisWeekSets}
          max={max}
          color={ACCENT}
          emphasis
        />
        <VolumeBar
          label="Last week"
          value={lastWeekSets}
          max={max}
          color="var(--fg-dim)"
        />
      </div>

      {/* Sessions footnote */}
      <p className="text-[11px] mt-3" style={{ color: "var(--fg-dim)" }}>
        {thisWeekSessions} session{thisWeekSessions === 1 ? "" : "s"} this week ·{" "}
        {lastWeekSessions} last week
      </p>

      {line && (
        <p
          className="text-[12px] mt-2 leading-relaxed"
          style={{ color: "var(--fg-muted)" }}
        >
          {line}
        </p>
      )}
    </div>
  );
}

function VolumeBar({
  label,
  value,
  max,
  color,
  emphasis,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  emphasis?: boolean;
}) {
  const widthPct = Math.max(2, (value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <span
        className="text-[11px] w-[68px] flex-shrink-0"
        style={{ color: emphasis ? "var(--fg)" : "var(--fg-dim)" }}
      >
        {label}
      </span>
      <div
        className="flex-1 h-5 rounded-full overflow-hidden"
        style={{ background: "var(--bg-elevated)" }}
      >
        <div
          className="h-full rounded-full flex items-center justify-end pr-2 transition-all"
          style={{
            width: `${widthPct}%`,
            background: color,
            opacity: emphasis ? 1 : 0.55,
          }}
        >
          <span
            className="text-[10px] font-bold tabular-nums"
            style={{ color: emphasis ? "#0a0a0a" : "var(--fg)" }}
          >
            {value}
          </span>
        </div>
      </div>
    </div>
  );
}
