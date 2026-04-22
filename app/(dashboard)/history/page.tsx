import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { WORKOUT_TYPES } from "@/lib/exercises";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns";
import Link from "next/link";

export default async function HistoryPage() {
  const userId = await requireAuth();

  const workouts = await prisma.workout.findMany({
    where: { userId },
    include: {
      exercises: {
        include: { sets: true, exercise: true },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { date: "desc" },
  });

  // Calendar for current month
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const workoutDates = new Set(
    workouts.map((w) => format(new Date(w.date), "yyyy-MM-dd"))
  );

  const startDayOfWeek = getDay(monthStart);

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
      <h1 className="text-2xl font-bold text-white mb-6">Workout History</h1>

      {/* Calendar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-6">
        <p className="text-white font-semibold mb-4">{format(now, "MMMM yyyy")}</p>
        <div className="grid grid-cols-7 gap-1 text-center">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div key={d} className="text-zinc-600 text-xs pb-1">{d}</div>
          ))}
          {Array.from({ length: startDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const hasWorkout = workoutDates.has(key);
            const isToday = key === format(now, "yyyy-MM-dd");
            return (
              <div
                key={key}
                className={`aspect-square flex items-center justify-center rounded-lg text-sm font-medium ${
                  hasWorkout
                    ? "bg-orange-500 text-white"
                    : isToday
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-600"
                }`}
              >
                {format(day, "d")}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Total Workouts", value: workouts.length },
          {
            label: "This Month",
            value: workouts.filter(
              (w) =>
                new Date(w.date) >= monthStart &&
                new Date(w.date) <= monthEnd
            ).length,
          },
          {
            label: "Avg/Week",
            value:
              workouts.length > 0
                ? (workouts.length / Math.max(1, Math.ceil(
                    (Date.now() - new Date(workouts[workouts.length - 1].date).getTime()) /
                      (7 * 24 * 60 * 60 * 1000)
                  ))).toFixed(1)
                : 0,
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

      {/* Workout list */}
      {workouts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-zinc-500">No workouts logged yet.</p>
          <Link href="/log" className="text-orange-400 text-sm mt-2 inline-block">
            Log your first workout
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {workouts.map((workout) => {
            const workoutType = WORKOUT_TYPES.find((t) => t.value === workout.type);
            const workingSets = workout.exercises.flatMap((e) =>
              e.sets.filter((s) => s.type === "WORKING")
            );
            const totalVolume = workingSets.reduce(
              (sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0),
              0
            );

            return (
              <Link
                key={workout.id}
                href={`/workout/${workout.id}`}
                className="block bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-4 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium ${workoutType?.color ?? "text-zinc-400"}`}>
                        {workoutType?.label ?? workout.type}
                      </span>
                      {workout.isDeload && (
                        <span className="text-xs text-blue-400">Deload</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-white">{workout.title}</h3>
                    <p className="text-zinc-500 text-xs mt-1">
                      {format(new Date(workout.date), "EEE, MMM d")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-bold">{workout.exercises.length} ex</p>
                    <p className="text-zinc-500 text-xs">{workingSets.length} sets</p>
                    {totalVolume > 0 && (
                      <p className="text-zinc-500 text-xs">
                        {totalVolume >= 1000
                          ? `${(totalVolume / 1000).toFixed(1)}k`
                          : totalVolume} lbs
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {workout.exercises.slice(0, 3).map((ex) => (
                    <span key={ex.id} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-lg">
                      {ex.exercise.name}
                    </span>
                  ))}
                  {workout.exercises.length > 3 && (
                    <span className="text-xs bg-zinc-800 text-zinc-600 px-2 py-0.5 rounded-lg">
                      +{workout.exercises.length - 3}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
