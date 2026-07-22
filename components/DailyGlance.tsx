"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import FuelDetail, { type NutritionResponse } from "@/components/FuelDetail";

/// Continuous performance color: red (0) → amber (50) → green (100). Used for
/// the glance rings so the hue itself signals how well you're doing.
function scoreColor(pct: number): string {
  const p = Math.max(0, Math.min(100, pct));
  return `hsl(${Math.round((p / 100) * 120)}, 80%, 48%)`;
}

const ICON_PROPS = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
function BatteryIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="2" y="7" width="16" height="10" rx="2" />
      <path d="M22 11v2" />
    </svg>
  );
}
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

/// SVG ring with a centered value (number or "%"). Muted when no data.
function Ring({
  value,
  color,
  active,
}: {
  value: string;
  color: string;
  active: boolean;
}) {
  const r = 30;
  const c = 2 * Math.PI * r;
  // pct only used for stroke fill; derive from a numeric value when present.
  const num = parseInt(value, 10);
  const frac = Number.isFinite(num) ? Math.max(0, Math.min(100, num)) / 100 : 0;
  const filled = frac * c;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72">
      <circle cx="36" cy="36" r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth="6" />
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${c - filled}`}
        transform="rotate(-90 36 36)"
        style={{ filter: active ? `drop-shadow(0 0 5px ${color}99)` : undefined }}
      />
      <text x="36" y="41" textAnchor="middle" fontSize="19" fontWeight="700" fill="var(--fg)">
        {value}
      </text>
    </svg>
  );
}

function Tile({
  ringValue,
  ringColor,
  label,
  icon,
  sub,
  active,
  onClick,
}: {
  ringValue: string;
  ringColor: string;
  label: string;
  icon: ReactNode;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 flex flex-col items-center gap-1 rounded-xl py-2 transition-colors"
      style={{ background: active ? "var(--bg-elevated)" : "transparent" }}
    >
      <Ring value={ringValue} color={ringColor} active={active} />
      <span
        className="text-[10px] uppercase tracking-wider font-semibold mt-0.5"
        style={{ color: "var(--fg-dim)" }}
      >
        {label}
      </span>
      <span style={{ color: ringColor }}>{icon}</span>
      <span
        className="text-[11px] leading-tight text-center px-1"
        style={{ color: active ? "var(--fg)" : "var(--fg-dim)" }}
      >
        {sub}
      </span>
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
}: {
  recovery: RecoveryGlance | null;
  activity: ActivityGlance | null;
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
    if (fuel.needsProfile) return { value: "—", color: "var(--fg-dim)", sub: "set profile" };
    if (!fuel.loggedToday) return { value: "—", color: "var(--fg-dim)", sub: "not logged" };
    const s = fuel.score!;
    return { value: String(s.score), color: scoreColor(s.score), sub: s.rating };
  })();

  const fuelInteractive =
    !!fuel && fuel.connected && !fuel.needsReconnect;

  return (
    <div
      className="rounded-2xl p-3 mb-3"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-stretch gap-1">
        {recovery && (
          <Tile
            ringValue={String(recovery.score)}
            ringColor={scoreColor(recovery.score)}
            label="Recovery"
            icon={<BatteryIcon />}
            sub={recovery.label}
            active={open === "recovery"}
            onClick={() => toggle("recovery")}
          />
        )}
        <Tile
          ringValue={fuelRing.value}
          ringColor={fuelRing.color}
          label="Fuel"
          icon={<FlameIcon />}
          sub={fuelRing.sub}
          active={open === "fuel"}
          onClick={() => fuelInteractive && toggle("fuel")}
        />
        {activity && (
          <Tile
            ringValue={`${activity.pct}%`}
            ringColor={scoreColor(activity.pct)}
            label="Activity"
            icon={<ZapIcon />}
            sub={`${activity.moveCal.toLocaleString()} cal`}
            active={open === "activity"}
            onClick={() => toggle("activity")}
          />
        )}
      </div>

      {open && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
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
    </div>
  );
}
