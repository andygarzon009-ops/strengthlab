// Server-rendered "sleep quality" metrics for the recovery page — the lower
// section of a native sleep view. Each metric is a range-slider row: a track
// with the healthy band shaded, a marker at the actual value, and an
// In range / Low / High pill. Values come from the persisted sleepSummary.

function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

type MetricStatus = "in" | "low" | "high";

function statusOf(value: number, band: [number, number]): MetricStatus {
  if (value < band[0]) return "low";
  if (value > band[1]) return "high";
  return "in";
}

const STATUS_META: Record<MetricStatus, { color: string; text: string }> = {
  in: { color: "#22c55e", text: "In range" },
  low: { color: "#f59e0b", text: "Low" },
  high: { color: "#f59e0b", text: "High" },
};

function MetricBar({
  label,
  valueText,
  value,
  scaleMax,
  band,
}: {
  label: string;
  valueText: string;
  value: number; // position value, in the same units as scaleMax/band
  scaleMax: number;
  band: [number, number];
}) {
  const pos = Math.max(0, Math.min(1, value / scaleMax));
  const bandLo = Math.max(0, Math.min(1, band[0] / scaleMax));
  const bandHi = Math.max(0, Math.min(1, band[1] / scaleMax));
  const status = statusOf(value, band);
  const meta = STATUS_META[status];

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[13px]">
          <span className="font-semibold">{label}</span>
          <span className="ml-1.5 tabular-nums" style={{ color: "var(--fg-muted)" }}>
            {valueText}
          </span>
        </span>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
          style={{ color: meta.color, background: `${meta.color}1f` }}
        >
          {meta.text}
        </span>
      </div>
      <div
        className="relative w-full rounded-full"
        style={{ height: 10, background: "var(--bg-elevated)" }}
      >
        {/* healthy band */}
        <div
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            left: `${bandLo * 100}%`,
            width: `${Math.max(0, bandHi - bandLo) * 100}%`,
            background: "rgba(34,197,94,0.18)",
            border: "1px dashed rgba(34,197,94,0.5)",
          }}
        />
        {/* marker */}
        <div
          className="absolute rounded-full"
          style={{
            left: `${pos * 100}%`,
            top: "50%",
            width: 14,
            height: 14,
            marginLeft: -7,
            marginTop: -7,
            background: "var(--fg)",
            border: `2px solid ${meta.color}`,
          }}
        />
      </div>
    </div>
  );
}

export default function SleepMetrics({
  asleepMin,
  deepMin,
  remMin,
  toSleepMin,
  awakeMin,
  awakeCount,
  restlessMin,
  restlessCount,
}: {
  asleepMin: number;
  deepMin: number;
  remMin: number;
  toSleepMin: number;
  awakeMin: number;
  awakeCount: number;
  restlessMin: number;
  restlessCount: number;
}) {
  const soundMin = deepMin + remMin;
  const soundPct = asleepMin > 0 ? Math.round((soundMin / asleepMin) * 100) : 0;

  const rows: React.ReactNode[] = [];

  if (toSleepMin > 0) {
    rows.push(
      <MetricBar
        key="tofall"
        label="Time to fall asleep"
        valueText={`${toSleepMin} min`}
        value={toSleepMin}
        scaleMax={45}
        band={[0, 20]}
      />,
    );
  }

  if (soundMin > 0) {
    rows.push(
      <MetricBar
        key="sound"
        label="Sound sleep"
        valueText={`${fmtDur(soundMin)} · ${soundPct}%`}
        value={soundPct}
        scaleMax={70}
        band={[40, 55]}
      />,
    );
  }

  if (restlessCount > 0) {
    rows.push(
      <MetricBar
        key="restless"
        label="Restlessness"
        valueText={`${Math.round(restlessMin)} min · ${restlessCount}×`}
        value={restlessMin}
        scaleMax={45}
        band={[0, 20]}
      />,
    );
  }

  if (awakeCount > 0) {
    rows.push(
      <MetricBar
        key="awake"
        label="Interruptions"
        valueText={`${Math.round(awakeMin)} min · ${awakeCount}×`}
        value={awakeMin}
        scaleMax={45}
        band={[0, 15]}
      />,
    );
  }

  if (rows.length === 0) return null;

  return (
    <div
      className="rounded-2xl p-5 mt-3 space-y-4"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      {rows}
    </div>
  );
}
