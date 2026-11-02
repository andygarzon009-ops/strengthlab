"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { type NutritionResponse, RATING_COLOR } from "@/components/FuelDetail";
import { MACRO, MACRO_FROM, MACRO_TO } from "@/lib/macroColor";

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

/// One ring: a hairline track, a gradient arc up to the reading ending in a
/// glowing white dot, the reading in the middle, a label and a note under.
function Ring({
  href,
  ariaLabel,
  size,
  pct,
  from,
  to,
  glow,
  center,
  centerSize,
  caption,
  label,
  note,
  noteColor,
}: {
  href: string;
  ariaLabel: string;
  size: number;
  pct: number;
  /// The arc's gradient, light end to deep end.
  from: string;
  to: string;
  glow: string;
  center: string;
  centerSize: number;
  /// Under the number, inside the ring (Recovery's band).
  caption?: string;
  label: string;
  note?: string;
  noteColor?: string;
}) {
  const id = useId().replace(/:/g, "");
  const big = size > 100;
  const stroke = big ? 9 : 6;
  const c = size / 2;
  const r = c - stroke / 2 - 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct)) / 100;
  const end = ((-90 + p * 360) * Math.PI) / 180;
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={`flex flex-col items-center active:scale-[0.97] transition-transform ${big ? "gap-2" : "gap-2 w-[86px]"}`}
    >
      <span className="relative block" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <defs>
            <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={from} />
              <stop offset="1" stopColor={to} />
            </linearGradient>
          </defs>
          <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={2} />
          {p > 0 && (
            <>
              <circle
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={`url(#ring-${id})`}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${p * circ} ${circ}`}
                transform={`rotate(-90 ${c} ${c})`}
                style={{ transition: "stroke-dasharray 600ms ease" }}
              />
              <circle
                cx={c + r * Math.cos(end)}
                cy={c + r * Math.sin(end)}
                r={big ? 6 : 4}
                fill="#fff"
                style={{ filter: `drop-shadow(0 0 ${big ? 8 : 6}px ${glow})` }}
              />
            </>
          )}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-bold leading-none tabular-nums"
            style={{ fontSize: centerSize, letterSpacing: big ? "-0.045em" : "-0.02em" }}
          >
            {center}
          </span>
          {caption && (
            <span className="text-[10px] font-bold uppercase mt-1.5" style={{ color: from, letterSpacing: "0.2em" }}>
              {caption}
            </span>
          )}
        </span>
      </span>
      <span className="text-[10px] font-bold uppercase" style={{ letterSpacing: "0.14em", color: "var(--fg-muted)" }}>
        {label}
      </span>
      {note && (
        <span className="-mt-1.5 text-[12px] font-semibold tabular-nums whitespace-nowrap" style={{ color: noteColor ?? "var(--fg-muted)" }}>
          {note}
        </span>
      )}
    </Link>
  );
}

const ACTIVITY_RING = "#38bdf8";

/// The light end of Recovery's arc: its band colour (an hsl() from the
/// readiness scale) lifted toward white.
function lighten(color: string): string {
  const m = color.match(/hsl\((\d+)/);
  return m ? `hsl(${m[1]} 80% 72%)` : color;
}

/// The Today card: the training block on top, then three rings — Macros,
/// Recovery (big, centre) and Activity — the coach's line under them, and
/// today's session as a panel at the bottom. Recovery and activity come
/// server-side as props; fuel is fetched client-side from the shared endpoint.
export default function DailyGlance({
  recovery,
  activity,
  top,
  line,
  children,
}: {
  recovery: RecoveryGlance | null;
  activity: ActivityGlance | null;
  /// Above everything: the training block's line.
  top?: ReactNode;
  /// The coach's line, centred under the rings.
  line?: ReactNode;
  /// Today's session panel.
  children: ReactNode;
}) {
  const [fuel, setFuel] = useState<NutritionResponse | null>(null);

  // Stale-while-revalidate: paint the last cached Fuel value instantly (the
  // live call is slow, so re-fetching on every page open made this ring
  // lag/pop-in), then refresh in the background. The cache read is deferred
  // to a microtask so it isn't a synchronous in-effect setState (and so
  // SSR/first paint stays consistent — no hydration flash).
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        // Only today's snapshot: yesterday's "logged" would flash a ring
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

  const fuelLogged =
    !!fuel &&
    fuel.connected &&
    !fuel.needsReconnect &&
    !fuel.needsNutritionScope &&
    !fuel.needsProfile &&
    fuel.loggedToday;
  // Mid-day the ring is how much of the targets are in, with the calories
  // still to eat under it; once the day closes it's the grade.
  const left =
    fuel?.targets && fuel.intake
      ? Math.max(0, Math.round(fuel.targets.calorieTargetKcal - fuel.intake.kcal))
      : null;
  const macros = !fuelLogged
    ? { pct: 0, center: "0%", note: "Log a meal", noteColor: "var(--accent)", href: "/fuel#log" }
    : fuel.partial && fuel.progress
      ? {
          pct: fuel.progress.pct,
          center: `${fuel.progress.pct}%`,
          note: left != null ? `${left.toLocaleString()} left` : "so far",
          noteColor: MACRO_TO,
          href: "/fuel",
        }
      : fuel.score
        ? {
            pct: fuel.score.score,
            center: String(fuel.score.score),
            note: fuel.score.rating.charAt(0).toUpperCase() + fuel.score.rating.slice(1),
            noteColor: RATING_COLOR[fuel.score.rating],
            href: "/fuel",
          }
        : { pct: 0, center: "—", note: undefined, noteColor: undefined, href: "/fuel" };

  const r = recovery;
  const glow = r?.color ?? "#4ade80";
  return (
    <section
      aria-label="Today"
      className="relative mb-3 overflow-hidden rounded-[30px] px-4 pt-4 pb-4"
      style={{
        background: "var(--bg-card)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)",
      }}
    >
      {top}
      <div className={`flex items-end justify-between px-0.5 ${top ? "mt-3.5" : ""}`}>
        <Ring
          href={macros.href}
          ariaLabel={fuelLogged ? `Macros ${macros.center}. Open Fuel` : "Macros — nothing logged yet. Log a meal"}
          size={66}
          pct={macros.pct}
          from={MACRO_TO}
          to={MACRO_FROM}
          glow={MACRO}
          center={macros.center}
          centerSize={15}
          label="Macros"
          note={macros.note}
          noteColor={macros.noteColor}
        />
        <Ring
          href="/recovery"
          ariaLabel={r ? `Readiness ${r.score}, ${r.label}. Open readiness` : "Open readiness"}
          size={150}
          pct={r?.score ?? 0}
          from={lighten(glow)}
          to={glow}
          glow={glow}
          center={r ? String(r.score) : "—"}
          centerSize={48}
          caption={r?.label}
          label="Recovery"
        />
        <Ring
          href="/activity"
          ariaLabel={activity ? `Activity ${activity.pct}%. Open activity` : "Open activity"}
          size={66}
          pct={activity?.pct ?? 0}
          from="#7dd3fc"
          to="#0284c7"
          glow={ACTIVITY_RING}
          center={activity ? `${activity.pct}%` : "—"}
          centerSize={15}
          label="Activity"
          note={activity ? `${activity.moveCal.toLocaleString()} cal` : undefined}
          noteColor="#7dd3fc"
        />
      </div>

      {line && (
        <p className="mt-3.5 px-2 text-center text-[13.5px] leading-snug" style={{ color: "var(--fg)", opacity: 0.85, textWrap: "balance" }}>
          {line}
        </p>
      )}

      {children}
    </section>
  );
}
