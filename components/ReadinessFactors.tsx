// Readiness breakdown pieces for the readiness page: the "what moved it"
// list under the score, and vitals tiles for breathing and skin temp.

import {
  FACTOR_LABEL,
  type ReadinessFactor,
  type FactorStatus,
} from "@/lib/readiness";

const STATUS_COLOR: Record<FactorStatus, string> = {
  good: "#22c55e",
  ok: "#a1a1aa",
  drag: "#f97316",
};

/// "What moved it": core signals with their 0–100 sub-score as a mini bar,
/// then the deductions — the points each one took off, or a quiet check.
export function FactorList({ factors }: { factors: ReadinessFactor[] }) {
  return (
    <div
      className="w-full mt-5 pt-4 text-left"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <p className="label mb-2.5">What moved it</p>
      <div className="space-y-2.5">
        {factors.map((f) => {
          const c = STATUS_COLOR[f.status];
          return (
            <div key={f.key} className="flex items-center gap-3">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: c }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium leading-tight">
                  {FACTOR_LABEL[f.key]}
                  <span
                    className="ml-1.5 tabular-nums font-normal"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    {f.value}
                  </span>
                </p>
                <p className="text-[11px] leading-tight mt-0.5" style={{ color: "var(--fg-dim)" }}>
                  {f.note}
                </p>
              </div>
              {f.score != null ? (
                <div
                  className="relative rounded-full shrink-0"
                  style={{ width: 56, height: 5, background: "var(--bg-elevated)" }}
                  aria-label={`${f.score} of 100`}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${f.score}%`, background: c }}
                  />
                </div>
              ) : f.penalty ? (
                <span
                  className="text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full shrink-0"
                  style={{ color: c, background: `${c}1f` }}
                >
                  −{f.penalty}
                </span>
              ) : (
                <span className="text-[11px] shrink-0" style={{ color: "var(--fg-dim)" }}>
                  ✓
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FactorTile({ label, f }: { label: string; f: ReadinessFactor }) {
  const tint = f.status === "drag" ? "#f97316" : "var(--accent)";
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
        {label}
      </p>
      <p className="mt-1 text-[22px] font-bold tabular-nums" style={{ color: tint }}>
        {f.value}
      </p>
      <p className="text-[10px] mt-1" style={{ color: "var(--fg-dim)" }}>
        {f.note}
      </p>
    </div>
  );
}
