import { prisma } from "@/lib/db";
import { localDateKey } from "@/lib/blockStamp";
import { shapeForType } from "@/lib/exercises";
import Link from "next/link";
import { loadTodayPlan, splitTag } from "@/lib/todayPlan";
import { loadRhythm } from "@/lib/rhythm";
import MuscleMap, { muscleLevel } from "@/components/MuscleMap";
import { HEAT_GRADIENT, HEAT_MAX, hoursToRecovered } from "@/lib/bodyScan";

// Where each word sits on the heat scale (see lib/bodyScan).
const SCALE_LABELS: [string, number][] = [
  ["Cold", 0],
  ["Stale", 0.34],
  ["Fresh", 0.6],
  ["Peak", 1.0],
  ["Over", 1.3],
];
import { PRIORITY_MUSCLES } from "@/lib/exercises";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/// Local YYYY-MM-DD keys for Monday..Sunday of the week containing today.
function weekKeys(tz: string): string[] {
  const todayKey = localDateKey(new Date(), tz);
  const [y, m, d] = todayKey.split("-").map(Number);
  const noon = Date.UTC(y, m - 1, d, 12);
  const dow = (new Date(noon).getUTCDay() + 6) % 7; // Mon = 0
  return Array.from({ length: 7 }, (_, i) =>
    new Date(noon + (i - dow) * 86_400_000).toISOString().slice(0, 10),
  );
}

// This week and your rhythm in one card (they used to be two, each with its
// own row of day dots): the goal streak, a day strip marked with what was
// trained, then the body map beside the week's four numbers. Today, if not
// trained yet, shows the split the Today card suggests. Taps through to
// Progress.
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
    loadRhythm(userId, user?.trainingDays).catch(() => null),
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
      ? splitTag(strength?.split ?? null)
      : isToday && plan.next
        ? splitTag(plan.next.split)
        : "";
    return { label: WEEKDAYS[i], tag, done, isToday };
  });
  const daysHit = days.filter((d) => d.done).length;
  const goal = Math.max(1, user?.trainingDays ?? 4);
  const todayDone = days.find((d) => d.isToday)?.done;

  const streak = rhythm?.streak ?? 0;

  // The scan in words: what's being loaded faster than it recovers (and
  // why), how long until each recovering muscle is ready, and which key
  // muscles have gone cold.
  const entries = rhythm ? Object.entries(rhythm.load) : [];
  const over = entries
    .filter(([, m]) => muscleLevel(m) === "over")
    .sort((a, b) => (b[1]?.weekSets ?? 0) - (a[1]?.weekSets ?? 0))
    .slice(0, 3)
    .map(([name, m]) =>
      m && m.weekSets > m.mrv
        ? `${name} ${Math.round(m.weekSets)} sets (max ~${m.mrv})`
        : `${name} hit again before recovering`,
    );
  const recovering = entries
    .filter(([, m]) => muscleLevel(m) === "ok" && hoursToRecovered(m) > 0)
    .sort((a, b) => hoursToRecovered(b[1]) - hoursToRecovered(a[1]))
    .slice(0, 3)
    .map(([name, m]) => `${name} ${hoursToRecovered(m)}h`);
  const cold = rhythm
    ? PRIORITY_MUSCLES.filter((m) => muscleLevel(rhythm.load[m]) === "cold").slice(0, 4)
    : [];
  return (
    <Link
      href="/consistency"
      aria-label="This week — open progress"
      className="card block p-[18px] mb-3 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold">This week</h2>
        <div className="flex items-center gap-2 shrink-0">
          {streak > 0 && (
            <span
              className="label text-[10px] px-2 py-1 rounded-full nums"
              style={{
                background: "rgba(249,115,22,0.12)",
                border: "1px solid rgba(249,115,22,0.35)",
                color: "#fb923c",
                fontFamily: "var(--font-geist-mono)",
              }}
              title={`Consecutive weeks meeting your ${goal}-day training goal`}
            >
              🔥 {streak}-wk streak
            </span>
          )}
          <span style={{ color: "var(--fg-dim)" }}>→</span>
        </div>
      </div>
      <p
        className="text-[12px] nums mt-1.5 mb-3.5 truncate"
        style={{
          fontFamily: "var(--font-geist-mono)",
          color: daysHit >= goal ? "var(--accent)" : "var(--fg-muted)",
        }}
      >
        {daysHit} of {goal} days{daysHit >= goal ? " ✓" : ""}
        {!todayDone && plan.next ? ` · today ${plan.next.label}` : ""}
      </p>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center text-[12px] font-bold"
              style={
                d.done
                  ? { background: "var(--accent)", color: "#052e16" }
                  : d.isToday
                    ? {
                        border: "1.5px solid var(--accent)",
                        color: "var(--accent)",
                      }
                    : { background: "var(--bg-elevated)" }
              }
            >
              {d.tag}
            </span>
            <span
              className="text-[10px]"
              style={{
                color: d.isToday ? "var(--fg)" : "var(--fg-dim)",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {d.label}
            </span>
          </div>
        ))}
      </div>

      <div
        className="flex items-center gap-4 mt-4 pt-4"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        {rhythm && <MuscleMap load={rhythm.load} sex={user?.sex} />}
        <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-3 gap-y-4">
          <Stat value={String(week.length)} label="Sessions" />
          <Stat value={String(prCount)} label="PRs" accent={prCount > 0} />
          <Stat value={String(sets)} label="Sets" />
          <Stat
            value={avgHr != null ? String(avgHr) : "—"}
            label="Avg HR"
            icon={avgHr != null ? <BeatingHeart /> : undefined}
          />
        </div>
      </div>

      {rhythm && (
        <>
          {/* One continuous scale, dim to bright to red. */}
          <div className="mt-4">
            <span
              className="block h-1.5 rounded-full"
              style={{ background: HEAT_GRADIENT }}
            />
            <div
              className="relative h-3 text-[9px] mt-1.5"
              style={{
                color: "var(--fg-dim)",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {SCALE_LABELS.map(([label, at]) => (
                <span
                  key={label}
                  className="absolute top-0 whitespace-nowrap"
                  style={{
                    left: `${(at / HEAT_MAX) * 100}%`,
                    transform:
                      at === 0
                        ? "none"
                        : at >= HEAT_MAX
                          ? "translateX(-100%)"
                          : "translateX(-50%)",
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
          {(over.length > 0 || recovering.length > 0 || cold.length > 0) && (
            <div className="mt-3 space-y-1 text-[12px] leading-snug">
              {over.length > 0 && (
                <p style={{ color: "#f87171" }}>
                  <span className="font-semibold">Overworked:</span>{" "}
                  {over.join(" · ")}
                </p>
              )}
              {recovering.length > 0 && (
                <p style={{ color: "var(--fg-muted)" }}>
                  <span className="font-semibold">Ready in:</span>{" "}
                  {recovering.join(" · ")}
                </p>
              )}
              {cold.length > 0 && (
                <p style={{ color: "var(--fg-muted)" }}>
                  <span className="font-semibold">Cold:</span>{" "}
                  {cold.join(", ")}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Link>
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
/// still under reduced motion).
function BeatingHeart() {
  return (
    <svg
      className="heartbeat shrink-0"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="#ef4444"
      aria-hidden
      style={{ filter: "drop-shadow(0 0 4px rgba(239,68,68,0.5))" }}
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}
