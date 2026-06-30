// Server-rendered "Last night" sleep card for the recovery page. Renders a
// detailed view from the persisted sleepSummary: a quality verdict, the
// bed→wake window, a stacked-lane hypnogram timeline (when per-stage segments
// are available), and a per-stage breakdown graded against healthy reference
// ranges. No client interactivity needed, so this stays a server component.

type SleepStageType = "deep" | "rem" | "light" | "awake";

type StageSeg = { type: SleepStageType; startMs: number; endMs: number };

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
  stages?: StageSeg[]; // present on nights synced after the hypnogram change
};

const STAGE: Record<
  SleepStageType,
  { label: string; color: string; min: keyof SleepSummary }
> = {
  awake: { label: "Awake", color: "#ef5a6f", min: "awakeMin" },
  rem: { label: "REM", color: "#38bdf8", min: "remMin" },
  light: { label: "Light", color: "#3b82f6", min: "lightMin" },
  deep: { label: "Deep", color: "#4338ca", min: "deepMin" },
};

// Top→bottom lane order, matching common sleep-app hypnograms.
const LANES: SleepStageType[] = ["awake", "rem", "light", "deep"];

// Healthy share of total sleep, per stage (rough adult references). Used to
// grade each stage with an in-range pill — null means we don't grade it.
const TARGET: Record<SleepStageType, [number, number] | null> = {
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

function fmtClockMs(ms: number, offsetSec: number): string {
  const d = new Date(ms + offsetSec * 1000);
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

function rangePill(stage: SleepStageType, pctOfSleep: number) {
  const target = TARGET[stage];
  if (!target) return null;
  const inRange = pctOfSleep >= target[0] && pctOfSleep <= target[1];
  const below = pctOfSleep < target[0];
  const color = inRange ? "#22c55e" : "#f59e0b";
  const text = inRange ? "In range" : below ? "Low" : "High";
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
      style={{ color, background: `${color}1f` }}
    >
      {text}
    </span>
  );
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

/// Stacked-lane hypnogram: one horizontal track per stage, with each segment
/// drawn at its true position across the night and a shared time axis below.
function Hypnogram({
  sleep,
  totalSleep,
}: {
  sleep: SleepSummary;
  totalSleep: number;
}) {
  const segs = sleep.stages ?? [];
  // Span the night from bedtime to wake, widened to cover any stray segment.
  const spanStart = Math.min(
    Date.parse(sleep.startUtc),
    ...segs.map((s) => s.startMs),
  );
  const spanEnd = Math.max(
    Date.parse(sleep.endUtc),
    ...segs.map((s) => s.endMs),
  );
  const span = Math.max(1, spanEnd - spanStart);
  const midMs = spanStart + span / 2;

  return (
    <div className="mb-5">
      <div className="space-y-3">
        {LANES.map((lane) => {
          const meta = STAGE[lane];
          const min = sleep[meta.min] as number;
          const pctOfSleep = totalSleep > 0 ? (min / totalSleep) * 100 : 0;
          const laneSegs = segs.filter((s) => s.type === lane);
          return (
            <div key={lane}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px]">
                  <span className="font-semibold">{meta.label}</span>
                  <span
                    className="ml-1.5 tabular-nums"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    {fmtDur(min)}
                  </span>
                </span>
                {rangePill(lane, pctOfSleep)}
              </div>
              <div
                className="relative w-full rounded-md overflow-hidden"
                style={{ height: 22, background: "var(--bg-elevated)" }}
              >
                {laneSegs.map((s, i) => {
                  const left = ((s.startMs - spanStart) / span) * 100;
                  const width = ((s.endMs - s.startMs) / span) * 100;
                  return (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 rounded-md"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        minWidth: 3,
                        background: meta.color,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* shared time axis */}
      <div className="flex justify-between mt-2">
        {[spanStart, midMs, spanEnd].map((ms, i) => (
          <span
            key={i}
            className="text-[10px] tabular-nums"
            style={{ color: "var(--fg-dim)" }}
          >
            {fmtClockMs(ms, sleep.offsetSec)}
          </span>
        ))}
      </div>
    </div>
  );
}

/// Fallback for nights stored before segments were captured: a single stacked
/// composition bar plus a graded per-stage breakdown.
function CompositionFallback({
  sleep,
  totalSleep,
}: {
  sleep: SleepSummary;
  totalSleep: number;
}) {
  const totalWithAwake = totalSleep + sleep.awakeMin || 1;
  const order: SleepStageType[] = ["deep", "rem", "light", "awake"];
  return (
    <>
      <div className="flex h-3 rounded-full overflow-hidden mb-5">
        {order.map((k) => {
          const min = sleep[STAGE[k].min] as number;
          const pct = (min / totalWithAwake) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={k}
              style={{ width: `${pct}%`, background: STAGE[k].color }}
            />
          );
        })}
      </div>
      <div className="space-y-3.5">
        {order.map((k) => {
          const min = sleep[STAGE[k].min] as number;
          const pct = totalSleep > 0 ? (min / totalSleep) * 100 : 0;
          const target = TARGET[k];
          const inRange = target
            ? pct >= target[0] && pct <= target[1]
            : null;
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
            <div key={k} className="flex items-center gap-3">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: STAGE[k].color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium">
                    {STAGE[k].label}
                  </span>
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
                <div
                  className="relative mt-1.5 h-1.5 rounded-full overflow-hidden"
                  style={{ background: "var(--bg-elevated)" }}
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${Math.min(100, pct)}%`,
                      background: STAGE[k].color,
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
        })}
      </div>
    </>
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
  const efficiency =
    sleep.inBedMin > 0
      ? Math.round((sleep.asleepMin / sleep.inBedMin) * 100)
      : null;
  const v = verdict(qualityScore);
  const hasTimeline = (sleep.stages?.length ?? 0) > 0;

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

        {hasTimeline ? (
          <Hypnogram sleep={sleep} totalSleep={totalSleep} />
        ) : (
          <CompositionFallback sleep={sleep} totalSleep={totalSleep} />
        )}
      </div>
    </div>
  );
}
