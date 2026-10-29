"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { type NutritionResponse, RATING_COLOR } from "@/components/FuelDetail";
import TickGauge from "@/components/TickGauge";
import { MACRO, MACRO_FROM, MACRO_TO } from "@/lib/macroColor";

const ICON_PROPS = {
  width: 14,
  height: 14,
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

// Each stat keeps one colour whatever the numbers say, so the tile names the
// stat and never judges it — readiness is the card's only red→green verdict.
// Macros wears Fire (lib/macroColor), Activity the brand's button green.
const FUEL_COLOR = MACRO;
const ACTIVITY_COLOR = "#22c55e";

const CHEVRON = (
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
    className="ml-auto shrink-0"
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
);

/// One of the two tiles under the plan: a glowing icon, the big reading in the
/// stat's colour, then its parts as mini-bars in the same colour. With an
/// `href` the whole tile is a link and carries a ›; without one it's just a
/// readout — Activity's parts are already all there is to see.
function SplitTile({
  href,
  label,
  icon,
  color,
  big,
  sub,
  subColor,
  parts,
  gradient,
  children,
}: {
  href?: string;
  /// [from, to]: the big number and the bars run this instead of `color`.
  gradient?: [string, string];
  label: string;
  icon: ReactNode;
  color: string;
  big?: string;
  sub?: string;
  /// The closed-day grade wears its own colour.
  subColor?: string;
  parts?: { label: string; pct: number }[];
  /// Replaces the reading — the empty state's call to action.
  children?: ReactNode;
}) {
  const cls = "relative min-w-0 rounded-2xl px-3 pt-3 pb-3.5 flex flex-col gap-[11px]";
  const style = {
    background: "var(--bg-elevated)",
  };
  const content = (
    <>
      <span className="flex items-center gap-1.5 text-[13px] font-semibold">
        <span className="inline-flex" style={{ color, filter: "drop-shadow(0 0 6px currentColor)" }}>
          {icon}
        </span>
        {label}
        {href && CHEVRON}
      </span>
      {children ?? (
        <>
          <span className="flex items-baseline gap-1.5 min-w-0">
            <b
              className="text-[30px] font-semibold leading-none tabular-nums"
              style={{
                fontFamily: "var(--font-geist-mono)",
                letterSpacing: "-0.05em",
                ...(gradient
                  ? {
                      background: `linear-gradient(90deg, ${gradient[1]}, ${gradient[0]})`,
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                    }
                  : { color }),
              }}
            >
              {big}
            </b>
            <span
              className="min-w-0 truncate text-[12px] font-medium"
              style={{ color: subColor ?? "var(--fg-dim)" }}
            >
              {sub}
            </span>
          </span>
          <span className="flex flex-col gap-[7px]">
            {parts?.map((p) => (
              <span
                key={p.label}
                className="grid items-center gap-1.5 text-[10px] font-semibold uppercase"
                style={{ gridTemplateColumns: "54px 1fr", letterSpacing: "0.06em", color: "var(--fg-dim)" }}
              >
                {p.label}
                <span className="relative block h-[5px] rounded-full" style={{ background: "#232328" }}>
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${Math.max(0, Math.min(100, p.pct))}%`,
                      background: gradient
                        ? `linear-gradient(90deg, ${gradient[0]}, ${gradient[1]})`
                        : `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, #0a0a0a), ${color})`,
                      boxShadow: `0 0 8px color-mix(in srgb, ${color} 40%, transparent)`,
                    }}
                  />
                </span>
              </span>
            ))}
          </span>
        </>
      )}
    </>
  );
  if (!href) {
    return (
      <div className={cls} style={style}>
        {content}
      </div>
    );
  }
  return (
    <Link href={href} className={`${cls} active:scale-[0.98] transition-transform`} style={style}>
      {content}
    </Link>
  );
}

/// The Today card's top: the readiness gauge beside the plan, then Fuel and
/// Activity as two tiles; Fuel opens its page. Recovery + activity come
/// server-side as props; fuel is fetched client-side from the shared endpoint.
export default function DailyGlance({
  recovery,
  activity,
  top,
  head,
  below,
  children,
}: {
  recovery: RecoveryGlance | null;
  activity: ActivityGlance | null;
  /// Above everything: the training block's line.
  top?: ReactNode;
  /// The plan's title block, set beside the gauge.
  head: ReactNode;
  /// Under the gauge row: the block's reps / effort / rest.
  below?: ReactNode;
  /// The coach's line and the call to action, under the stats.
  children: ReactNode;
}) {
  const [fuel, setFuel] = useState<NutritionResponse | null>(null);

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
  const fuelTile = !fuelLogged
    ? null
    : fuel.partial && fuel.progress
      ? {
          big: `${fuel.progress.pct}%`,
          sub: "so far",
          subColor: undefined,
          parts: [
            { label: "Protein", pct: fuel.progress.proteinPct },
            { label: "Cals", pct: fuel.progress.caloriePct },
          ],
        }
      : fuel.score
        ? {
            big: String(fuel.score.score),
            sub: fuel.score.rating.charAt(0).toUpperCase() + fuel.score.rating.slice(1),
            subColor: RATING_COLOR[fuel.score.rating],
            parts: [
              { label: "Protein", pct: fuel.score.proteinPct },
              { label: "Cals", pct: fuel.score.caloriePct },
            ],
          }
        : null;

  const r = recovery;
  return (
    <section aria-label="Today" className="card mb-3 overflow-hidden px-4 pt-4 pb-4">
      {top}
      <div className={`flex items-center gap-3 ${top ? "mt-3.5" : ""}`}>
        {/* Readiness: the gauge and number, with a chip under it naming what
            it is and the band. Tapping it opens the readiness page — the
            full breakdown lives there. */}
        <Link
          href="/recovery"
          aria-label={r ? `Readiness ${r.score}, ${r.label}. Open readiness` : "Open readiness"}
          className="relative shrink-0 w-[124px] flex justify-center pb-2 active:opacity-80"
        >
          <TickGauge score={r?.score ?? null} size={104} id="feed-gauge" ticks={40} />
          <span className="absolute inset-x-0 top-0 h-[104px] flex items-center justify-center pb-3">
            <span
              className="text-[30px] font-bold leading-none tabular-nums"
              style={{ letterSpacing: "-0.04em" }}
            >
              {r?.score ?? "—"}
            </span>
          </span>
          <span
            className="absolute bottom-0 left-1/2 -translate-x-1/2 flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] font-bold"
            style={{
              color: r?.color ?? "var(--fg-muted)",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--border-strong)",
            }}
          >
            <span className="font-semibold" style={{ color: "var(--fg-muted)" }}>
              Readiness
            </span>
            {r?.label}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </span>
        </Link>
        <div className="min-w-0 flex-1">{head}</div>
      </div>
      {below}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {fuelTile ? (
          <SplitTile
            href="/fuel"
            label="Macros"
            icon={<FlameIcon />}
            color={FUEL_COLOR}
            gradient={[MACRO_FROM, MACRO_TO]}
            big={fuelTile.big}
            sub={fuelTile.sub}
            subColor={fuelTile.subColor}
            parts={fuelTile.parts}
          />
        ) : (
          // Nothing eaten logged yet: no empty bars, just the way in.
          <SplitTile href="/fuel#log" label="Macros" icon={<FlameIcon />} color={FUEL_COLOR}>
            <span className="text-[12px] leading-snug" style={{ color: "var(--fg-muted)" }}>
              Nothing logged yet
            </span>
            <span
              className="mt-auto self-start text-[12px] font-bold px-2.5 py-1 rounded-full"
              style={{ background: "var(--accent)", color: "#04130a" }}
            >
              Log a meal
            </span>
          </SplitTile>
        )}
        {activity && (
          <SplitTile
            label="Activity"
            icon={<ZapIcon />}
            color={ACTIVITY_COLOR}
            big={`${activity.pct}%`}
            sub={`${activity.moveCal.toLocaleString()} cal`}
            // Lift days show in This week's day strip, so the tile keeps
            // Move and Exercise.
            parts={activity.rows.filter((row) => row.label !== "Sessions").map((row) => ({
              label: row.label,
              pct: row.goal > 0 ? (row.value / row.goal) * 100 : 0,
            }))}
          />
        )}
      </div>

      {/* What to do today — the coach's line lives here. */}
      {children}
    </section>
  );
}
