import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { WORKOUT_TYPES, FEELING_OPTIONS, REACTION_TYPES } from "@/lib/exercises";
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

  if (!workout) return <div className="p-4 text-zinc-400">Workout not found</div>;

  // Get PRs for this workout
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
    <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-zinc-400 hover:text-white p-1 text-lg">
          ←
        </Link>
        <div className="flex-1" />
        {isOwn && (
          <form
            action={async () => {
              "use server";
              await deleteWorkout(id);
            }}
          >
            <button
              type="submit"
              className="text-zinc-600 hover:text-red-400 text-sm transition-colors"
            >
              Delete
            </button>
          </form>
        )}
      </div>

      {/* Workout title area */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-sm font-medium px-2 py-1 rounded-lg bg-zinc-800 ${workoutType?.color ?? "text-zinc-400"}`}>
            {workoutType?.label ?? workout.type}
          </span>
          {feeling && <span className="text-xl">{feeling.emoji}</span>}
          {workout.isDeload && (
            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-lg">
              Deload
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-white">{workout.title}</h1>
        <p className="text-zinc-500 text-sm mt-1">
          {format(new Date(workout.date), "EEEE, MMMM d, yyyy")}
          {!isOwn && ` · by ${workout.user.name}`}
        </p>
        {workout.notes && (
          <p className="text-zinc-400 text-sm mt-3 bg-zinc-900 rounded-xl px-4 py-3">
            {workout.notes}
          </p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Exercises", value: workout.exercises.length },
          { label: "Working Sets", value: totalSets },
          {
            label: "Volume",
            value:
              totalVolume >= 1000
                ? `${(totalVolume / 1000).toFixed(1)}k`
                : totalVolume,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center"
          >
            <p className="text-white font-bold text-xl">{stat.value}</p>
            <p className="text-zinc-500 text-xs">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* PRs */}
      {prs.length > 0 && (
        <div className="mb-6 bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">
          <p className="text-orange-400 font-semibold text-sm mb-2">🏆 Personal Records</p>
          <div className="space-y-1">
            {prs.map((pr) => (
              <p key={pr.id} className="text-zinc-300 text-sm">
                <span className="font-medium text-white">{pr.exercise.name}</span>{" "}
                — {pr.type === "WEIGHT"
                  ? `${pr.value}lbs`
                  : pr.type === "REPS"
                  ? `${pr.value} reps`
                  : `${pr.value}lbs vol`}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Exercises */}
      <div className="space-y-4 mb-6">
        {workout.exercises.map((ex) => {
          const warmupSets = ex.sets.filter((s) => s.type === "WARMUP");
          const workingSets = ex.sets.filter((s) => s.type === "WORKING");

          return (
            <div key={ex.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="p-4 pb-3">
                <h3 className="font-bold text-white text-base">{ex.exercise.name}</h3>
                {ex.notes && (
                  <p className="text-zinc-500 text-xs mt-1 italic">{ex.notes}</p>
                )}
              </div>

              {warmupSets.length > 0 && (
                <div className="px-4 pb-2">
                  <p className="text-zinc-600 text-xs font-medium mb-2">WARM-UP</p>
                  {warmupSets.map((s) => (
                    <div key={s.id} className="flex gap-3 items-center mb-1.5 text-sm">
                      <span className="text-zinc-600 w-4 text-center">{s.setNumber}</span>
                      <span className="text-zinc-400">
                        {s.weight ?? "—"}lbs × {s.reps ?? "—"}
                      </span>
                      {s.rir != null && (
                        <span className="text-zinc-600 text-xs">RIR {s.rir}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="px-4 pb-4">
                <p className="text-zinc-500 text-xs font-medium mb-2">WORKING SETS</p>
                {workingSets.map((s) => (
                  <div key={s.id} className="flex gap-3 items-center mb-1.5">
                    <span className="text-orange-400 text-sm w-4 text-center">{s.setNumber}</span>
                    <span className="text-white font-medium text-sm">
                      {s.weight ?? "—"}lbs × {s.reps ?? "—"}
                    </span>
                    {s.rir != null && (
                      <span className="text-zinc-500 text-xs">RIR {s.rir}</span>
                    )}
                    {s.notes && (
                      <span className="text-zinc-600 text-xs italic">{s.notes}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reactions */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
        <ReactionButtons
          workoutId={workout.id}
          reactions={workout.reactions}
          currentUserId={userId}
        />
      </div>

      {/* Comments */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <CommentSection
          workoutId={workout.id}
          comments={workout.comments}
          currentUserId={userId}
        />
      </div>
    </div>
  );
}
