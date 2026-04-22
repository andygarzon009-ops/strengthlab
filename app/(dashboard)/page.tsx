import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import {
  FEELING_OPTIONS,
  labelForType,
  shapeForType,
  formatDuration,
} from "@/lib/exercises";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import ReactionButtons from "@/components/ReactionButtons";
import CommentSection from "@/components/CommentSection";
import WeeklyRecap from "@/components/WeeklyRecap";

export default async function FeedPage() {
  const userId = await requireAuth();

  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    include: { group: { include: { members: { include: { user: true } } } } },
  });

  const groupMemberIds = memberships.flatMap((m) =>
    m.group.members.map((gm) => gm.userId)
  );
  const allUserIds = [...new Set([userId, ...groupMemberIds])];

  const workouts = await prisma.workout.findMany({
    where: { userId: { in: allUserIds } },
    include: {
      user: true,
      exercises: {
        include: { exercise: true, sets: true },
        orderBy: { order: "asc" },
      },
      reactions: { include: { user: true } },
      comments: { include: { user: true }, orderBy: { createdAt: "asc" } },
      _count: { select: { exercises: true } },
    },
    orderBy: { date: "desc" },
    take: 20,
  });

  const currentUser = await prisma.user.findUnique({ where: { id: userId } });

  return (
    <div className="max-w-lg mx-auto px-4 pt-8">
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="label mb-1">Feed</p>
          <h1 className="text-[28px] font-bold tracking-tight leading-none">
            {currentUser?.name?.split(" ")[0] ?? "Athlete"}
          </h1>
        </div>
        <Link
          href="/log"
          className="btn-accent px-4 py-2.5 rounded-xl text-sm inline-flex items-center gap-1.5"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          New
        </Link>
      </div>

      <WeeklyRecap userId={userId} />

      {workouts.length === 0 ? (
        <div className="text-center py-16 card px-6">
          <div
            className="w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center"
            style={{
              background: "var(--accent-dim)",
              border: "1px solid rgba(34,197,94,0.25)",
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 4h2v16H6zM16 4h2v16h-2zM3 8h3v8H3zM18 8h3v8h-3zM8 11h8v2H8z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold tracking-tight mb-1.5">
            Nothing logged yet
          </h2>
          <p
            className="text-sm mb-6"
            style={{ color: "var(--fg-muted)" }}
          >
            Log your first session or join a group to see your crew&apos;s workouts.
          </p>
          <Link href="/log" className="btn-accent inline-block px-6 py-3 rounded-xl text-sm">
            Log First Session
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {workouts.map((workout) => {
            const typeLabel = labelForType(workout.type);
            const shape = shapeForType(workout.type);
            const feeling = FEELING_OPTIONS.find((f) => f.value === workout.feeling);
            const workingSets = workout.exercises.flatMap((e) =>
              e.sets.filter((s) => s.type === "WORKING")
            );
            const totalVolume = workingSets.reduce(
              (sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0),
              0
            );
            const isOwn = workout.userId === userId;

            return (
              <article
                key={workout.id}
                className="card overflow-hidden animate-slide-up"
              >
                <div className="p-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0"
                        style={{
                          background: "var(--accent-dim)",
                          color: "var(--accent)",
                          border: "1px solid rgba(34,197,94,0.2)",
                        }}
                      >
                        {workout.user.name[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-[14px] truncate">
                          {isOwn ? "You" : workout.user.name}
                        </p>
                        <p
                          className="text-[11px] mt-0.5"
                          style={{ color: "var(--fg-dim)" }}
                        >
                          {formatDistanceToNow(new Date(workout.date), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {feeling && (
                        <span
                          className="label text-[9px]"
                          style={{ color: "var(--fg-dim)" }}
                        >
                          {feeling.label}
                        </span>
                      )}
                      <span
                        className="label text-[9px] px-2 py-1 rounded-md"
                        style={{
                          background: "var(--bg-elevated)",
                          color: "var(--fg-muted)",
                        }}
                      >
                        {typeLabel}
                      </span>
                    </div>
                  </div>

                  <Link href={`/workout/${workout.id}`}>
                    <h3 className="font-bold text-[17px] mt-3 tracking-tight leading-tight hover:opacity-80 transition-opacity">
                      {workout.title}
                    </h3>
                  </Link>

                  {workout.notes && (
                    <p
                      className="text-[13px] mt-1.5 line-clamp-2 leading-relaxed"
                      style={{ color: "var(--fg-muted)" }}
                    >
                      {workout.notes}
                    </p>
                  )}
                </div>

                <div
                  className="px-4 py-3 grid grid-cols-3 gap-px"
                  style={{ background: "var(--border)" }}
                >
                  {shape === "STRENGTH" ? (
                    <>
                      <Stat label="Exercises" value={workout.exercises.length} />
                      <Stat label="Sets" value={workingSets.length} />
                      <Stat
                        label="Volume"
                        value={
                          totalVolume >= 1000
                            ? `${(totalVolume / 1000).toFixed(1)}k`
                            : totalVolume
                        }
                        suffix={totalVolume > 0 ? "lb" : undefined}
                      />
                    </>
                  ) : shape === "DISTANCE" ? (
                    <>
                      <Stat
                        label="Distance"
                        value={workout.distance ?? "—"}
                        suffix={workout.distance ? "km" : undefined}
                      />
                      <Stat
                        label="Time"
                        value={formatDuration(workout.duration)}
                      />
                      <Stat
                        label="Pace"
                        value={workout.pace ?? "—"}
                        suffix={workout.pace ? "/km" : undefined}
                      />
                    </>
                  ) : (
                    <>
                      <Stat
                        label="Time"
                        value={formatDuration(workout.duration)}
                      />
                      <Stat
                        label="Rounds"
                        value={workout.rounds ?? "—"}
                      />
                      <Stat
                        label="RPE"
                        value={workout.rpe ?? "—"}
                        suffix={workout.rpe ? "/10" : undefined}
                      />
                    </>
                  )}
                </div>

                {shape === "STRENGTH" && workout.exercises.length > 0 && (
                  <div className="px-4 pt-3 pb-3">
                    <div className="flex flex-wrap gap-1.5">
                      {workout.exercises.slice(0, 4).map((ex) => (
                        <span
                          key={ex.id}
                          className="text-[11px] px-2 py-1 rounded-md"
                          style={{
                            background: "var(--bg-elevated)",
                            color: "var(--fg-muted)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {ex.exercise.name}
                        </span>
                      ))}
                      {workout.exercises.length > 4 && (
                        <span
                          className="text-[11px] px-2 py-1 rounded-md"
                          style={{
                            color: "var(--fg-dim)",
                          }}
                        >
                          +{workout.exercises.length - 4}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div
                  className="px-4 py-3"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <ReactionButtons
                    workoutId={workout.id}
                    reactions={workout.reactions}
                    currentUserId={userId}
                  />
                </div>

                <CommentSection
                  workoutId={workout.id}
                  comments={workout.comments}
                  currentUserId={userId}
                />
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | string;
  suffix?: string;
}) {
  return (
    <div
      className="py-1.5"
      style={{ background: "var(--bg-card)" }}
    >
      <p className="label text-[9px]" style={{ color: "var(--fg-dim)" }}>
        {label}
      </p>
      <p
        className="nums font-mono text-[15px] font-semibold leading-tight mt-0.5"
        style={{ fontFamily: "var(--font-geist-mono)" }}
      >
        {value}
        {suffix && (
          <span
            className="text-[10px] ml-0.5 font-normal"
            style={{ color: "var(--fg-dim)" }}
          >
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}
