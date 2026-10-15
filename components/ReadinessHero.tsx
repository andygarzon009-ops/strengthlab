// Top of the readiness page: a tick-mark gauge that fills red→amber→green up
// to today's score, the band and what to do about it, then the three core
// signals as mini rings and any deductions as chips underneath.
//
// Plain SVG, no hooks — renders on the server.

import {
  FACTOR_LABEL,
  type ReadinessBand,
  type ReadinessFactor,
} from "@/lib/readiness";
import TickGauge, { scaleColor } from "@/components/TickGauge";

const BAND_LABEL: Record<ReadinessBand, string> = {
  primed: "Primed",
  moderate: "Steady",
  low: "Run down",
};
const BAND_REC: Record<ReadinessBand, string> = {
  primed: "Your body's ready. A good day to push hard or chase a PR.",
  moderate: "Train as planned, but don't force the heavy sets.",
  low: "Under-recovered. Go light, move easy, or take the rest day.",
};

export { scaleColor };

function Gauge({ score }: { score: number }) {
  return <TickGauge score={score} size={240} id="rdy-glow" />;
}

function MiniRing({ score, color }: { score: number; color: string }) {
  const r = 17;
  const circ = 2 * Math.PI * r;
  const f = (Math.max(0, Math.min(100, score)) / 100) * circ;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
      <circle cx="22" cy="22" r={r} fill="none" stroke="#26262b" strokeWidth="4.5" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeDasharray={`${f} ${circ - f}`}
        transform="rotate(-90 22 22)"
      />
      <text
        x="22"
        y="26.5"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill="var(--fg)"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {score}
      </text>
    </svg>
  );
}

export default function ReadinessHero({
  score,
  band,
  dateLabel,
  updatedLabel,
  factors,
}: {
  score: number;
  band: ReadinessBand;
  dateLabel: string;
  updatedLabel: string | null;
  factors: ReadinessFactor[];
}) {
  const color = scaleColor(score);
  const core = factors.filter((f) => f.score != null);
  const mods = factors.filter((f) => f.score == null);
  const hits = mods.filter((f) => (f.penalty ?? 0) > 0);

  return (
    <section
      className="relative rounded-3xl px-5 pt-5 pb-5 mb-5 overflow-hidden"
      style={{
        background: `radial-gradient(140% 90% at 50% 0%, ${scaleColor(score, 0.1)} 0%, transparent 55%), var(--bg-card)`,
        border: "1px solid var(--border-strong)",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold" style={{ color: "var(--fg-muted)" }}>
          {dateLabel}
        </p>
        {updatedLabel && (
          <p className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
            {updatedLabel}
          </p>
        )}
      </div>

      <div className="relative -mt-1">
        <div className="flex justify-center"><Gauge score={score} /></div>
        <div className="absolute inset-0 flex flex-col items-center justify-center pb-2">
          <span
            className="text-[11px] font-semibold uppercase"
            style={{ color: "var(--fg-muted)", letterSpacing: "0.16em" }}
          >
            Readiness
          </span>
          <span
            className="text-[68px] font-bold leading-none tabular-nums mt-1"
            style={{ letterSpacing: "-0.04em" }}
          >
            {score}
          </span>
        </div>
        <div className="absolute left-0 right-0 flex justify-center" style={{ bottom: 18 }}>
          <span
            className="text-[13px] font-bold px-3.5 py-1 rounded-full"
            style={{
              color,
              background: scaleColor(score, 0.13),
              border: `1px solid ${scaleColor(score, 0.3)}`,
            }}
          >
            {BAND_LABEL[band]}
          </span>
        </div>
      </div>

      <p
        className="text-[15px] leading-snug text-center max-w-[19rem] mx-auto -mt-1"
        style={{ textWrap: "balance" }}
      >
        {BAND_REC[band]}
      </p>

      {core.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-5">
          {core.map((f) => {
            const c = scaleColor(f.score!);
            return (
              <div
                key={f.key}
                className="rounded-2xl py-3 px-2 flex flex-col items-center text-center"
                style={{ background: "var(--bg-elevated)" }}
              >
                <MiniRing score={f.score!} color={c} />
                <p className="text-[12px] font-semibold mt-1.5">{FACTOR_LABEL[f.key]}</p>
                <p className="text-[12px] tabular-nums" style={{ color: "var(--fg)" }}>
                  {f.value}
                </p>
                <p className="text-[11px] leading-tight" style={{ color: "var(--fg-muted)" }}>
                  {f.note}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {mods.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3 justify-center">
          {hits.length === 0 ? (
            <span
              className="text-[12px] font-medium px-3 py-1.5 rounded-full"
              style={{ color: "#4ade80", background: "rgba(34,197,94,0.1)" }}
            >
              ✓ No warning signs: temp, breathing and load all normal
            </span>
          ) : (
            mods.map((f) => {
              const hit = (f.penalty ?? 0) > 0;
              const c = hit ? "#fb923c" : "#4ade80";
              return (
                <span
                  key={f.key}
                  className="text-[12px] font-medium px-3 py-1.5 rounded-full tabular-nums"
                  style={{ color: c, background: hit ? "rgba(249,115,22,0.12)" : "rgba(34,197,94,0.08)" }}
                >
                  {FACTOR_LABEL[f.key]} {f.value}
                  {hit ? <b className="ml-1.5">−{f.penalty}</b> : " ✓"}
                </span>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}
