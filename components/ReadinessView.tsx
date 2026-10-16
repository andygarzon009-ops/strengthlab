// Everything below the readiness page header, from plain props, so the page
// stays a thin data loader.

import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import ReadinessHero, { scaleColor } from "@/components/ReadinessHero";
import RecoveryDays from "@/components/RecoveryDays";
import SleepDetail, { type SleepSummary } from "@/components/SleepDetail";
import SleepHistoryChart, {
  type SleepNightHistory,
} from "@/components/SleepHistoryChart";
import Spo2Card from "@/components/Spo2Card";
import { sleepQualityScore } from "@/lib/sleepScore";
import type { ReadinessBand, ReadinessFactor } from "@/lib/readiness";

export type ReadinessDay = {
  dateKey: string;
  score: number;
  band: string | null;
  hrvMs: number | null;
  restingHr: number | null;
};

export type ReadinessViewProps = {
  score: number;
  band: ReadinessBand;
  dateLabel: string;
  updatedLabel: string | null;
  factors: ReadinessFactor[];
  days: ReadinessDay[]; // oldest → newest
  lastNight: SleepSummary | null;
  lastNightKey: string | null;
  sleepHistory: SleepNightHistory[];
  hrv: { now: number | null; baseline: number | null };
  rhr: { now: number | null; baseline: number | null };
};

const GOOD = "#4ade80";
const WARN = "#fb923c";

function Sparkline({ series, color }: { series: number[]; color: string }) {
  if (series.length < 2) return null;
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  const span = hi - lo || 1;
  const pts = series.map(
    (v, i) =>
      `${(i / (series.length - 1)) * 100},${26 - ((v - lo) / span) * 22}`,
  );
  return (
    <svg
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      className="block w-full mt-2"
      style={{ height: 28 }}
      aria-hidden
    >
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        opacity={0.9}
      />
    </svg>
  );
}

function VitalTile({
  label,
  value,
  unit,
  note,
  good,
  series,
  href,
}: {
  href: string;
  label: string;
  value: string;
  unit: string;
  note: string;
  good: boolean | null;
  series?: number[];
}) {
  const tint = good === null ? "var(--fg)" : good ? GOOD : WARN;
  return (
    <Link
      href={href}
      className="block rounded-2xl px-4 pt-3.5 pb-3 active:opacity-80"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
    >
      <p className="flex items-center justify-between text-[12px] font-semibold" style={{ color: "var(--fg-muted)" }}>
        {label}
        <ChevronRight size={14} strokeWidth={2.2} style={{ opacity: 0.6 }} />
      </p>
      <p className="mt-1 leading-none">
        <span className="text-[26px] font-bold tabular-nums" style={{ color: tint, letterSpacing: "-0.02em" }}>
          {value}
        </span>
        {unit && (
          <span className="text-[12px] ml-1" style={{ color: "var(--fg-muted)" }}>
            {unit}
          </span>
        )}
      </p>
      <p className="text-[11px] mt-1.5" style={{ color: "var(--fg-muted)" }}>
        {note}
      </p>
      {series && <Sparkline series={series} color={good === false ? WARN : GOOD} />}
    </Link>
  );
}

export default function ReadinessView(p: ReadinessViewProps) {
  const factor = (k: ReadinessFactor["key"]) =>
    p.factors.find((f) => f.key === k) ?? null;
  const resp = factor("resp");
  const temp = factor("temp");
  const hrvSeries = p.days.map((d) => d.hrvMs).filter((v): v is number => v != null);
  const rhrSeries = p.days.map((d) => d.restingHr).filter((v): v is number => v != null);
  const sleepQuality = p.lastNight
    ? sleepQualityScore(p.lastNight.asleepMin, p.lastNight.deepMin, p.lastNight.remMin)
    : null;

  return (
    <>
      <ReadinessHero
        score={p.score}
        band={p.band}
        dateLabel={p.dateLabel}
        updatedLabel={p.updatedLabel}
        factors={p.factors}
      />

      {p.days.length >= 2 ? (
        <RecoveryDays
          days={p.days}
          history={p.sleepHistory}
          lastNight={p.lastNight}
          lastNightKey={p.lastNightKey}
        />
      ) : (
        p.lastNight &&
        sleepQuality != null && (
          <SleepDetail sleep={p.lastNight} qualityScore={sleepQuality} />
        )
      )}

      <p className="label mb-2" style={{ color: "var(--fg-muted)" }}>
        Overnight vitals
      </p>
      <div className="grid grid-cols-2 gap-2 mb-5">
        <VitalTile
          label="HRV"
          href="/recovery/hrv"
          value={p.hrv.now != null ? `${Math.round(p.hrv.now)}` : "—"}
          unit="ms"
          note={
            p.hrv.baseline != null
              ? `usual ${Math.round(p.hrv.baseline)} ms`
              : "building baseline"
          }
          good={
            p.hrv.now != null && p.hrv.baseline != null
              ? p.hrv.now >= p.hrv.baseline * 0.95
              : null
          }
          series={hrvSeries}
        />
        <VitalTile
          label="Resting HR"
          href="/recovery/rhr"
          value={p.rhr.now != null ? `${p.rhr.now}` : "—"}
          unit="bpm"
          note={
            p.rhr.baseline != null ? `usual ${p.rhr.baseline} bpm` : "building baseline"
          }
          good={
            p.rhr.now != null && p.rhr.baseline != null
              ? p.rhr.now <= p.rhr.baseline + 1
              : null
          }
          series={rhrSeries}
        />
        {resp && (
          <VitalTile
            label="Breathing"
          href="/recovery/resp"
            value={resp.value.replace(" /min", "")}
            unit="/min"
            note={resp.note}
            good={!resp.penalty}
          />
        )}
        {temp && (
          <VitalTile
            label="Skin temp"
          href="/recovery/temp"
            value={temp.value}
            unit=""
            note={temp.note === "normal" ? "vs your normal" : temp.note}
            good={!temp.penalty}
          />
        )}
      </div>

      <Spo2Card href="/recovery/spo2" />

      {p.sleepHistory.length >= 2 && <SleepHistoryChart history={p.sleepHistory} />}

      <Link
        href="/group?coach=1"
        className="flex items-center justify-center gap-2 w-full rounded-2xl py-3.5 text-[15px] font-semibold"
        style={{
          background: "linear-gradient(180deg, #34d36b 0%, #22c55e 100%)",
          color: "#06150b",
          boxShadow: "0 6px 24px -8px rgba(34,197,94,0.55)",
        }}
      >
        <Sparkles size={17} strokeWidth={2.2} />
        Ask your coach about today
      </Link>

      <p className="text-[12px] mt-4 mb-8 leading-relaxed" style={{ color: "var(--fg-muted)" }}>
        Readiness blends last night&apos;s sleep, overnight HRV and resting
        heart rate against your own baseline, then takes points off for a
        skin-temperature spike, a raised breathing rate, or two unusually hard
        training days. Wear your tracker to bed for the most accurate score.
      </p>
    </>
  );
}

export { scaleColor };
