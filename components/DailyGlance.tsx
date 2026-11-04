"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { type NutritionResponse, RATING_COLOR } from "@/components/FuelDetail";
import { MACRO, MACRO_FROM, MACRO_TO } from "@/lib/macroColor";
import { lerpHex } from "@/components/TickGauge";

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

/// One ring, drawn as a dial of ticks: lit up to the reading, each lit tick
/// tinted along its page's colour (Recovery runs red→green like its page's
/// gauge), the reading in the middle, a label and a note under.
function Ring({
  href,
  ariaLabel,
  size,
  pct,
  tint,
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
  /// Colour of a lit tick at position t (0 → 1 around the dial).
  tint: (t: number) => string;
  glow: string;
  center: string;
  centerSize: number;
  /// Under the number, inside the ring (Recovery's band).
  caption?: string;
  label: string;
  note?: string;
  noteColor?: string;
}) {
  const big = size > 100;
  const n = big ? 60 : 36;
  const c = size / 2;
  const rOut = c - 2;
  const rIn = rOut - (big ? 14 : 8);
  const lit = Math.round((Math.max(0, Math.min(100, pct)) / 100) * n);
  const tick = (i: number) => {
    const a = ((-90 + (i / n) * 360) * Math.PI) / 180;
    return { x1: c + rIn * Math.cos(a), y1: c + rIn * Math.sin(a), x2: c + rOut * Math.cos(a), y2: c + rOut * Math.sin(a) };
  };
  const w = big ? 2.4 : 1.7;
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={`flex flex-col items-center active:scale-[0.97] transition-transform ${big ? "gap-1.5" : "gap-2 w-[86px]"}`}
    >
      <span className="relative block" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          {Array.from({ length: n }, (_, i) =>
            i < lit ? null : <line key={i} {...tick(i)} stroke="rgba(255,255,255,0.09)" strokeWidth={w} strokeLinecap="round" />,
          )}
          <g style={{ filter: `drop-shadow(0 0 ${big ? 5 : 3}px ${glow})` }}>
            {Array.from({ length: lit }, (_, i) => (
              <line key={i} {...tick(i)} stroke={tint(n > 1 ? i / (n - 1) : 1)} strokeWidth={w} strokeLinecap="round" />
            ))}
          </g>
          {big && <circle cx={c} cy={c} r={rIn - 7} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={1} />}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-bold leading-none tabular-nums"
            style={{ fontSize: centerSize, fontFamily: "var(--font-geist-mono)", letterSpacing: big ? "-0.05em" : "-0.03em" }}
          >
            {center}
          </span>
          {caption && (
            <span className="text-[10px] font-extrabold uppercase mt-1.5" style={{ color: glow, letterSpacing: "0.18em" }}>
              {caption}
            </span>
          )}
        </span>
      </span>
      {/* The chevron says the ring opens its page. */}
      <span className="flex items-center gap-0.5 text-[12px] font-bold" style={{ color: big ? "var(--fg-muted)" : "var(--fg)" }}>
        {label}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--fg-dim)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
      </span>
      {note && (
        <span
          className="-mt-1.5 text-[10.5px] tabular-nums whitespace-nowrap"
          style={{ fontFamily: "var(--font-geist-mono)", color: noteColor ?? "var(--fg-muted)" }}
        >
          {note}
        </span>
      )}
    </Link>
  );
}

// Macros wears Fire (red warming to orange), Activity the Activity page's
// sky, Recovery the readiness scale.
const macroTint = (t: number) => lerpHex(MACRO_FROM, MACRO_TO, t);
const activityTint = (t: number) => lerpHex("#0284c7", "#7dd3fc", t);
/// Recovery is one colour — its band's — deepening as it fills, like the
/// other two. (Tinting each tick by its position ran red→green around the
/// dial, so a near-full ring ended green right beside its red first tick.)
const recoveryTint = (score: number | null) => {
  const hue = Math.round((Math.max(0, Math.min(100, score ?? 0)) / 100) * 130);
  return (t: number) => `hsl(${hue} 78% ${Math.round(38 + t * 22)}%)`;
};
const ACTIVITY_RING = "#38bdf8";

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
          tint={macroTint}
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
          tint={recoveryTint(r?.score ?? null)}
          glow={glow}
          center={r ? String(r.score) : "—"}
          centerSize={46}
          caption={r?.label}
          label="Recovery"
        />
        <Ring
          href="/activity"
          ariaLabel={activity ? `Activity ${activity.pct}%. Open activity` : "Open activity"}
          size={66}
          pct={activity?.pct ?? 0}
          tint={activityTint}
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
