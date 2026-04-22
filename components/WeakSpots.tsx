type Severity = "high" | "medium" | "low";

export type WeakSpot = {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
};

export default function WeakSpots({ spots }: { spots: WeakSpot[] }) {
  if (spots.length === 0) {
    return (
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <p className="label">Check-up</p>
            <h2 className="text-[18px] font-bold tracking-tight leading-none mt-1">
              Weak spots
            </h2>
          </div>
        </div>
        <div
          className="card p-5 text-center"
          style={{
            background:
              "linear-gradient(180deg, rgba(34,197,94,0.05) 0%, var(--bg-card) 100%)",
            borderColor: "rgba(34,197,94,0.2)",
          }}
        >
          <p
            className="text-[13px] font-semibold"
            style={{ color: "var(--accent)" }}
          >
            All systems firing
          </p>
          <p
            className="text-[11px] mt-1"
            style={{ color: "var(--fg-muted)" }}
          >
            Nothing flagged this week. Keep it moving.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <p className="label">Check-up</p>
          <h2 className="text-[18px] font-bold tracking-tight leading-none mt-1">
            Weak spots
          </h2>
        </div>
        <p
          className="label text-[9px] nums"
          style={{
            color: "var(--fg-dim)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {spots.length} flagged
        </p>
      </div>

      <div className="space-y-2">
        {spots.map((s) => (
          <div key={s.id} className="card p-4 flex gap-3 items-start">
            <div
              className="w-1 self-stretch rounded-full shrink-0"
              style={{
                background:
                  s.severity === "high"
                    ? "#f87171"
                    : s.severity === "medium"
                      ? "#fbbf24"
                      : "var(--fg-dim)",
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold text-[14px] tracking-tight truncate">
                  {s.title}
                </p>
                <span
                  className="label text-[9px] shrink-0"
                  style={{
                    color:
                      s.severity === "high"
                        ? "#f87171"
                        : s.severity === "medium"
                          ? "#fbbf24"
                          : "var(--fg-dim)",
                  }}
                >
                  {s.severity}
                </span>
              </div>
              <p
                className="text-[12px] mt-1 leading-relaxed"
                style={{ color: "var(--fg-muted)" }}
              >
                {s.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
