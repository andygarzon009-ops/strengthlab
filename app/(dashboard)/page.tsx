import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { REACTION_TYPES, WORKOUT_TYPES, FEELING_OPTIONS } from "@/lib/exercises";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import ReactionButtons from "@/components/ReactionButtons";
import CommentSection from "@/components/CommentSection";

export default async function FeedPage() {
  const userId = await requireAuth();

  // Get user's groups
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
    <div className="max-w-lg mx-auto px-4 pt-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Hey, {currentUser?.name?.split(" ")[0]} 👋
          </h1>
          <p className="text-zinc-500 text-sm">Your crew&apos;s activity</p>
        </div>
        <Link
          href="/log"
          className="bg-orange-500 hover:bg-orange-400 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          + Log
        </Link>
      </div>

      {workouts.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🏋️</div>
          <h2 className="text-xl font-semibold text-white mb-2">No workouts yet</h2>
          <p className="text-zinc-500 text-sm mb-6">
            Log your first session or join a group to see your crew&apos;s workouts.
          </p>
          <Link
            href="/log"
            className="inline-block bg-orange-500 text-white font-semibold px-6 py-3 rounded-xl"
          >
            Log First Workout
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {workouts.map((workout) => {
            const workoutType = WORKOUT_TYPES.find((t) => t.value === workout.type);
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
              <div
                key={workout.id}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden animate-slide-up"
              >
                {/* Header */}
                <div className="p-4 pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center text-lg font-bold text-orange-400">
                        {workout.user.name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-white text-sm">
                          {isOwn ? "You" : workout.user.name}
                        </p>
                        <p className="text-zinc-500 text-xs">
                          {formatDistanceToNow(new Date(workout.date), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {feeling && (
                        <span className="text-sm">{feeling.emoji}</span>
                      )}
                      <span className={`text-xs font-medium px-2 py-1 rounded-lg bg-zinc-800 ${workoutType?.color ?? "text-zinc-400"}`}>
                        {workoutType?.label ?? workout.type}
                      </span>
                    </div>
                  </div>

                  <Link href={`/workout/${workout.id}`}>
                    <h3 className="font-bold text-white text-lg mt-3 hover:text-orange-400 transition-colors">
                      {workout.title}
                    </h3>
                  </Link>

                  {workout.notes && (
                    <p className="text-zinc-400 text-sm mt-1 line-clamp-2">{workout.notes}</p>
                  )}
                </div>

                {/* Stats row */}
                <div className="px-4 pb-3 flex gap-4">
                  <div className="text-center">
                    <p className="text-white font-bold">{workout.exercises.length}</p>
                    <p className="text-zinc-500 text-xs">exercises</p>
                  </div>
                  <div className="text-center">
                    <p className="text-white font-bold">{workingSets.length}</p>
                    <p className="text-zinc-500 text-xs">sets</p>
                  </div>
                  {totalVolume > 0 && (
                    <div className="text-center">
                      <p className="text-white font-bold">
                        {totalVolume >= 1000
                          ? `${(totalVolume / 1000).toFixed(1)}k`
                          : totalVolume}
                      </p>
                      <p className="text-zinc-500 text-xs">lbs vol</p>
                    </div>
                  )}
                  {workout.isDeload && (
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-lg self-start">
                      Deload
                    </span>
                  )}
                </div>

                {/* Exercise preview */}
                {workout.exercises.length > 0 && (
                  <div className="px-4 pb-3">
                    <div className="flex flex-wrap gap-1.5">
                      {workout.exercises.slice(0, 4).map((ex) => (
                        <span
                          key={ex.id}
                          className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded-lg"
                        >
                          {ex.exercise.name}
                        </span>
                      ))}
                      {workout.exercises.length > 4 && (
                        <span className="text-xs bg-zinc-800 text-zinc-500 px-2 py-1 rounded-lg">
                          +{workout.exercises.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Reactions */}
                <div className="border-t border-zinc-800 px-4 py-3">
                  <ReactionButtons
                    workoutId={workout.id}
                    reactions={workout.reactions}
                    currentUserId={userId}
                  />
                </div>

                {/* Comments */}
                <CommentSection
                  workoutId={workout.id}
                  comments={workout.comments}
                  currentUserId={userId}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
