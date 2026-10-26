"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { type NutritionResponse, RATING_COLOR } from "@/components/FuelDetail";
import TickGauge from "@/components/TickGauge";

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
  /// Usual Activity % by this hour on a training day; null without history.
  usual: number | null;
};

type Section = "activity";

// Each stat keeps one colour whatever the numbers say, so the bar names the
// stat and never judges it — readiness is the card's only red→green verdict.
// Fuel takes the flame's ember, Activity the deload steel blue.
const FUEL_GRAD = ["#c2410c", "#fb923c"] as const;
const ACTIVITY_GRAD = ["#1d4ed8", "#60a5fa"] as const;
const PACE_GOOD = "#22c55e";

/// How today compares with your usual by this hour. Within 5 points counts as
/// on pace; behind stays grey, because a slow start isn't a failure.
function paceNote(pct: number, usual: number | null | undefined): ReactNode {
  if (usual == null) return null;
  const d = pct - usual;
  if (d >= 5) return <span style={{ color: PACE_GOOD }}>ahead of usual</span>;
  if (d > -5) return <span style={{ color: PACE_GOOD }}>on your usual pace</span>;
  return <span style={{ color: "var(--fg-dim)" }}>behind usual</span>;
}

/// Fuel / Activity under the plan: a tinted icon, the reading, a thick bar
/// ending in the readiness gauge's glowing knob, a faint line where you
/// usually are by now, and one line on what's left. The whole row is the tap
/// target.
function ActionRow({
  label,
  icon,
  pct,
  grad,
  big,
  grade,
  usual,
  action,
  note,
  active = false,
  onClick,
  href,
}: {
  label: string;
  icon: ReactNode;
  pct: number;
  grad: readonly [string, string];
  big: string;
  /// Closed-day verdict beside the number, in its own colour.
  grade?: { text: string; color: string };
  /// Usual % by this hour; null hides the marker.
  usual?: number | null;
  action: ReactNode;
  note?: ReactNode;
  active?: boolean;
  onClick?: () => void;
  /// Navigate instead of expanding.
  href?: string;
}) {
  const color = grad[1];
  const fill = Math.max(0, Math.min(100, pct));
  const cls =
    "w-full grid items-center gap-3 rounded-[13px] px-3 pt-[11px] pb-3 text-left transition-colors active:scale-[0.99]";
  const style = {
    gridTemplateColumns: "30px minmax(0,1fr) 14px",
    background: active
      ? "var(--bg-elevated)"
      : "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012))",
    border: `1px solid ${active ? "var(--border-strong)" : "var(--border)"}`,
  };
  const content = (
    <>
      <span
        className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center self-start"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex flex-col gap-[9px]">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold">{label}</span>
          <span
            className="text-[18px] font-semibold leading-none tabular-nums"
            style={{ fontFamily: "var(--font-geist-mono)", letterSpacing: "-0.04em", color }}
          >
            {big}
            {grade && (
              <span
                className="text-[11px] font-semibold ml-[5px]"
                style={{ fontFamily: "var(--font-geist-sans)", letterSpacing: 0, color: grade.color }}
              >
                {grade.text}
              </span>
            )}
          </span>
        </span>
        <span className="relative block h-3 rounded-full" style={{ background: "#1c1c20" }}>
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${fill}%`, background: `linear-gradient(90deg, ${grad[0]}, ${grad[1]})` }}
          />
          {usual != null && (
            <span
              className="absolute -top-[3px] -bottom-[3px] w-[2px] -ml-px rounded-sm"
              style={{ left: `${Math.max(0, Math.min(100, usual))}%`, background: "rgba(255,255,255,0.55)" }}
            />
          )}
          <span
            className="absolute top-1/2 w-4 h-4 -mt-2 -ml-2 rounded-full bg-white"
            style={{
              left: `${Math.min(fill, 97)}%`,
              border: `3px solid ${color}`,
              boxShadow: `0 0 10px ${color}`,
            }}
          />
        </span>
        <span className="flex justify-between gap-2 text-[12px]" style={{ color: "var(--fg-muted)" }}>
          <span className="min-w-0 truncate tabular-nums">{action}</span>
          {note && <span className="text-[11px] whitespace-nowrap">{note}</span>}
        </span>
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
  fuelUsual,
  head,
  children,
}: {
  recovery: RecoveryGlance | null;
  activity: ActivityGlance | null;
  /// Usual Fuel % by this hour; null without history.
  fuelUsual: number | null;
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
  // Mid-day there's no grade to give — show how much of the targets are in
  // and what's left. The score only appears once the eating day has closed.
  const fuelRow = (() => {
    if (!fuelLogged) return null;
    const t = fuel.targets;
    const i = fuel.intake;
    if (fuel.partial && fuel.progress) {
      const proteinLeft = t && i ? Math.round(t.proteinTargetG - i.proteinG) : null;
      const kcalLeft = t && i ? Math.round(t.calorieTargetKcal - i.kcal) : null;
      const kcalPart =
        kcalLeft == null ? null : kcalLeft > 0 ? `${kcalLeft.toLocaleString()} cal to go` : "calories in";
      const action =
        proteinLeft == null ? (
          `${fuel.progress.pct}% of today's targets in`
        ) : proteinLeft > 0 ? (
          <>
            <b className="font-semibold" style={{ color: "var(--fg)" }}>{proteinLeft} g</b> protein left
            {kcalPart ? ` · ${kcalPart}` : ""}
          </>
        ) : (
          <>
            <b className="font-semibold" style={{ color: "var(--fg)" }}>Protein hit ✓</b>
            {kcalPart ? ` · ${kcalPart}` : ""}
          </>
        );
      return {
        pct: fuel.progress.pct,
        big: `${fuel.progress.pct}%`,
        grade: undefined,
        usual: fuelUsual,
        action,
        note: paceNote(fuel.progress.pct, fuelUsual),
      };
    }
    if (!fuel.score) return null;
    const rating = fuel.score.rating;
    return {
      pct: fuel.score.score,
      big: String(fuel.score.score),
      grade: { text: rating.charAt(0).toUpperCase() + rating.slice(1), color: RATING_COLOR[rating] },
      usual: null,
      action:
        t && i ? (
          <>
            Protein{" "}
            <b className="font-semibold" style={{ color: "var(--fg)" }}>
              {Math.round(i.proteinG)} / {t.proteinTargetG} g
            </b>
            {i.proteinG >= t.proteinTargetG ? " ✓" : ""} · {Math.round(i.kcal).toLocaleString()} cal
          </>
        ) : (
          fuel.score.direction
        ),
      note: null,
    };
  })();

  // Activity: what's still open, or the day's tally once every goal is hit.
  const activityRow = (() => {
    if (!activity) return null;
    const allDone = activity.rows.every((row) => row.done);
    if (allDone) {
      return {
        action: (
          <>
            <b className="font-semibold" style={{ color: "var(--fg)" }}>All goals hit ✓</b> ·{" "}
            {activity.moveCal.toLocaleString()} cal burned
          </>
        ),
        usual: null,
        note: null,
      };
    }
    const left = activity.rows
      .filter((row) => !row.done)
      .map((row) =>
        row.label === "Sessions"
          ? "no session yet"
          : `${(row.goal - row.value).toLocaleString()} ${row.unit}`,
      );
    const [first, ...rest] = left;
    return {
      action: (
        <>
          <b className="font-semibold" style={{ color: "var(--fg)" }}>{first}</b>
          {rest.length ? ` · ${rest.join(" · ")}` : ""}
          {first !== "no session yet" ? " to go" : ""}
        </>
      ),
      usual: activity.usual,
      note: paceNote(activity.pct, activity.usual),
    };
  })();

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
            <ActionRow
              label="Fuel"
              icon={<FlameIcon />}
              pct={fuelRow.pct}
              grad={FUEL_GRAD}
              big={fuelRow.big}
              grade={fuelRow.grade}
              usual={fuelRow.usual}
              action={fuelRow.action}
              note={fuelRow.note}
              href="/fuel"
            />
          ) : (
            // Nothing eaten logged yet: no empty Fuel bar, just the way in.
            <Link
              href="/fuel#log"
              className="grid items-center gap-3 rounded-[13px] px-3 min-h-[54px] active:scale-[0.99]"
              style={{
                gridTemplateColumns: "30px minmax(0,1fr) auto",
                background: "rgba(255,255,255,0.025)",
                border: "1px dashed var(--border-strong)",
              }}
            >
              <span
                className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center"
                style={{ background: `color-mix(in srgb, ${FUEL_GRAD[1]} 14%, transparent)`, color: FUEL_GRAD[1] }}
              >
                <FlameIcon />
              </span>
              <span className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
                <b className="font-semibold" style={{ color: "var(--fg)" }}>Fuel</b> · nothing logged yet
              </span>
              <span
                className="text-[12px] font-bold px-2.5 py-1 rounded-full"
                style={{ background: "var(--accent)", color: "#04130a" }}
              >
                Log a meal
              </span>
            </Link>
          )}
          {activity && activityRow && (
            <ActionRow
              label="Activity"
              icon={<ZapIcon />}
              pct={activity.pct}
              grad={ACTIVITY_GRAD}
              big={`${activity.pct}%`}
              usual={activityRow.usual}
              action={activityRow.action}
              note={activityRow.note}
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
