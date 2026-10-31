import { prisma } from "@/lib/db";
import { localDateKey } from "@/lib/blockStamp";
import { shapeForType } from "@/lib/exercises";
import Link from "next/link";
import { loadTodayPlan, splitLabel, weekKeys } from "@/lib/todayPlan";
import { loadRhythm } from "@/lib/rhythm";
import { MAJOR_GROUPS, recoveryView, type RecoveryView } from "@/lib/recoveryView";
import HeartRateCard from "@/components/HeartRateCard";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

// The feed's This week card: the goal streak, days trained against the goal,
// a day strip named by what was trained (today, if not trained yet, shows the
// split the Today card suggests), PRs / sets / avg HR, muscle recovery as
// bars, and heart rate. The body map itself lives on Progress, which the card
// opens.
export default async function WeeklyRecap({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true, trainingDays: true, sex: true },
  });
  const tz = user?.timezone || "UTC";
  const keys = weekKeys(tz);
  const todayKey = localDateKey(new Date(), tz);

  const [workouts, plan, rhythm] = await Promise.all([
    prisma.workout.findMany({
      // A day of slack either side; filtered to the local week below.
      where: {
        userId,
        date: {
          gte: new Date(Date.parse(`${keys[0]}T00:00:00Z`) - 86_400_000),
          lte: new Date(Date.parse(`${keys[6]}T23:59:59Z`) + 86_400_000),
        },
      },
      select: {
        id: true,
        type: true,
        split: true,
        date: true,
        duration: true,
        avgHeartRate: true,
        exercises: { select: { sets: { select: { type: true } } } },
      },
      orderBy: { date: "asc" },
    }),
    loadTodayPlan(userId),
    loadRhythm(userId, user?.trainingDays, user?.sex).catch(() => null),
  ]);
  const week = workouts.filter((w) => keys.includes(localDateKey(w.date, tz)));

  const prCount =
    week.length === 0
      ? 0
      : await prisma.personalRecord.count({
          where: {
            userId,
            type: "WEIGHT",
            workoutId: { in: week.map((w) => w.id) },
          },
        });

  const sets = week.reduce(
    (n, w) =>
      n +
      w.exercises.reduce(
        (m, e) => m + e.sets.filter((s) => s.type === "WORKING").length,
        0,
      ),
    0,
  );

  // Duration-weighted, so a 45-min run outweighs a 5-min warm-up.
  let num = 0;
  let den = 0;
  for (const w of week) {
    if (!w.avgHeartRate || w.avgHeartRate <= 0) continue;
    const weight = w.duration && w.duration > 0 ? w.duration : 1;
    num += w.avgHeartRate * weight;
    den += weight;
  }
  const avgHr = den > 0 ? Math.round(num / den) : null;

  const days = keys.map((key, i) => {
    const on = week.filter((w) => localDateKey(w.date, tz) === key);
    const strength = on.find((w) => shapeForType(w.type) === "STRENGTH");
    const done = on.length > 0;
    const isToday = key === todayKey;
    const tag = done
      ? strength
        ? dayName(strength.split)
        : "Cardio"
      : isToday && plan.restDay
        ? "Rest"
        : isToday && plan.next
          ? dayName(plan.next.split)
          : "";
    return { label: WEEKDAYS[i], tag, done, isToday };
  });
  const daysHit = days.filter((d) => d.done).length;
  const goal = Math.max(1, user?.trainingDays ?? 4);
  const toGo = Math.max(0, goal - daysHit);

  const streak = rhythm?.streak ?? 0;
  const rec = rhythm ? recoveryView(rhythm.load, tz) : null;

  return (
    // The card opens Progress from anywhere on it, via a link stretched
    // across the whole card underneath; Avg HR and the heart-rate row sit
    // above it as their own links (links can't nest, so the card isn't one).
    <section
      aria-label="This week"
      className="card relative p-4 mb-3"
      style={{
        background:
          "radial-gradient(100% 60% at 0% 0%, rgba(34,197,94,0.07), transparent 65%), var(--bg-card)",
      }}
    >
      <Link
        href="/strength"
        aria-label="Open progress"
        className="absolute inset-0 rounded-[inherit]"
      />
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold">This week</h2>
        <span
          className="flex items-center gap-1 text-[11.5px] font-semibold nums"
          style={{ color: "#fb923c", fontFamily: "var(--font-geist-mono)" }}
          title={`Consecutive weeks meeting your ${goal}-day training goal`}
        >
          {streak > 0 ? `🔥 ${streak} wk streak` : ""}
          <Chevron />
        </span>
      </div>

      <div className="flex items-baseline gap-2 mt-2.5">
        <span
          className="text-[34px] font-semibold leading-none nums"
          style={{ fontFamily: "var(--font-geist-mono)", letterSpacing: "-0.05em" }}
        >
          {daysHit}
          <span className="text-[18px]" style={{ color: "var(--fg-dim)", letterSpacing: "-0.02em" }}>
            /{goal}
          </span>
        </span>
        <span className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
          days trained
        </span>
        <span
          className="ml-auto text-[11.5px] font-semibold nums"
          style={{
            color: toGo === 0 ? "var(--accent)" : "var(--fg-muted)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {toGo === 0 ? "Goal hit ✓" : `${toGo} to go`}
        </span>
      </div>

      <div className="grid grid-cols-7 gap-[5px] mt-3">
        {days.map((d, i) => (
          <div key={i} className="flex flex-col items-stretch gap-1.5 text-center">
            <span
              className="h-11 rounded-xl flex items-center justify-center text-[10.5px] font-extrabold"
              style={
                d.done
                  ? {
                      background: "linear-gradient(180deg, #34d36b, #16a34a)",
                      color: "#04210f",
                      boxShadow: "0 6px 18px -8px rgba(34,197,94,0.8), inset 0 1px 0 rgba(255,255,255,0.25)",
                      outline: d.isToday ? "1.5px solid rgba(255,255,255,0.6)" : undefined,
                      outlineOffset: 2,
                    }
                  : d.isToday
                    ? { border: "1.5px solid var(--accent)", color: "var(--accent)" }
                    : { background: "var(--bg-elevated)", border: "1px solid var(--border)" }
              }
            >
              {d.tag}
            </span>
            <span
              className="text-[10px] font-semibold"
              style={{ color: d.isToday ? "var(--fg)" : "var(--fg-dim)" }}
            >
              {d.label}
            </span>
          </div>
        ))}
      </div>

      <div
        className="grid grid-cols-3 mt-3.5 py-3"
        style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}
      >
        <Stat value={String(prCount)} label="PRs" accent={prCount > 0} icon={<Trophy on={prCount > 0} />} />
        <div className="pl-3" style={{ borderLeft: "1px solid var(--border)" }}>
          <Stat value={String(sets)} label="Sets" />
        </div>
        <Link
          href="/heart-rate"
          aria-label="Average heart rate — open heart rate"
          className="relative z-10 block min-w-0 pl-3 active:opacity-70"
          style={{ borderLeft: "1px solid var(--border)" }}
        >
          <Stat
            value={avgHr != null ? String(avgHr) : "—"}
            label="Avg HR ›"
            icon={avgHr != null ? <BeatingHeart bpm={avgHr} /> : undefined}
          />
        </Link>
      </div>

      {rec && <RecoveryBars view={rec} />}

      <HeartRateCard userId={userId} variant="row" />
    </section>
  );
}

const STRIP_NAME: Record<string, string> = { FULL_BODY: "Full" };
function dayName(split: string | null | undefined): string {
  if (!split) return "Lift";
  return STRIP_NAME[split] ?? splitLabel(split) ?? "Lift";
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-dim)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function Trophy({ on }: { on: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={on ? "#a3e635" : "var(--fg-dim)"} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </svg>
  );
}

const ROW_COLOR = { over: "#ef4444", recovering: "#3b82f6", ready: "#22c55e" } as const;
const LABEL_COLOR = { over: "#f87171", recovering: "#60a5fa", ready: "#4ade80" } as const;

/// Recovery as bars: each major group fills as it recovers (full = ready to
/// train hard again), anything overworked on top in red at its own progress,
/// the smaller muscles as a short list. Same numbers as the body map on Progress.
function RecoveryBars({ view }: { view: RecoveryView }) {
  return (
    <div className="mt-3.5">
      <div className="flex items-baseline justify-between">
        <span className="label text-[9.5px] font-bold" style={{ color: "var(--fg-dim)" }}>
          Muscle recovery
        </span>
        <span className="text-[11px] font-semibold nums" style={{ color: "#4ade80", fontFamily: "var(--font-geist-mono)" }}>
          {view.readyMajors} of {MAJOR_GROUPS.length} ready
        </span>
      </div>
      <p className="text-[11.5px] leading-snug mt-1" style={{ color: "var(--fg-dim)" }}>
        Bars fill as a muscle recovers. Full means ready to train hard again;
        red means overworked, so give it extra time.
      </p>
      <div className="flex flex-col gap-2.5 mt-2.5">
        {view.rows.map((r) => {
          const c = ROW_COLOR[r.state];
          return (
            <div key={r.name} className="grid items-center gap-2.5" style={{ gridTemplateColumns: "104px 1fr auto" }}>
              <span className="min-w-0">
                <span
                  className="block text-[12.5px] font-semibold truncate"
                  style={{ color: r.state === "over" ? "#f87171" : "var(--fg)" }}
                >
                  {r.name}
                </span>
                {r.note && (
                  <span
                    className="block text-[10px] leading-tight truncate"
                    style={{ color: r.state === "over" ? "#fca5a5" : "var(--fg-dim)" }}
                  >
                    {r.note}
                  </span>
                )}
              </span>
              <span className="relative h-2 rounded-full" style={{ background: "#19191c" }}>
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${r.fraction * 100}%`,
                    background: `linear-gradient(90deg, color-mix(in srgb, ${c} 45%, #0a0a0a), ${c})`,
                    boxShadow: `0 0 12px -2px ${c}`,
                  }}
                />
              </span>
              <span
                className="text-[11.5px] font-bold text-right whitespace-nowrap min-w-[64px]"
                style={{ color: LABEL_COLOR[r.state] }}
              >
                {r.label}
              </span>
            </div>
          );
        })}
      </div>
      {view.small.length > 0 && (
        <div className="mt-3 pt-2.5 flex flex-col gap-1.5" style={{ borderTop: "1px solid var(--border)" }}>
          <span className="label text-[9.5px] font-bold" style={{ color: "var(--fg-dim)" }}>
            Smaller muscles
          </span>
          {view.small.map((m) => (
            <p key={m.name} className="flex items-center gap-2 text-[12.5px] font-semibold">
              <span
                className="w-[7px] h-[7px] rounded-full shrink-0"
                style={{ background: m.tone === "recovering" ? "#3b82f6" : "#52525b" }}
              />
              {m.name}
              <span className="font-medium" style={{ color: "var(--fg-muted)" }}>
                {m.text}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  accent,
  icon,
}: {
  value: string;
  label: string;
  accent?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p
        className="nums text-[20px] font-semibold leading-none tracking-tight flex items-center gap-1.5"
        style={{
          fontFamily: "var(--font-geist-mono)",
          color: accent ? "var(--accent)" : "var(--fg)",
        }}
      >
        {icon}
        {value}
      </p>
      <p
        className="label text-[9px] mt-1.5 truncate"
        style={{ color: "var(--fg-dim)" }}
      >
        {label}
      </p>
    </div>
  );
}

/// The same pulsing heart as the Heart rate card (.heartbeat in globals.css,
/// still under reduced motion), beating at the week's actual average: one
/// animation cycle per beat, so 118 bpm pulses every ~0.51 s.
function BeatingHeart({ bpm }: { bpm: number }) {
  const period = 60 / Math.max(30, Math.min(220, bpm));
  return (
    <svg
      className="heartbeat shrink-0"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="#ef4444"
      aria-hidden
      style={{
        filter: "drop-shadow(0 0 4px rgba(239,68,68,0.5))",
        animationDuration: `${period.toFixed(3)}s`,
      }}
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}
