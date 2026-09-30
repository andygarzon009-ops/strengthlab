import { prisma } from "@/lib/db";
import { localDateKey } from "@/lib/blockStamp";
import { shapeForType } from "@/lib/exercises";
import Link from "next/link";
import { loadTodayPlan, splitTag } from "@/lib/todayPlan";
import { loadRhythm } from "@/lib/rhythm";
import MuscleMap, { LEVELS, muscleLevel } from "@/components/MuscleMap";
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
    select: { timezone: true, trainingDays: true },
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

  // The scan in words: what's past its limit, and which key muscles have
  // gone a week or more untouched.
  const over = rhythm
    ? Object.entries(rhythm.load)
        .filter(([, m]) => muscleLevel(m) === "over")
        .sort((a, b) => (b[1]?.sets ?? 0) - (a[1]?.sets ?? 0))
        .slice(0, 3)
        .map(([name, m]) =>
          m && m.streak >= 3 && m.sets <= 20
            ? `${name} ${m.streak} days running`
            : `${name} ${Math.round(m?.sets ?? 0)} sets`,
        )
    : [];
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
        {rhythm && <MuscleMap load={rhythm.load} />}
        <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-3 gap-y-4">
          <Stat value={String(week.length)} label="Sessions" />
          <Stat value={String(prCount)} label="PRs" accent={prCount > 0} />
          <Stat value={String(sets)} label="Sets" />
          <Stat value={avgHr != null ? String(avgHr) : "—"} label="Avg HR" />
        </div>
      </div>

      {rhythm && (
        <>
          <div className="grid grid-cols-6 gap-1 mt-4">
            {LEVELS.map((l) => (
              <div key={l.level} className="min-w-0">
                <span
                  className="block h-1.5 rounded-full"
                  style={{ background: l.color }}
                />
                <span
                  className="block text-[9px] mt-1 truncate"
                  style={{
                    color: "var(--fg-dim)",
                    fontFamily: "var(--font-geist-mono)",
                  }}
                >
                  {l.level === "over" ? "Over" : l.label}
                </span>
              </div>
            ))}
          </div>
          {(over.length > 0 || cold.length > 0) && (
            <div className="mt-3 space-y-1 text-[12px] leading-snug">
              {over.length > 0 && (
                <p style={{ color: "#f87171" }}>
                  <span className="font-semibold">Overworked:</span>{" "}
                  {over.join(" · ")}
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
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p
        className="nums text-[20px] font-semibold leading-none tracking-tight"
        style={{
          fontFamily: "var(--font-geist-mono)",
          color: accent ? "var(--accent)" : "var(--fg)",
        }}
      >
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
