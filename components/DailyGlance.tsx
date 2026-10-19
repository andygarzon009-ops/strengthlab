"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { type NutritionResponse } from "@/components/FuelDetail";
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

type Section = "activity";

/// Fuel / Activity under the plan: label, a slim bar, the reading. The whole
/// row is the tap target that expands its detail.
function StatRow({
  label,
  icon,
  pct,
  color,
  value,
  sub,
  active = false,
  onClick,
  href,
}: {
  label: string;
  icon: ReactNode;
  pct: number;
  color: string;
  value: string;
  sub: string;
  active?: boolean;
  onClick?: () => void;
  /// Navigate instead of expanding.
  href?: string;
}) {
  // A real button, not a bare line: its own tile, a full tap height and a
  // chevron that turns when the detail opens, so it reads as something to tap.
  const cls =
    "w-full grid items-center gap-2.5 rounded-xl px-3 min-h-[44px] text-left transition-colors active:scale-[0.99]";
  const style = {
    gridTemplateColumns: "72px minmax(0,1fr) auto 14px",
    background: active ? "var(--bg-elevated)" : "rgba(255,255,255,0.025)",
    border: `1px solid ${active ? "var(--border-strong)" : "var(--border)"}`,
  };
  const content = (
    <>
      <span className="flex items-center gap-1.5 text-[13px] font-semibold">
          <span style={{ color }}>{icon}</span>
          {label}
        </span>
        <span className="h-[7px] rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
          <span
            className="block h-full rounded-full"
            style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
          />
        </span>
        <span className="text-[12px] tabular-nums whitespace-nowrap" style={{ color: "var(--fg-muted)" }}>
          <b className="font-bold" style={{ color: "var(--fg)" }}>{value}</b>
          {sub ? ` · ${sub}` : ""}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--fg-muted)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          style={{ transform: active ? "rotate(90deg)" : undefined, transition: "transform 160ms" }}
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} style={style}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-expanded={active} className={cls} style={style}>
      {content}
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
  head,
  children,
}: {
  recovery: RecoveryGlance | null;
  activity: ActivityGlance | null;
  /// The plan's title block, set beside the gauge.
  head: ReactNode;
  /// The coach's line and the call to action, under the stats.
  children: ReactNode;
}) {
  const [fuel, setFuel] = useState<NutritionResponse | null>(null);
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
        // Only today's snapshot: yesterday's "logged" would flash a Fuel row
        // in this morning and then pull it out when the fetch lands.
        const raw = localStorage.getItem("fuelGlanceCache");
        const cached = raw
          ? (JSON.parse(raw) as { day?: string; data?: NutritionResponse })
          : null;
        if (cached?.day === new Date().toDateString() && cached.data) {
          setFuel(cached.data);
        }
      } catch {}
    });
    fetch("/api/health/nutrition", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: NutritionResponse | null) => {
        if (!active) return;
        if (d) {
          setFuel(d);
          try {
            localStorage.setItem(
              "fuelGlanceCache",
              JSON.stringify({ day: new Date().toDateString(), data: d }),
            );
          } catch {}
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const toggle = (s: Section) => setOpen((cur) => (cur === s ? null : s));

  // Fuel only shows once something's been logged today — before that it was
  // a row of dashes ("not logged", "not connected") taking up the card.
  const fuelLogged =
    !!fuel &&
    fuel.connected &&
    !fuel.needsReconnect &&
    !fuel.needsNutritionScope &&
    !fuel.needsProfile &&
    fuel.loggedToday;
  // Mid-day there's no grade to give — show how much of the targets are in.
  // The score only appears once the eating day has closed.
  const fuelRow = !fuelLogged
    ? null
    : fuel.partial && fuel.progress
      ? { pct: fuel.progress.pct, value: `${fuel.progress.pct}%`, sub: "so far", color: "#38bdf8" }
      : fuel.score
        ? {
            pct: fuel.score.score,
            value: String(fuel.score.score),
            sub: fuel.score.rating,
            color: scoreColor(fuel.score.score),
          }
        : null;

  const r = recovery;
  return (
    <section aria-label="Today" className="card mb-3 overflow-hidden px-[18px] pt-4 pb-[18px]">
      <div className="flex items-center gap-3.5">
        {/* Readiness: the gauge, number and band. Tapping it opens the
            readiness page — the full breakdown lives there. */}
        <Link
          href="/recovery"
          aria-label={r ? `Readiness ${r.score}, ${r.label}. Open readiness` : "Open readiness"}
          className="relative shrink-0 rounded-2xl active:opacity-80"
        >
          <TickGauge score={r?.score ?? null} size={96} id="feed-gauge" ticks={40} />
          <span className="absolute inset-0 flex items-center justify-center pb-1.5">
            <span
              className="text-[26px] font-bold leading-none tabular-nums"
              style={{ letterSpacing: "-0.04em" }}
            >
              {r?.score ?? "—"}
            </span>
          </span>
          <span
            className="absolute left-0 right-0 flex items-center justify-center gap-0.5 text-[10px] font-bold"
            style={{ bottom: 1, color: r?.color ?? "var(--fg-muted)" }}
          >
            {r?.label ?? "Readiness"}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
        </Link>
        <div className="min-w-0 flex-1">{head}</div>
      </div>

      <div className="mt-3 space-y-1.5">
          {fuelRow ? (
            <StatRow
              label="Fuel"
              icon={<FlameIcon />}
              pct={fuelRow.pct}
              color={fuelRow.color}
              value={fuelRow.value}
              sub={fuelRow.sub}
              href="/fuel"
            />
          ) : (
            // Nothing eaten logged yet: no empty Fuel bar, just the way in.
            <Link
              href="/fuel#log"
              className="grid items-center gap-2.5 rounded-xl px-3 min-h-[44px] active:scale-[0.99]"
              style={{
                gridTemplateColumns: "72px minmax(0,1fr) auto",
                background: "rgba(255,255,255,0.025)",
                border: "1px dashed var(--border-strong)",
              }}
            >
              <span className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--fg-muted)" }}>
                <FlameIcon />
                Fuel
              </span>
              <span className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
                Nothing logged yet
              </span>
              <span
                className="text-[12px] font-bold px-2.5 py-1 rounded-full"
                style={{ background: "var(--accent)", color: "#04130a" }}
              >
                Log a meal
              </span>
            </Link>
          )}
          {activity && (
            <StatRow
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

      {open && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          {open === "activity" && activity && (
            <div>
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
      {children}
    </section>
  );
}
