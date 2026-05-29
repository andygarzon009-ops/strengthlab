import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { e1rm } from "@/lib/strengthProgression";
import { shapeForType, isMachineExercise, labelForType } from "@/lib/exercises";
import { normalizeExerciseName } from "@/lib/exerciseIdentity";
import BackButton from "@/components/BackButton";
import FollowButton from "@/components/FollowButton";
import ShareProfileButton from "@/components/ShareProfileButton";

export const dynamic = "force-dynamic";

function relative(d: Date): string {
  const day = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (day <= 0) return "today";
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewerId = await requireAuth();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, image: true, preferredSplit: true },
  });
  if (!user) notFound();

  const isSelf = user.id === viewerId;
  const following = isSelf
    ? false
    : (await prisma.follow.findUnique({
        where: {
          followerId_followingId: { followerId: viewerId, followingId: user.id },
        },
        select: { id: true },
      })) !== null;

  const yearAgo = new Date(new Date().getTime() - 365 * 24 * 60 * 60 * 1000);
  const workouts = await prisma.workout.findMany({
    where: { userId: user.id, date: { gte: yearAgo } },
    orderBy: { date: "desc" },
    select: {
      id: true,
      title: true,
      type: true,
      date: true,
      exercises: {
        select: {
          exercise: { select: { id: true, name: true } },
          sets: { select: { type: true, weight: true, reps: true } },
        },
      },
    },
  });

  // This-week sessions + volume (strength working sets).
  const weekAgo = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000);
  const thisWeek = workouts.filter((w) => new Date(w.date) >= weekAgo);
  let weekVolume = 0;
  for (const w of thisWeek) {
    if (shapeForType(w.type) !== "STRENGTH") continue;
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        if (s.type === "WARMUP") continue;
        weekVolume += (s.weight ?? 0) * (s.reps ?? 0);
      }
    }
  }

  // Training streak — consecutive days ending today/yesterday.
  const streak = (() => {
    if (workouts.length === 0) return 0;
    const days = [
      ...new Set(workouts.map((w) => new Date(w.date).toISOString().slice(0, 10))),
    ].sort();
    const today = new Date().toISOString().slice(0, 10);
    const yest = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const last = days[days.length - 1];
    if (last !== today && last !== yest) return 0;
    let s = 1;
    for (let i = days.length - 2; i >= 0; i--) {
      const diff =
        (new Date(days[i + 1]).getTime() - new Date(days[i]).getTime()) /
        86_400_000;
      if (Math.round(diff) === 1) s++;
      else break;
    }
    return s;
  })();

  // Top lifts by best est. 1RM (non-machine, reps ≤ 10).
  const bestByLift = new Map<
    string,
    { name: string; weight: number; reps: number; oneRM: number }
  >();
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (isMachineExercise(ex.exercise.name)) continue;
      const key = normalizeExerciseName(ex.exercise.name) || ex.exercise.id;
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

  const recent = workouts.slice(0, 5);

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <BackButton href="/group" ariaLabel="Back to crew" />
        <div className="min-w-0 flex-1">
          <p className="label" style={{ color: "var(--accent)" }}>
            {isSelf ? "Your profile" : "Athlete"}
          </p>
          <h1 className="text-[24px] font-bold tracking-tight leading-none mt-1 truncate">
            {user.name}
          </h1>
          {user.preferredSplit && (
            <p className="text-[12px] mt-1" style={{ color: "var(--fg-dim)" }}>
              {user.preferredSplit}
            </p>
          )}
        </div>
        {isSelf ? (
          <ShareProfileButton userId={user.id} />
        ) : (
          <FollowButton targetUserId={user.id} initialFollowing={following} />
        )}
      </div>

      {/* Summary tiles */}
      <div
        className="rounded-2xl p-4 mb-4 grid grid-cols-3 gap-3"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <Tile label="This week" value={String(thisWeek.length)} unit="sessions" />
        <Tile
          label="Volume"
          value={
            weekVolume >= 1000
              ? `${(weekVolume / 1000).toFixed(1)}k`
              : String(Math.round(weekVolume))
          }
          unit="lb"
        />
        <Tile
          label="Streak"
          value={String(streak)}
          unit="days"
          accent={streak > 0}
        />
      </div>

      {/* Top lifts */}
      {topLifts.length > 0 && (
        <div className="mb-4">
          <h2 className="text-[14px] font-bold tracking-tight mb-2">Top lifts</h2>
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
                    from {l.weight} × {l.reps}
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

      {/* Recent sessions */}
      {recent.length > 0 && (
        <div>
          <h2 className="text-[14px] font-bold tracking-tight mb-2">Recent</h2>
          <div className="space-y-2">
            {recent.map((w) => (
              <div
                key={w.id}
                className="rounded-xl px-4 py-3 flex items-center justify-between"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium truncate">{w.title}</p>
                  <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
                    {labelForType(w.type)} · {w.exercises.length} exercise
                    {w.exercises.length === 1 ? "" : "s"}
                  </p>
                </div>
                <span
                  className="text-[11px] tabular-nums shrink-0 ml-2"
                  style={{ color: "var(--fg-dim)" }}
                >
                  {relative(new Date(w.date))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {workouts.length === 0 && (
        <div
          className="rounded-2xl p-6 text-center"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
            No sessions logged in the last year.
          </p>
        </div>
      )}

      {isSelf && (
        <p className="text-[11px] text-center mt-6" style={{ color: "var(--fg-dim)" }}>
          Share your link so friends can follow you.{" "}
          <Link href="/group" style={{ color: "var(--accent)" }}>
            Back to Crew
          </Link>
        </p>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div>
      <p
        className="text-[9px] uppercase tracking-wider font-semibold"
        style={{ color: "var(--fg-dim)" }}
      >
        {label}
      </p>
      <p
        className="text-[18px] font-bold tabular-nums"
        style={{ color: accent ? "var(--accent)" : "var(--fg)" }}
      >
        {value}
        <span className="text-[10px] ml-0.5 font-normal" style={{ color: "var(--fg-dim)" }}>
          {unit}
        </span>
      </p>
    </div>
  );
}
