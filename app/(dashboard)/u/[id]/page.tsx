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
import Link from "next/link";
import BackButton from "@/components/BackButton";
import FriendButton from "@/components/FriendButton";
import ShareProfileButton from "@/components/ShareProfileButton";
import { getFriendState } from "@/lib/actions/friends";
import Avatar from "@/components/Avatar";
import ProfileCalendar, {
  monthKey,
  type CalendarWorkout,
} from "@/components/ProfileCalendar";

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
  const monthMinutes = Math.round(
    monthWorkouts.reduce((s, w) => s + (w.duration ?? 0), 0) / 60,
  );
  const monthCalories = monthWorkouts.reduce(
    (s, w) => s + (w.calories ?? 0),
    0,
  );

  // Level from lifetime workouts.
  const level = Math.floor(totalWorkouts / 10) + 1;

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

  return (
    <div className="max-w-lg mx-auto pb-24">
      {/* Cover */}
      <div className="relative">
        <div
          className="w-full"
          style={{
            height: 150,
            background: user.coverImage
              ? `center/cover url(${user.coverImage})`
              : "linear-gradient(135deg, rgba(34,197,94,0.25), rgba(10,10,10,1))",
          }}
        />
        <div className="absolute top-4 left-4">
          <BackButton href="/group" ariaLabel="Back to crew" />
        </div>
        {/* Avatar overlaps the cover */}
        <div className="absolute left-4" style={{ bottom: -36 }}>
          <div className="relative">
            <div
              style={{
                padding: 3,
                background: "var(--bg)",
                borderRadius: "9999px",
              }}
            >
              <Avatar name={user.name} image={user.image} size={84} />
            </div>
            <span
              className="absolute -bottom-1 -right-1 text-[12px] font-bold px-2 py-0.5 rounded-lg"
              style={{ background: "#a3e635", color: "#0a0a0a" }}
            >
              ⚡{level}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 pt-12">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[24px] font-bold tracking-tight leading-none truncate">
              {user.name}
            </h1>
            {user.username && (
              <p className="text-[12px] mt-1" style={{ color: "var(--fg-dim)" }}>
                @{user.username}
              </p>
            )}
            {(user.preferredSplit || user.bio) && (
              <p className="text-[12px] mt-1" style={{ color: "var(--fg-dim)" }}>
                {user.bio || user.preferredSplit}
              </p>
            )}
          </div>
          <div className="shrink-0">
            {isSelf ? (
              <ShareProfileButton userId={user.id} />
            ) : (
              <FriendButton targetUserId={user.id} initialState={friendState} />
            )}
          </div>
        </div>

        {/* Stat rings (this month) */}
        <div className="grid grid-cols-4 gap-2 mt-5">
          <Ring label="Workouts" value={monthSessions} goal={20} color="#3b82f6" />
          <Ring label="Minutes" value={monthMinutes} goal={1000} color="#1dd2e6" />
          <Ring label="Calories" value={monthCalories} goal={6000} color="#f97316" />
          <Ring label="Cheers" value={cheers} goal={Math.max(10, cheers)} color="#ec4899" />
        </div>

        {/* History calendar */}
        <div className="mt-6">
          <ProfileCalendar
            year={now.getFullYear()}
            month={now.getMonth()}
            earliestYear={earliest.getFullYear()}
            earliestMonth={earliest.getMonth()}
            workoutsByMonth={workoutsByMonth}
          />
        </div>

        {/* Top lifts */}
        {topLifts.length > 0 && (
          <div className="mt-6">
            <h2 className="text-[16px] font-bold tracking-tight mb-2">Top lifts</h2>
            <div
              className="rounded-2xl divide-y"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
              {topLifts.map((l) => (
                <div
                  key={l.name}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium truncate">{l.name}</p>
                    <p
                      className="text-[11px] tabular-nums"
                      style={{ color: "var(--fg-dim)" }}
                    >
                      from {formatLoad(l.name, l.weight)} × {l.reps}
                    </p>
                  </div>
                  <p
                    className="text-[15px] font-bold tabular-nums shrink-0"
                    style={{ color: "var(--accent)" }}
                  >
                    {Math.round(l.oneRM)}
                    <span className="text-[10px] font-normal opacity-70 ml-0.5">
                      lb e1RM
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {totalWorkouts === 0 && (
          <div
            className="rounded-2xl p-6 text-center mt-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
              No sessions logged yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Ring({
  label,
  value,
  goal,
  color,
}: {
  label: string;
  value: number;
  goal: number;
  color: string;
}) {
  const frac = Math.max(0, Math.min(1, value / Math.max(1, goal)));
  const r = 26;
  const c = 2 * Math.PI * r;
  const display =
    value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);
  return (
    <div className="flex flex-col items-center">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="var(--bg-elevated)"
          strokeWidth="5"
        />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform="rotate(-90 32 32)"
        />
        <text
          x="32"
          y="36"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="var(--fg)"
        >
          {display}
        </text>
      </svg>
      <span className="text-[10px] mt-1" style={{ color: "var(--fg-dim)" }}>
        {label}
      </span>
    </div>
  );
}
