import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { e1rm } from "@/lib/strengthProgression";
import {
  isMachineExercise,
  labelForType,
  formatDuration,
  formatLoad,
} from "@/lib/exercises";
import { normalizeExerciseName } from "@/lib/exerciseIdentity";
import BackButton from "@/components/BackButton";
import FriendButton from "@/components/FriendButton";
import ShareProfileButton from "@/components/ShareProfileButton";
import { getFriendState } from "@/lib/actions/friends";
import Avatar from "@/components/Avatar";
import ProfileCalendar from "@/components/ProfileCalendar";
import { monthKey, type CalendarWorkout } from "@/lib/profileCalendar";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewerId = await requireAuth();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      username: true,
      image: true,
      coverImage: true,
      preferredSplit: true,
      bio: true,
    },
  });
  if (!user) notFound();

  const isSelf = user.id === viewerId;
  const friendState = await getFriendState(viewerId, user.id);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // Twelve WHOLE months back, not 365 days: the calendar pages through these
  // months, and a rolling 365-day window would leave the oldest one half
  // empty and make it look like the friend skipped those weeks.
  const earliest = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [totalWorkouts, cheers, workouts] = await Promise.all([
    prisma.workout.count({ where: { userId: user.id } }),
    prisma.reaction.count({ where: { workout: { userId: user.id } } }),
    prisma.workout.findMany({
      where: { userId: user.id, date: { gte: earliest } },
      orderBy: { date: "desc" },
      select: {
        id: true,
        title: true,
        type: true,
        date: true,
        duration: true,
        calories: true,
        exercises: {
          select: {
            exercise: { select: { name: true } },
            sets: { select: { type: true, weight: true, reps: true } },
          },
        },
      },
    }),
  ]);

  // This-month rings
  const monthWorkouts = workouts.filter((w) => new Date(w.date) >= monthStart);
  const monthSessions = monthWorkouts.length;
  const monthName = now.toLocaleString("en-US", { month: "long" });
  const monthMinutes = Math.round(
    monthWorkouts.reduce((s, w) => s + (w.duration ?? 0), 0) / 60,
  );
  const monthCalories = monthWorkouts.reduce(
    (s, w) => s + (w.calories ?? 0),
    0,
  );

  // Level from lifetime workouts.
  const level = Math.floor(totalWorkouts / 10) + 1;

  // Weeks in a row with at least one session (Mon-start), counting back from
  // this week — or from last week, so a Monday before training doesn't read 0.
  const weekStart = (d: Date) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x.getTime();
  };
  const trainedWeeks = new Set(workouts.map((w) => weekStart(new Date(w.date))));
  const WEEK = 7 * 86_400_000;
  let cursor = weekStart(now);
  if (!trainedWeeks.has(cursor)) cursor -= WEEK;
  let streak = 0;
  // DST can shift a Monday's midnight by an hour; match within a day.
  const hasWeek = (t: number) =>
    [...trainedWeeks].some((w) => Math.abs(w - t) < 86_400_000);
  while (hasWeek(cursor)) {
    streak++;
    cursor -= WEEK;
  }

  // Sessions per day this month, for the hero's bar strip.
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const perDay = Array.from({ length: daysInMonth }, () => 0);
  for (const w of monthWorkouts) perDay[new Date(w.date).getDate() - 1]++;

  // Group every loaded workout by month, then by day. Keeping only the first
  // hit per day (workouts is date-desc) meant a double session showed one cell
  // linking to the later workout, with the earlier one unreachable from here.
  // Reversed so each day's list reads earliest-first, the order they trained.
  // The calendar pages through these months client-side, so a friend's older
  // sessions are reachable without another round trip.
  const workoutsByMonth: Record<
    string,
    Record<number, CalendarWorkout[]>
  > = {};
  for (const w of [...workouts].reverse()) {
    const d = new Date(w.date);
    const byDay = (workoutsByMonth[monthKey(d.getFullYear(), d.getMonth())] ??= {});
    (byDay[d.getDate()] ??= []).push({
      id: w.id,
      title: w.title || labelForType(w.type),
      typeLabel: labelForType(w.type),
      durationLabel: w.duration ? formatDuration(w.duration) : null,
    });
  }

  // Top lifts (e1RM)
  const bestByLift = new Map<
    string,
    { name: string; weight: number; reps: number; oneRM: number }
  >();
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (isMachineExercise(ex.exercise.name)) continue;
      const key = normalizeExerciseName(ex.exercise.name) || ex.exercise.name;
      for (const s of ex.sets) {
        if (s.type !== "WORKING") continue;
        const weight = s.weight ?? 0;
        const reps = s.reps ?? 0;
        if (weight <= 0 || reps <= 0 || reps > 10) continue;
        const oneRM = e1rm(weight, reps);
        const prev = bestByLift.get(key);
        if (!prev || oneRM > prev.oneRM)
          bestByLift.set(key, { name: ex.exercise.name, weight, reps, oneRM });
      }
    }
  }
  const topLifts = [...bestByLift.values()]
    .sort((a, b) => b.oneRM - a.oneRM)
    .slice(0, 5);

  const firstName = (user.name || "").split(" ")[0] || "They";
  const topOneRM = topLifts[0]?.oneRM ?? 1;

  return (
    <div className="max-w-lg mx-auto pb-6">
      {/* Cover */}
      <div className="relative">
        <div
          className="w-full"
          style={{
            height: 112,
            background: user.coverImage
              ? `center/cover url(${user.coverImage})`
              : "radial-gradient(120% 140% at 0% 0%, rgba(34,197,94,0.35) 0%, rgba(34,197,94,0.08) 45%, transparent 75%), var(--bg)",
          }}
        />
        <div className="absolute top-4 left-4">
          <BackButton href="/group" ariaLabel="Back to crew" />
        </div>
        <div className="absolute left-4" style={{ bottom: -34 }}>
          <div className="relative">
            <div style={{ padding: 3, background: "var(--bg)", borderRadius: "9999px" }}>
              <Avatar name={user.name} image={user.image} size={76} />
            </div>
            <span
              className="absolute -bottom-0.5 -right-1 text-[11px] font-bold px-1.5 py-0.5 rounded-md tabular-nums"
              style={{ background: "#a3e635", color: "#0a0a0a", border: "2px solid var(--bg)" }}
              title={`Level ${level}`}
            >
              Lv {level}
            </span>
          </div>
        </div>
        <div className="absolute right-4" style={{ bottom: -46 }}>
          {isSelf ? (
            <ShareProfileButton userId={user.id} />
          ) : (
            <FriendButton targetUserId={user.id} initialState={friendState} />
          )}
        </div>
      </div>

      <div className="px-4 pt-11">
        <h1 className="text-[26px] font-extrabold tracking-tight leading-none truncate">
          {user.name}
        </h1>
        <p className="text-[13px] mt-1.5 truncate" style={{ color: "var(--fg-muted)" }}>
          {[user.username && `@${user.username}`, user.bio || user.preferredSplit]
            .filter(Boolean)
            .join(" · ")}
        </p>

        {/* This month */}
        <section
          className="relative rounded-3xl p-5 mt-5 overflow-hidden"
          style={{
            background:
              "radial-gradient(140% 90% at 0% 0%, rgba(34,197,94,0.16) 0%, transparent 60%), var(--bg-card)",
            border: "1px solid var(--border-strong)",
          }}
        >
          <p className="text-[12px] font-semibold" style={{ color: "var(--fg-muted)" }}>
            {monthName}
          </p>
          <p className="mt-1 leading-none">
            <span className="text-[52px] font-bold tabular-nums" style={{ letterSpacing: "-0.04em" }}>
              {monthSessions}
            </span>
            <span className="text-[15px] font-semibold ml-1.5" style={{ color: "var(--fg-muted)" }}>
              {monthSessions === 1 ? "session" : "sessions"}
            </span>
          </p>
          <p className="text-[12px] mt-1.5 tabular-nums" style={{ color: "var(--fg-muted)" }}>
            {[
              monthMinutes > 0 && `${monthMinutes.toLocaleString()} min`,
              monthCalories > 0 && `${monthCalories.toLocaleString()} kcal`,
            ]
              .filter(Boolean)
              .join(" · ") || "Nothing logged yet this month"}
          </p>

          {/* one bar per day of the month */}
          <div className="flex items-end gap-[3px] mt-4" style={{ height: 28 }} aria-hidden>
            {perDay.map((n, i) => (
              <div
                key={i}
                className="flex-1 rounded-full"
                style={{
                  height: n ? (n > 1 ? 28 : 20) : 4,
                  background: n
                    ? i === now.getDate() - 1
                      ? "linear-gradient(180deg, #a3e635, #22c55e)"
                      : "rgba(74,222,128,0.6)"
                    : i < now.getDate()
                      ? "var(--bg-elevated)"
                      : "rgba(255,255,255,0.03)",
                }}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4">
            <Tile
              label="Streak"
              value={`${streak}`}
              note={streak === 1 ? "week in a row" : "weeks in a row"}
              color={streak > 0 ? "#4ade80" : undefined}
            />
            <Tile label="Cheers" value={`${cheers}`} note="received" />
            <Tile label="All-time" value={`${totalWorkouts}`} note="sessions" />
          </div>
        </section>

        {/* History calendar */}
        <section
          className="rounded-3xl p-4 mt-3"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <ProfileCalendar
            year={now.getFullYear()}
            month={now.getMonth()}
            earliestYear={earliest.getFullYear()}
            earliestMonth={earliest.getMonth()}
            workoutsByMonth={workoutsByMonth}
            today={now.getDate()}
          />
        </section>

        {/* Top lifts */}
        {topLifts.length > 0 && (
          <section
            className="rounded-3xl p-4 mt-3"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-[16px] font-bold tracking-tight">Top lifts</h2>
              <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                est. 1RM · last 12 months
              </span>
            </div>
            {topLifts.map((l, i) => (
              <div key={l.name} className="py-2.5">
                <div className="flex items-center gap-3">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 tabular-nums"
                    style={
                      i === 0
                        ? { background: "#a3e635", color: "#0a0a0a" }
                        : { background: "var(--bg-elevated)", color: "var(--fg-muted)" }
                    }
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold truncate">{l.name}</p>
                    <p className="text-[11px] tabular-nums" style={{ color: "var(--fg-muted)" }}>
                      best set {formatLoad(l.name, l.weight)} × {l.reps}
                    </p>
                  </div>
                  <p className="text-[17px] font-bold tabular-nums shrink-0">
                    {Math.round(l.oneRM)}
                    <span className="text-[11px] font-medium ml-0.5" style={{ color: "var(--fg-muted)" }}>
                      lb
                    </span>
                  </p>
                </div>
                <div className="ml-9 mt-2 h-[5px] rounded-full" style={{ background: "var(--bg-elevated)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(8, (l.oneRM / topOneRM) * 100)}%`,
                      background: i === 0 ? "linear-gradient(90deg, #22c55e, #a3e635)" : "rgba(74,222,128,0.55)",
                    }}
                  />
                </div>
              </div>
            ))}
          </section>
        )}

        {totalWorkouts === 0 && (
          <div
            className="rounded-3xl p-6 text-center mt-3"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
              {isSelf ? "No sessions logged yet." : `${firstName} hasn't logged a session yet.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, note, color }: { label: string; value: string; note: string; color?: string }) {
  return (
    <div className="rounded-2xl py-2.5 px-2 text-center" style={{ background: "var(--bg-elevated)" }}>
      <p className="text-[11px] font-semibold" style={{ color: "var(--fg-muted)" }}>{label}</p>
      <p className="text-[20px] font-bold tabular-nums leading-tight mt-0.5" style={{ color: color ?? "var(--fg)" }}>
        {value}
      </p>
      <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--fg-muted)" }}>{note}</p>
    </div>
  );
}
