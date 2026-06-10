"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FuelDetail, {
  RATING_COLOR,
  type NutritionResponse,
} from "@/components/FuelDetail";

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
  sub,
  active,
  onClick,
}: {
  ringValue: string;
  ringColor: string;
  label: string;
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
  const [open, setOpen] = useState<Section | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/health/nutrition", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: NutritionResponse | null) => active && setFuel(d))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const toggle = (s: Section) => setOpen((cur) => (cur === s ? null : s));

  // Fuel ring presentation across its states.
  const fuelRing = (() => {
    if (!fuel || !fuel.connected || fuel.needsReconnect)
      return { value: "—", color: "var(--fg-dim)", sub: "not connected" };
    if (fuel.needsProfile) return { value: "—", color: "var(--fg-dim)", sub: "set profile" };
    if (!fuel.loggedToday) return { value: "—", color: "var(--fg-dim)", sub: "not logged" };
    const s = fuel.score!;
    return { value: String(s.score), color: RATING_COLOR[s.rating], sub: s.rating };
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
            ringColor={recovery.color}
            label="Recovery"
            sub={recovery.label}
            active={open === "recovery"}
            onClick={() => toggle("recovery")}
          />
        )}
        <Tile
          ringValue={fuelRing.value}
          ringColor={fuelRing.color}
          label="Fuel"
          sub={fuelRing.sub}
          active={open === "fuel"}
          onClick={() => fuelInteractive && toggle("fuel")}
        />
        {activity && (
          <Tile
            ringValue={`${activity.pct}%`}
            ringColor={activity.color}
            label="Activity"
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
                <p className="text-[15px] font-semibold" style={{ color: recovery.color }}>
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
