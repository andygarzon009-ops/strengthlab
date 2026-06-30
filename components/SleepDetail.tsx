// Server-rendered "Last night" sleep card for the recovery page. Renders a
// detailed view from the persisted sleepSummary: a quality verdict, the
// bed→wake window, a hypnogram-style stage timeline, and a per-stage breakdown
// scored against healthy reference ranges. No client interactivity needed, so
// this stays a server component.

export type SleepSummary = {
  asleepMin: number;
  inBedMin: number;
  deepMin: number;
  remMin: number;
  lightMin: number;
  awakeMin: number;
  startUtc: string;
  endUtc: string;
  offsetSec: number;
};

const STAGE = {
  deep: { label: "Deep", color: "#4338ca" },
  rem: { label: "REM", color: "#7c3aed" },
  light: { label: "Light", color: "#0ea5e9" },
  awake: { label: "Awake", color: "#52525b" },
} as const;

// Healthy share of total sleep, per stage (rough adult references). Used to
// tint each row and show a "typical X–Y%" hint — null means we don't grade it.
const TARGET: Record<keyof typeof STAGE, [number, number] | null> = {
  deep: [13, 23],
  rem: [20, 25],
  light: [45, 60],
  awake: null,
};

function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtClock(iso: string, offsetSec: number): string {
  const d = new Date(Date.parse(iso) + offsetSec * 1000);
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")}${ampm}`;
}

function verdict(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Excellent", color: "#22c55e" };
  if (score >= 60) return { label: "Good", color: "#22c55e" };
  if (score >= 40) return { label: "Fair", color: "#f59e0b" };
  return { label: "Poor", color: "#ef4444" };
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="13" r="4" fill="currentColor" />
      <path
        d="M12 3v2M4.2 7.2l1.4 1.4M19.8 7.2l-1.4 1.4M2 13h2M20 13h2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StageRow({
  stage,
  min,
  totalSleep,
}: {
  stage: keyof typeof STAGE;
  min: number;
  totalSleep: number;
}) {
  const meta = STAGE[stage];
  const pct = totalSleep > 0 ? (min / totalSleep) * 100 : 0;
  const target = TARGET[stage];
  const inRange = target ? pct >= target[0] && pct <= target[1] : null;
  const below = target ? pct < target[0] : false;
  const hintColor =
    inRange === null
      ? "var(--fg-dim)"
      : inRange
        ? "var(--accent)"
        : below
          ? "#f59e0b"
          : "var(--fg-dim)";

  return (
    <div className="flex items-center gap-3">
      <span
        className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
        style={{ background: meta.color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium">{meta.label}</span>
          <span className="text-[13px] tabular-nums">
            {fmtDur(min)}
            <span
              className="text-[11px] ml-1.5"
              style={{ color: "var(--fg-dim)" }}
            >
              {Math.round(pct)}%
            </span>
          </span>
        </div>
        {/* per-stage track: filled by share of the night, target band shaded */}
        <div
          className="relative mt-1.5 h-1.5 rounded-full overflow-hidden"
          style={{ background: "var(--bg-elevated)" }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${Math.min(100, pct)}%`,
              background: meta.color,
              opacity: 0.85,
            }}
          />
        </div>
        {target && (
          <p className="text-[10px] mt-1" style={{ color: hintColor }}>
            {inRange
              ? "in healthy range"
              : below
                ? `below typical ${target[0]}–${target[1]}%`
                : `above typical ${target[0]}–${target[1]}%`}
          </p>
        )}
      </div>
    </div>
  );
}

export default function SleepDetail({
  sleep,
  qualityScore,
}: {
  sleep: SleepSummary;
  qualityScore: number;
}) {
  const totalSleep =
    sleep.deepMin + sleep.remMin + sleep.lightMin || sleep.asleepMin || 1;
  const totalWithAwake = totalSleep + sleep.awakeMin || 1;
  const efficiency =
    sleep.inBedMin > 0
      ? Math.round((sleep.asleepMin / sleep.inBedMin) * 100)
      : null;
  const v = verdict(qualityScore);

  const segments: { key: keyof typeof STAGE; min: number }[] = [
    { key: "deep", min: sleep.deepMin },
    { key: "rem", min: sleep.remMin },
    { key: "light", min: sleep.lightMin },
    { key: "awake", min: sleep.awakeMin },
  ];

  return (
    <div className="mb-5">
      <p className="label mb-2">Last night</p>
      <div
        className="rounded-2xl p-5"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        {/* headline: asleep duration + quality verdict */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[28px] font-bold tabular-nums leading-none">
              {fmtDur(sleep.asleepMin)}
            </p>
            <p className="text-[12px] mt-1.5" style={{ color: "var(--fg-dim)" }}>
              {fmtDur(sleep.inBedMin)} in bed
              {efficiency != null && (
                <>
                  {" · "}
                  {efficiency}% efficiency
                </>
              )}
            </p>
          </div>
          <div
            className="flex flex-col items-center rounded-xl px-3 py-2"
            style={{
              background: "var(--bg-elevated)",
              border: `1px solid ${v.color}33`,
            }}
          >
            <span
              className="text-[20px] font-bold tabular-nums leading-none"
              style={{ color: v.color }}
            >
              {Math.round(qualityScore)}
            </span>
            <span
              className="text-[10px] font-semibold mt-0.5"
              style={{ color: v.color }}
            >
              {v.label}
            </span>
          </div>
        </div>

        {/* bed → wake window */}
        <div className="flex items-center justify-between mb-4">
          <span
            className="flex items-center gap-1.5 text-[12px] tabular-nums"
            style={{ color: "var(--fg-muted)" }}
          >
            <span style={{ color: STAGE.deep.color }}>
              <MoonIcon />
            </span>
            {fmtClock(sleep.startUtc, sleep.offsetSec)}
          </span>
          <div
            className="flex-1 mx-3 border-t border-dashed"
            style={{ borderColor: "var(--border)" }}
          />
          <span
            className="flex items-center gap-1.5 text-[12px] tabular-nums"
            style={{ color: "var(--fg-muted)" }}
          >
            <span style={{ color: "#f59e0b" }}>
              <SunIcon />
            </span>
            {fmtClock(sleep.endUtc, sleep.offsetSec)}
          </span>
        </div>

        {/* hypnogram-style composition bar */}
        <div className="flex h-3 rounded-full overflow-hidden mb-5">
          {segments.map((s) => {
            const pct = (s.min / totalWithAwake) * 100;
            if (pct <= 0) return null;
            return (
              <div
                key={s.key}
                style={{ width: `${pct}%`, background: STAGE[s.key].color }}
              />
            );
          })}
        </div>

        {/* per-stage breakdown */}
        <div className="space-y-3.5">
          {segments.map((s) => (
            <StageRow
              key={s.key}
              stage={s.key}
              min={s.min}
              totalSleep={totalSleep}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
