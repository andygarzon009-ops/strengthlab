type Ring = {
  key: string;
  label: string;
  value: number;
  goal: number;
  unit?: string;
  color: string;
  format?: (v: number) => string;
};

export default function ActivityRings({
  sessions,
  sessionsGoal,
  volume,
  volumeGoal,
  muscleGroups,
  muscleGroupsGoal,
  prsThisWeek,
}: {
  sessions: number;
  sessionsGoal: number;
  volume: number;
  volumeGoal: number;
  muscleGroups: number;
  muscleGroupsGoal: number;
  prsThisWeek: number;
}) {
  const fmtVolume = (v: number) => {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return String(Math.round(v));
  };

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
      unit: "kg vs 4-wk avg",
      color: "#f97316",
      format: fmtVolume,
    },
    {
      key: "coverage",
      label: "Muscle coverage",
      value: muscleGroups,
      goal: Math.max(1, muscleGroupsGoal),
      unit: `of ${Math.max(1, muscleGroupsGoal)} groups`,
      color: "#a855f7",
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
        <div className="flex items-center gap-2">
          {prsThisWeek > 0 && (
            <span
              className="label text-[10px] px-2 py-1 rounded-full nums"
              style={{
                background: "rgba(234,179,8,0.12)",
                border: "1px solid rgba(234,179,8,0.35)",
                color: "#eab308",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              🏆 {prsThisWeek} PR{prsThisWeek === 1 ? "" : "s"}
            </span>
          )}
          <p
            className="label text-[9px]"
            style={{ color: "var(--fg-dim)" }}
          >
            {dayOfWeekLabel()} of 7
          </p>
        </div>
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
  const stroke = 12;
  const gap = 3;
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
  const d = new Date().getDay();
  return d === 0 ? 7 : d;
}
