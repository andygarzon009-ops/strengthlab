type Ring = {
  key: string;
  label: string;
  value: number;
  goal: number;
  unit?: string;
  color: string;
  /** How to render the center number */
  format?: (v: number) => string;
};

export default function ActivityRings({
  sessions,
  sessionsGoal,
  volume,
  volumeGoal,
  sets,
  setsGoal,
}: {
  sessions: number;
  sessionsGoal: number;
  volume: number;
  volumeGoal: number;
  sets: number;
  setsGoal: number;
}) {
  const rings: Ring[] = [
    {
      key: "sessions",
      label: "Sessions",
      value: sessions,
      goal: Math.max(1, sessionsGoal),
      unit: `of ${Math.max(1, sessionsGoal)}`,
      color: "#22c55e",
    },
    {
      key: "volume",
      label: "Volume",
      value: volume,
      goal: Math.max(1, volumeGoal),
      unit: "vs 4-wk avg",
      color: "#60a5fa",
      format: (v) =>
        v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`,
    },
    {
      key: "sets",
      label: "Sets",
      value: sets,
      goal: Math.max(1, setsGoal),
      unit: "vs 4-wk avg",
      color: "#f97316",
    },
  ];

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <p className="label">This week</p>
          <h2 className="text-[18px] font-bold tracking-tight leading-none mt-1">
            Activity rings
          </h2>
        </div>
        <p
          className="label text-[9px]"
          style={{ color: "var(--fg-dim)" }}
        >
          {dayOfWeekLabel()} of 7
        </p>
      </div>

      <div className="flex items-center justify-center gap-5">
        <div className="relative">
          <NestedRings rings={rings} size={176} />
        </div>

        <div className="flex-1 space-y-2.5 min-w-0">
          {rings.map((r) => {
            const pct = Math.min(999, Math.round((r.value / r.goal) * 100));
            const display = r.format ? r.format(r.value) : String(r.value);
            return (
              <div key={r.key} className="min-w-0">
                <div className="flex items-baseline gap-1.5 mb-0.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: r.color }}
                  />
                  <p
                    className="label text-[9px]"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    {r.label}
                  </p>
                </div>
                <p
                  className="nums font-bold text-[17px] leading-none tracking-tight truncate"
                  style={{
                    fontFamily: "var(--font-geist-mono)",
                    color: r.color,
                  }}
                >
                  {display}
                  {r.unit && (
                    <span
                      className="text-[10px] font-normal ml-1 opacity-70"
                      style={{ color: "var(--fg-dim)" }}
                    >
                      {r.unit}
                    </span>
                  )}
                </p>
                <p
                  className="text-[10px] nums mt-0.5"
                  style={{
                    color: pct >= 100 ? r.color : "var(--fg-dim)",
                    fontFamily: "var(--font-geist-mono)",
                  }}
                >
                  {pct}%
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NestedRings({
  rings,
  size,
}: {
  rings: Ring[];
  size: number;
}) {
  const stroke = 14;
  const gap = 4;
  const rMax = size / 2 - stroke / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {rings.map((ring, i) => {
        const r = rMax - i * (stroke + gap);
        const circ = 2 * Math.PI * r;
        const pct = Math.min(1, ring.value / ring.goal);
        const offset = circ * (1 - pct);
        return (
          <g key={ring.key} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="var(--bg-elevated)"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={ring.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
          </g>
        );
      })}
    </svg>
  );
}

function dayOfWeekLabel(): number {
  // Monday = 1 ... Sunday = 7
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}
