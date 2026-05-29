import type { CoachInsight } from "@/lib/coachInsights";

const TONE_ACCENT: Record<CoachInsight["tone"], string> = {
  positive: "#22c55e",
  neutral: "var(--accent)",
  warning: "#eab308",
};

/// Coach takeaway shown at the top of a lift drilldown. Headline carries the
/// single most important read; bullets back it up; the chip is a concrete
/// next target the athlete can act on.
export default function CoachInsightCard({
  insight,
}: {
  insight: CoachInsight;
}) {
  const accent = TONE_ACCENT[insight.tone];

  return (
    <section
      className="rounded-2xl p-4 mb-3 relative overflow-hidden"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Tone bar down the left edge. */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: accent, opacity: 0.7 }}
      />

      <div className="flex items-center gap-2 mb-2 pl-2">
        <span
          className="text-[10px] uppercase tracking-wider font-bold"
          style={{ color: accent }}
        >
          Coach Insight
        </span>
      </div>

      <p className="text-[15px] font-semibold leading-snug pl-2">
        {insight.headline}
      </p>

      {insight.points.length > 0 && (
        <ul className="mt-3 space-y-1.5 pl-2">
          {insight.points.map((p, i) => (
            <li key={i} className="flex gap-2 items-start">
              <span
                aria-hidden
                className="mt-[6px] w-1 h-1 rounded-full flex-shrink-0"
                style={{ background: accent, opacity: 0.6 }}
              />
              <span
                className="text-[12px] leading-snug"
                style={{ color: "var(--fg-muted)" }}
              >
                {p}
              </span>
            </li>
          ))}
        </ul>
      )}

      {insight.nextTarget && (
        <div
          className="mt-3 ml-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium"
          style={{
            background: "var(--accent-dim)",
            border: "1px solid var(--accent-ring)",
            color: "var(--fg)",
          }}
        >
          <span aria-hidden style={{ color: accent }}>
            →
          </span>
          {insight.nextTarget.label}
        </div>
      )}
    </section>
  );
}
