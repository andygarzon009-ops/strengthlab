"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import FuelDetail, { type NutritionResponse } from "@/components/FuelDetail";
import TickGauge from "@/components/TickGauge";

/// Continuous performance color: red (0) → amber (50) → green (100). Used for
/// the glance rings so the hue itself signals how well you're doing.
function scoreColor(pct: number): string {
  const p = Math.max(0, Math.min(100, pct));
  return `hsl(${Math.round((p / 100) * 120)}, 80%, 48%)`;
}

const ICON_PROPS = {
  width: 12,
  height: 12,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
function FlameIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}
function ZapIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </svg>
  );
}

export type RecoveryGlance = {
  score: number;
  color: string;
  label: string; // e.g. "Moderate"
  sub: string; // e.g. "Train as planned"
  sleepLabel: string | null;
  drivers: string[];
};
export type ActivityGlance = {
  pct: number; // composite goal completion 0–100
  color: string;
  moveCal: number;
  rows: { label: string; value: number; goal: number; unit: string; color: string; done: boolean }[];
};

type Section = "recovery" | "fuel" | "activity";

/// Fuel / Activity beside the gauge: label + reading on one line, a slim bar
/// under it. The whole row is the tap target that expands its detail.
function MeterRow({
  label,
  icon,
  pct,
  color,
  value,
  sub,
  active,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  pct: number;
  color: string;
  value: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className="w-full text-left rounded-xl px-2.5 py-2 transition-colors"
      style={{ background: active ? "var(--bg-elevated)" : "transparent" }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold">
          <span style={{ color }}>{icon}</span>
          {label}
        </span>
        <span className="text-[12px] tabular-nums truncate" style={{ color: "var(--fg-muted)" }}>
          {value && (
            <b className="font-bold mr-1" style={{ color: "var(--fg)" }}>
              {value}
            </b>
          )}
          {sub}
        </span>
      </div>
      <div
        className="mt-1.5 h-[7px] rounded-full overflow-hidden"
        style={{ background: "var(--bg-elevated)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%`,
            background: color,
            boxShadow: pct > 0 ? `0 0 8px ${color}` : undefined,
          }}
        />
      </div>
    </button>
  );
}

function ActivityBar({
  label,
  value,
  goal,
  unit,
  color,
  done,
}: ActivityGlance["rows"][number]) {
  const pct = Math.min(1, goal > 0 ? value / goal : 0);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--fg-dim)" }}>
          {label}
        </span>
        <span className="text-[12px] font-bold tabular-nums">
          <span style={{ color }}>{value}</span>
          <span style={{ color: "var(--fg-dim)" }}> / {goal}{unit ? ` ${unit}` : ""}</span>
          {done && <span style={{ color }}> ✓</span>}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: color }} />
      </div>
    </div>
  );
}

/// Direction-A "Daily Glance": the day's three scores — Recovery, Fuel,
/// Activity — as a compact ring row at the top of the feed, each expanding its
/// full detail inline on tap (one open at a time). Replaces the three separate
/// stacked cards. Recovery + activity come server-side as props; fuel is fetched
/// client-side from the shared endpoint.
export default function DailyGlance({
  recovery,
  activity,
  children,
}: {
  recovery: RecoveryGlance | null;
  activity: ActivityGlance | null;
  children: ReactNode;
}) {
  const [fuel, setFuel] = useState<NutritionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Section | null>(null);

  // Stale-while-revalidate: paint the last cached Fuel value instantly (the
  // live Google Health call is slow, so re-fetching on every page open made
  // this ring lag/pop-in), then refresh in the background. The cache read is
  // deferred to a microtask so it isn't a synchronous in-effect setState (and
  // so SSR/first paint stays consistent — no hydration flash).
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const raw = localStorage.getItem("fuelGlanceCache");
        if (raw) {
          setFuel(JSON.parse(raw) as NutritionResponse);
          setLoading(false);
        }
      } catch {}
    });
    fetch("/api/health/nutrition", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: NutritionResponse | null) => {
        if (!active) return;
        setLoading(false);
        if (d) {
          setFuel(d);
          try {
            localStorage.setItem("fuelGlanceCache", JSON.stringify(d));
          } catch {}
        }
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const toggle = (s: Section) => setOpen((cur) => (cur === s ? null : s));

  // Fuel ring presentation across its states.
  const fuelRing = (() => {
    if (loading && !fuel)
      return { value: "·", color: "var(--fg-dim)", sub: "loading…" };
    if (!fuel || !fuel.connected || fuel.needsReconnect)
      return { value: "—", color: "var(--fg-dim)", sub: "not connected" };
    if (fuel.needsNutritionScope)
      return { value: "—", color: "var(--fg-dim)", sub: "reconnect health" };
    if (fuel.needsProfile) return { value: "—", color: "var(--fg-dim)", sub: "set profile" };
    if (!fuel.loggedToday) return { value: "—", color: "var(--fg-dim)", sub: "not logged" };
    // Mid-day there's no grade to give — show how much of the targets are in.
    // The score only appears once the eating day has closed.
    if (fuel.partial && fuel.progress)
      return {
        value: `${fuel.progress.pct}%`,
        color: "#38bdf8",
        sub: "logged so far",
      };
    const s = fuel.score!;
    return { value: String(s.score), color: scoreColor(s.score), sub: s.rating };
  })();

  // Bar fill: the day's score once it's graded, how much is in so far mid-day.
  const fuelPct =
    fuel?.loggedToday && fuel.partial && fuel.progress
      ? fuel.progress.pct
      : fuel?.loggedToday && fuel.score
        ? fuel.score.score
        : 0;

  const fuelInteractive =
    !!fuel && fuel.connected && !fuel.needsReconnect;

  const r = recovery;
  return (
    <section aria-label="Today" className="card mb-3 overflow-hidden">
      <div className="flex items-center gap-3 px-3 pt-3 pb-2">
        {/* Readiness leads: the gauge, number and band. Tap to expand. */}
        <button
          type="button"
          onClick={() => r && toggle("recovery")}
          aria-label={r ? `Readiness ${r.score}, ${r.label}` : "Readiness: no data"}
          aria-expanded={open === "recovery"}
          className="relative shrink-0 rounded-2xl transition-colors"
          style={{ background: open === "recovery" ? "var(--bg-elevated)" : "transparent" }}
        >
          <TickGauge score={r?.score ?? null} size={112} id="feed-gauge" ticks={40} />
          <span className="absolute inset-0 flex flex-col items-center justify-center pb-1">
            <span
              className="text-[34px] font-bold leading-none tabular-nums"
              style={{ letterSpacing: "-0.04em" }}
            >
              {r?.score ?? "—"}
            </span>
            <span
              className="text-[9px] font-semibold uppercase mt-1"
              style={{ color: "var(--fg-muted)", letterSpacing: "0.14em" }}
            >
              Ready
            </span>
          </span>
          {r && (
            <span
              className="absolute left-0 right-0 text-center text-[11px] font-bold"
              style={{ bottom: 4, color: r.color }}
            >
              {r.label}
            </span>
          )}
        </button>

        <div className="flex-1 min-w-0 space-y-1">
          <MeterRow
            label="Fuel"
            icon={<FlameIcon />}
            pct={fuelPct}
            color={fuelRing.color}
            value={fuelRing.value === "—" || fuelRing.value === "·" ? "" : fuelRing.value}
            sub={fuelRing.sub}
            active={open === "fuel"}
            onClick={() => fuelInteractive && toggle("fuel")}
          />
          {activity && (
            <MeterRow
              label="Activity"
              icon={<ZapIcon />}
              pct={activity.pct}
              color={scoreColor(activity.pct)}
              value={`${activity.pct}%`}
              sub={`${activity.moveCal.toLocaleString()} cal`}
              active={open === "activity"}
              onClick={() => toggle("activity")}
            />
          )}
        </div>
      </div>

      {open && (
        <div className="mx-4 mb-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          {open === "recovery" && recovery && (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[15px] font-semibold" style={{ color: scoreColor(recovery.score) }}>
                  {recovery.label}
                </p>
                <Link href="/recovery" className="text-[12px]" style={{ color: "var(--accent)" }}>
                  Details →
                </Link>
              </div>
              <p className="text-[12px] mt-0.5" style={{ color: "var(--fg-dim)" }}>
                {recovery.sub}
              </p>
              {recovery.sleepLabel && (
                <p className="text-[13px] font-semibold mt-2 tabular-nums">
                  🌙 {recovery.sleepLabel}{" "}
                  <span className="font-normal" style={{ color: "var(--fg-dim)" }}>sleep</span>
                </p>
              )}
              {recovery.drivers.length > 0 && (
                <p className="text-[11px] mt-1 tabular-nums" style={{ color: "var(--fg-dim)" }}>
                  {recovery.drivers.join(" · ")}
                </p>
              )}
            </div>
          )}

          {open === "fuel" && fuel && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>
                  🎯 {fuel.targets?.phaseLabel ?? "Nutrition"}
                </span>
                <Link href="/fuel" className="text-[12px]" style={{ color: "var(--accent)" }}>
                  Details →
                </Link>
              </div>
              <FuelDetail data={fuel} />
            </div>
          )}

          {open === "activity" && activity && (
            <div>
              <div className="flex items-center justify-end mb-2">
                <Link href="/activity" className="text-[12px]" style={{ color: "var(--accent)" }}>
                  Details →
                </Link>
              </div>
              <div className="space-y-3">
                {activity.rows.map((r) => (
                  <ActivityBar key={r.label} {...r} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* What to do today — the coach's line lives here. */}
      <div
        className="px-[18px] pt-3.5 pb-[18px]"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        {children}
      </div>
    </section>
  );
}
