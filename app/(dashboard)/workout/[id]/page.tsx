import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { WORKOUT_TYPES, FEELING_OPTIONS } from "@/lib/exercises";
import { format } from "date-fns";
import Link from "next/link";
import { deleteWorkout } from "@/lib/actions/workouts";
import ReactionButtons from "@/components/ReactionButtons";
import CommentSection from "@/components/CommentSection";

export default async function WorkoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireAuth();
  const { id } = await params;

  const workout = await prisma.workout.findUnique({
    where: { id },
    include: {
      user: true,
      exercises: {
        include: {
          exercise: true,
          sets: { orderBy: { setNumber: "asc" } },
        },
        orderBy: { order: "asc" },
      },
      reactions: { include: { user: true } },
      comments: { include: { user: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!workout)
    return (
      <div className="p-4" style={{ color: "var(--fg-muted)" }}>
        Workout not found
      </div>
    );

  const prs = await prisma.personalRecord.findMany({
    where: { workoutId: id, userId },
    include: { exercise: true },
  });

  const workoutType = WORKOUT_TYPES.find((t) => t.value === workout.type);
  const feeling = FEELING_OPTIONS.find((f) => f.value === workout.feeling);
  const isOwn = workout.userId === userId;

  const totalSets = workout.exercises.flatMap((e) =>
    e.sets.filter((s) => s.type === "WORKING")
  ).length;
  const totalVolume = workout.exercises
    .flatMap((e) => e.sets.filter((s) => s.type === "WORKING"))
    .reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0);

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center justify-between mb-8">
        <Link
          href="/"
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--fg-muted)",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        {isOwn && (
          <form
            action={async () => {
              "use server";
              await deleteWorkout(id);
            }}
          >
            <button
              type="submit"
              className="text-[12px] label"
              style={{ color: "#f87171" }}
            >
              Delete
            </button>
          </form>
        )}
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span
            className="label text-[9px] px-2 py-1 rounded-md"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--fg-muted)",
            }}
          >
            {workoutType?.label ?? workout.type}
          </span>
          {feeling && <span className="text-[16px]">{feeling.emoji}</span>}
          {workout.isDeload && (
            <span
              className="label text-[9px] px-2 py-1 rounded-md"
              style={{
                background: "rgba(96,165,250,0.1)",
                color: "#60a5fa",
              }}
            >
              Deload
            </span>
          )}
        </div>
        <h1 className="text-[28px] font-bold tracking-tight leading-tight">
          {workout.title}
        </h1>
        <p
          className="text-[12px] mt-1.5 nums"
          style={{
            color: "var(--fg-dim)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {format(new Date(workout.date), "EEEE, MMMM d, yyyy")}
          {!isOwn && ` · by ${workout.user.name}`}
        </p>
        {workout.notes && (
          <p
            className="text-[13px] mt-4 leading-relaxed rounded-xl px-4 py-3"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--fg-muted)",
            }}
          >
            {workout.notes}
          </p>
        )}
      </div>

      <div
        className="grid grid-cols-3 gap-px card overflow-hidden mb-6"
        style={{ background: "var(--border)", padding: 0 }}
      >
        {[
          { label: "Exercises", value: workout.exercises.length },
          { label: "Working Sets", value: totalSets },
          {
            label: "Volume",
            value:
              totalVolume >= 1000
                ? `${(totalVolume / 1000).toFixed(1)}k`
                : totalVolume,
            suffix: totalVolume > 0 ? "lb" : undefined,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="px-3 py-4 text-center"
            style={{ background: "var(--bg-card)" }}
          >
            <p
              className="font-semibold text-[20px] leading-none tracking-tight nums"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
              {stat.value}
              {stat.suffix && (
                <span
                  className="text-[11px] ml-0.5 font-normal"
                  style={{ color: "var(--fg-dim)" }}
                >
                  {stat.suffix}
                </span>
              )}
            </p>
            <p
              className="label text-[9px] mt-1.5"
              style={{ color: "var(--fg-dim)" }}
            >
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {prs.length > 0 && (
        <div
          className="rounded-2xl p-4 mb-6"
          style={{
            background: "var(--accent-dim)",
            border: "1px solid rgba(255,90,31,0.3)",
          }}
        >
          <p
            className="label mb-2"
            style={{ color: "var(--accent)" }}
          >
            ★ Personal Records
          </p>
          <div className="space-y-1">
            {prs.map((pr) => (
              <p key={pr.id} className="text-[13px]">
                <span className="font-semibold">{pr.exercise.name}</span>
                <span style={{ color: "var(--fg-muted)" }}> — </span>
                <span
                  className="nums font-semibold"
                  style={{
                    color: "var(--accent)",
                    fontFamily: "var(--font-geist-mono)",
                  }}
                >
                  {pr.type === "WEIGHT"
                    ? `${pr.value}lb`
                    : pr.type === "REPS"
                      ? `${pr.value} reps`
                      : `${pr.value}lb vol`}
                </span>
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 mb-6">
        {workout.exercises.map((ex) => {
          const warmupSets = ex.sets.filter((s) => s.type === "WARMUP");
          const workingSets = ex.sets.filter((s) => s.type === "WORKING");

          return (
            <div key={ex.id} className="card overflow-hidden">
              <div className="p-4 pb-3">
                <h3 className="font-semibold text-[15px] tracking-tight">
                  {ex.exercise.name}
                </h3>
                {ex.notes && (
                  <p
                    className="text-[11px] mt-1 italic"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    {ex.notes}
                  </p>
                )}
              </div>

              {warmupSets.length > 0 && (
                <div className="px-4 pb-3">
                  <p className="label mb-2">Warm-up</p>
                  {warmupSets.map((s) => (
                    <SetLine
                      key={s.id}
                      num={s.setNumber}
                      weight={s.weight}
                      reps={s.reps}
                      rir={s.rir}
                      isWarmup
                    />
                  ))}
                </div>
              )}

              <div
                className="px-4 py-3"
                style={{
                  borderTop:
                    warmupSets.length > 0 ? "1px solid var(--border)" : "none",
                }}
              >
                <p className="label mb-2">Working sets</p>
                {workingSets.map((s) => (
                  <SetLine
                    key={s.id}
                    num={s.setNumber}
                    weight={s.weight}
                    reps={s.reps}
                    rir={s.rir}
                    note={s.notes}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card p-4 mb-3">
        <ReactionButtons
          workoutId={workout.id}
          reactions={workout.reactions}
          currentUserId={userId}
        />
      </div>

      <div className="card overflow-hidden">
        <CommentSection
          workoutId={workout.id}
          comments={workout.comments}
          currentUserId={userId}
        />
      </div>
    </div>
  );
}

function SetLine({
  num,
  weight,
  reps,
  rir,
  note,
  isWarmup,
}: {
  num: number;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  note?: string | null;
  isWarmup?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 mb-1 nums"
      style={{ fontFamily: "var(--font-geist-mono)" }}
    >
      <span
        className="text-[11px] w-4 text-center font-semibold"
        style={{ color: isWarmup ? "var(--fg-dim)" : "var(--accent)" }}
      >
        {num}
      </span>
      <span
        className="text-[13px] font-medium"
        style={{ color: isWarmup ? "var(--fg-muted)" : "var(--fg)" }}
      >
        {weight ?? "—"}
        <span
          style={{ color: "var(--fg-dim)", fontSize: "11px" }}
          className="ml-0.5"
        >
          lb
        </span>
        <span className="mx-1.5" style={{ color: "var(--fg-dim)" }}>
          ×
        </span>
        {reps ?? "—"}
      </span>
      {rir != null && (
        <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
          RIR {rir}
        </span>
      )}
      {note && (
        <span
          className="text-[11px] italic truncate"
          style={{ color: "var(--fg-dim)", fontFamily: "inherit" }}
        >
          {note}
        </span>
      )}
    </div>
  );
}
