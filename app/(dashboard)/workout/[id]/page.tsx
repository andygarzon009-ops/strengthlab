import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import {
  FEELING_OPTIONS,
  STRENGTH_SPLITS,
  labelForType,
  shapeForType,
  formatDuration,
} from "@/lib/exercises";
import { format } from "date-fns";
import Link from "next/link";
import { deleteWorkout } from "@/lib/actions/workouts";
import BackButton from "@/components/BackButton";
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

  const typeLabel = labelForType(workout.type);
  const shape = shapeForType(workout.type);
  const splitLabel = workout.split
    ? STRENGTH_SPLITS.find((s) => s.value === workout.split)?.label
    : null;
  const feeling = FEELING_OPTIONS.find((f) => f.value === workout.feeling);
  const isOwn = workout.userId === userId;

  const totalSets = workout.exercises.flatMap((e) =>
    e.sets.filter((s) => s.type === "WORKING")
  ).length;
  const topSetWeight = workout.exercises
    .flatMap((e) => e.sets.filter((s) => s.type === "WORKING"))
    .reduce((max, s) => Math.max(max, s.weight ?? 0), 0);

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center justify-between mb-8">
        <BackButton fallbackHref="/" />
        {isOwn && (
          <div className="flex items-center gap-3">
            <Link
              href={`/workout/${id}/edit`}
              className="text-[12px] label"
              style={{ color: "var(--accent)" }}
            >
              Edit
            </Link>
            <span
              className="text-[10px]"
              style={{ color: "var(--fg-dim)" }}
            >
              ·
            </span>
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
          </div>
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
            {typeLabel}
          </span>
          {splitLabel && (
            <span
              className="label text-[9px] px-2 py-1 rounded-md"
              style={{
                background: "var(--bg-elevated)",
                color: "var(--fg-muted)",
              }}
            >
              {splitLabel}
            </span>
          )}
          {feeling && (
            <span
              className="label text-[9px] px-2 py-1 rounded-md"
              style={{
                background: "var(--accent-dim)",
                color: "var(--accent)",
              }}
            >
              {feeling.label}
            </span>
          )}
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

      <StatsGrid
        stats={
          shape === "STRENGTH"
            ? [
                { label: "Exercises", value: workout.exercises.length },
                { label: "Working Sets", value: totalSets },
                {
                  label: "Top set",
                  value: topSetWeight > 0 ? topSetWeight : "—",
                  suffix: topSetWeight > 0 ? "lb" : undefined,
                },
              ]
            : shape === "DISTANCE"
              ? [
                  {
                    label: "Distance",
                    value: workout.distance ?? "—",
                    suffix: workout.distance ? "km" : undefined,
                  },
                  {
                    label: "Time",
                    value: formatDuration(workout.duration),
                  },
                  {
                    label: "Pace",
                    value: workout.pace ?? "—",
                    suffix: workout.pace ? "/km" : undefined,
                  },
                ]
              : [
                  {
                    label: "Time",
                    value: formatDuration(workout.duration),
                  },
                  {
                    label: "Rounds",
                    value: workout.rounds ?? "—",
                  },
                  {
                    label: "RPE",
                    value: workout.rpe ?? "—",
                    suffix: workout.rpe ? "/10" : undefined,
                  },
                ]
        }
      />

      {/* Secondary metrics: HR, elevation, calories */}
      {(workout.avgHeartRate ||
        workout.maxHeartRate ||
        workout.elevation ||
        workout.calories) && (
        <div className="grid grid-cols-2 gap-2 mb-6">
          {workout.avgHeartRate && (
            <MetricChip label="Avg HR" value={workout.avgHeartRate} suffix="bpm" />
          )}
          {workout.maxHeartRate && (
            <MetricChip label="Max HR" value={workout.maxHeartRate} suffix="bpm" />
          )}
          {workout.elevation && (
            <MetricChip label="Elevation" value={workout.elevation} suffix="m" />
          )}
          {workout.calories && (
            <MetricChip label="Calories" value={workout.calories} suffix="kcal" />
          )}
        </div>
      )}

      {prs.length > 0 && (
        <div
          className="rounded-2xl p-4 mb-6"
          style={{
            background: "var(--accent-dim)",
            border: "1px solid rgba(34,197,94,0.3)",
          }}
        >
          <p
            className="label mb-2"
            style={{ color: "var(--accent)" }}
          >
            Personal Records
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

      {shape === "STRENGTH" && (
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
      )}

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

function StatsGrid({
  stats,
}: {
  stats: {
    label: string;
    value: string | number;
    suffix?: string;
  }[];
}) {
  return (
    <div
      className="grid grid-cols-3 gap-px card overflow-hidden mb-3"
      style={{ background: "var(--border)", padding: 0 }}
    >
      {stats.map((stat) => (
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
  );
}

function MetricChip({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="card px-3 py-2.5 flex items-baseline justify-between">
      <span
        className="label text-[9px]"
        style={{ color: "var(--fg-dim)" }}
      >
        {label}
      </span>
      <span
        className="text-[14px] font-semibold nums"
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
      </span>
    </div>
  );
}
