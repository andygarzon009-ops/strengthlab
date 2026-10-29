// One night of sleep: the headline (time asleep + sleep score), the bed→wake
// window, the stepped hypnogram, a 2×2 of stage tiles against their typical
// ranges, and a strip of quality stats. Nights synced before per-segment
// stages were captured swap the hypnogram for a single composition bar.

import Link from "next/link";
import SleepHypnogram from "@/components/SleepHypnogram";
import { STAGE_STYLE, type StageSeg } from "@/lib/sleepStages";
import { STAGE_TARGET as TARGET, stageVerdict } from "@/lib/sleepStageInfo";

export type SleepSummary = {
  asleepMin: number;
  inBedMin: number;
  deepMin: number;
  remMin: number;
  lightMin: number;
  awakeMin: number;
  // Present on last night and on history nights synced after the schema bump;
  // guarded so an older history night still renders its composition.
  startUtc?: string;
  endUtc?: string;
  offsetSec?: number;
  toSleepMin?: number;
  stages?: StageSeg[];
};

type Stage = "deep" | "rem" | "light" | "awake";

const MIN_KEY: Record<Stage, "deepMin" | "remMin" | "lightMin" | "awakeMin"> = {
  deep: "deepMin",
  rem: "remMin",
  light: "lightMin",
  awake: "awakeMin",
};

const GOOD = "#22c55e";
const WARN = "#f59e0b";
const BAD = "#ef4444";

function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
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
  if (score >= 80) return { label: "Excellent", color: GOOD };
  if (score >= 60) return { label: "Good", color: GOOD };
  if (score >= 40) return { label: "Fair", color: WARN };
  return { label: "Poor", color: BAD };
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: 60, height: 60 }}>
      <svg width="60" height="60" viewBox="0 0 60 60" aria-hidden>
        <circle cx="30" cy="30" r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth="5" />
        <circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          transform="rotate(-90 30 30)"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[17px] font-bold tabular-nums">
        {Math.round(score)}
      </span>
    </div>
  );
}

function MoonIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" fill="currentColor" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="13" r="4" fill="currentColor" />
      <path
        d="M12 3v2M4.2 7.2l1.4 1.4M19.8 7.2l-1.4 1.4M2 13h2M20 13h2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/// Stage tile: duration, share of the night, and a slim track with the
/// typical range shaded and a tick where this night landed. Opens the stage's
/// own page, on this night.
function StageTile({
  stage,
  min,
  totalSleep,
  awakeCount,
  nightDate,
}: {
  stage: Stage;
  min: number;
  totalSleep: number;
  awakeCount: number;
  nightDate?: string;
}) {
  const st = STAGE_STYLE[stage];
  const pct = totalSleep > 0 ? (min / totalSleep) * 100 : 0;
  const target = stage === "awake" ? null : TARGET[stage];
  const verdict = stageVerdict(stage, min, totalSleep);
  const status = { text: verdict.text, color: verdict.good ? GOOD : WARN };
  const scale = stage === "light" ? 80 : 40; // % axis for the track
  return (
    <Link
      href={`/recovery/${stage}${nightDate ? `?night=${nightDate}` : ""}`}
      className="block rounded-xl p-3 active:opacity-70"
      style={{ background: "var(--bg-elevated)" }}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: st.top }} />
          {st.label}
        </span>
        <span className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: status.color }}>
          {status.text}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--fg-dim)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </div>
      <p className="text-[19px] font-bold tabular-nums leading-none mt-2">
        {fmtDur(min)}
      </p>
      <p className="text-[11px] tabular-nums mt-1" style={{ color: "var(--fg-muted)" }}>
        {target
          ? `${Math.round(pct)}% · typical ${target[0]}–${target[1]}%`
          : `${awakeCount} wake-up${awakeCount === 1 ? "" : "s"}`}
      </p>
      {target && (
        <div
          className="relative mt-2 rounded-full"
          style={{ height: 4, background: "var(--bg-card)" }}
        >
          <div
            className="absolute top-0 bottom-0 rounded-full"
            style={{
              left: `${(target[0] / scale) * 100}%`,
              width: `${((target[1] - target[0]) / scale) * 100}%`,
              background: `${st.color}55`,
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              left: `${Math.min(100, (pct / scale) * 100)}%`,
              top: -2,
              width: 8,
              height: 8,
              marginLeft: -4,
              background: st.top,
              boxShadow: "0 0 0 2px var(--bg-elevated)",
            }}
          />
        </div>
      )}
    </Link>
  );
}

function Stat({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean | null;
}) {
  return (
    <div className="flex-1 text-center px-1">
      <p
        className="text-[15px] font-bold tabular-nums"
        style={{ color: ok === false ? WARN : "var(--fg)" }}
      >
        {value}
      </p>
      <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
        {label}
      </p>
    </div>
  );
}

export default function SleepDetail({
  sleep,
  qualityScore,
  title = "Last night",
  nightDate,
}: {
  sleep: SleepSummary;
  qualityScore: number;
  title?: string;
  /// Wake date of this night, so a stage tile opens its page on it.
  nightDate?: string;
}) {
  const totalSleep =
    sleep.deepMin + sleep.remMin + sleep.lightMin || sleep.asleepMin || 1;
  const efficiency =
    sleep.inBedMin > 0
      ? Math.round((sleep.asleepMin / sleep.inBedMin) * 100)
      : null;
  const v = verdict(qualityScore);
  const hasWindow =
    !!sleep.startUtc && !!sleep.endUtc && sleep.offsetSec != null;
  const hasTimeline = hasWindow && (sleep.stages?.length ?? 0) > 0;
  const segs = sleep.stages ?? [];
  const awakeCount = segs.filter((s) => s.type === "awake").length;
  const toSleep = sleep.toSleepMin ?? 0;

  return (
    <div className="mb-5">
      <p className="label mb-2">{title}</p>
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
      >
        {/* headline, on a faint night-sky wash */}
        <div
          className="px-5 pt-5 pb-4"
          style={{
            background:
              "radial-gradient(120% 100% at 0% 0%, rgba(79,70,229,0.16) 0%, transparent 60%)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[34px] font-bold tabular-nums leading-none tracking-tight">
                {fmtDur(sleep.asleepMin)}
              </p>
              <p className="text-[12px] mt-2" style={{ color: "var(--fg-muted)" }}>
                asleep · {fmtDur(sleep.inBedMin)} in bed
              </p>
            </div>
            <div className="flex flex-col items-center">
              <ScoreRing score={qualityScore} color={v.color} />
              <span className="text-[11px] font-semibold mt-1" style={{ color: v.color }}>
                {v.label}
              </span>
            </div>
          </div>

          {hasWindow && (
            <div
              className="flex items-center justify-between mt-4 rounded-full px-3 py-1.5"
              style={{ background: "var(--bg-elevated)" }}
            >
              <span className="flex items-center gap-1.5 text-[12px] font-semibold tabular-nums">
                <span style={{ color: STAGE_STYLE.deep.top }}>
                  <MoonIcon />
                </span>
                {fmtClock(sleep.startUtc!, sleep.offsetSec!)}
              </span>
              <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                {fmtDur(sleep.inBedMin)}
              </span>
              <span className="flex items-center gap-1.5 text-[12px] font-semibold tabular-nums">
                {fmtClock(sleep.endUtc!, sleep.offsetSec!)}
                <span style={{ color: WARN }}>
                  <SunIcon />
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="px-4 pb-4">
          {hasTimeline ? (
            <SleepHypnogram
              stages={sleep.stages!}
              startUtc={sleep.startUtc!}
              endUtc={sleep.endUtc!}
              offsetSec={sleep.offsetSec!}
            />
          ) : (
            <div className="flex h-3 rounded-full overflow-hidden mt-1">
              {(["deep", "light", "rem", "awake"] as Stage[]).map((k) => {
                const min = sleep[MIN_KEY[k]];
                if (min <= 0) return null;
                return (
                  <div
                    key={k}
                    style={{ flexGrow: min, background: STAGE_STYLE[k].color }}
                  />
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mt-4">
            {(["deep", "rem", "light", "awake"] as Stage[]).map((k) => (
              <StageTile
                key={k}
                stage={k}
                min={sleep[MIN_KEY[k]]}
                totalSleep={totalSleep}
                awakeCount={awakeCount}
                nightDate={nightDate}
              />
            ))}
          </div>

          <div
            className="flex items-center mt-3 rounded-xl py-3"
            style={{ background: "var(--bg-elevated)" }}
          >
            <Stat
              label="Efficiency"
              value={efficiency != null ? `${efficiency}%` : "—"}
              ok={efficiency != null ? efficiency >= 85 : null}
            />
            <div className="w-px self-stretch" style={{ background: "var(--border)" }} />
            <Stat
              label="Fell asleep in"
              value={toSleep > 0 ? `${toSleep}m` : "—"}
              ok={toSleep > 0 ? toSleep <= 20 : null}
            />
            <div className="w-px self-stretch" style={{ background: "var(--border)" }} />
            <Stat
              label="Deep + REM"
              value={fmtDur(sleep.deepMin + sleep.remMin)}
              ok={(sleep.deepMin + sleep.remMin) / totalSleep >= 0.33}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
