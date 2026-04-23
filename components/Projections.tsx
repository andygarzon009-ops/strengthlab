type Projection = {
  exerciseName: string;
  baseWeight: number;
  baseReps: number;
  oneRepMax: number;
};

export default function Projections({ items }: { items: Projection[] }) {
  if (items.length === 0) return null;

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-semibold text-[14px] tracking-tight">
          Projections
        </h2>
        <p
          className="label text-[9px]"
          style={{ color: "var(--fg-dim)" }}
        >
          Estimated 1RM
        </p>
      </div>

      <div className="space-y-2">
        {items.map((p, i) => (
          <div
            key={p.exerciseName}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            <span
              className="nums text-[11px] w-4 shrink-0"
              style={{
                fontFamily: "var(--font-geist-mono)",
                color: "var(--fg-dim)",
              }}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold truncate">
                {p.exerciseName}
              </p>
              <p
                className="text-[10px] mt-0.5 nums"
                style={{
                  fontFamily: "var(--font-geist-mono)",
                  color: "var(--fg-dim)",
                }}
              >
                from {p.baseWeight} × {p.baseReps}
              </p>
            </div>
            <p
              className="nums text-[15px] font-bold shrink-0"
              style={{
                fontFamily: "var(--font-geist-mono)",
                color: "var(--accent)",
              }}
            >
              {Math.round(p.oneRepMax)}
              <span className="text-[10px] font-normal opacity-70 ml-0.5">
                lb
              </span>
            </p>
          </div>
        ))}
      </div>

      <p
        className="text-[10px] mt-3"
        style={{ color: "var(--fg-dim)" }}
      >
        Epley formula · weight × (1 + reps ÷ 30)
      </p>
    </div>
  );
}
