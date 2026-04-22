import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { WORKOUT_TYPES } from "@/lib/exercises";
import { format, subDays } from "date-fns";
import VolumeChart from "@/components/VolumeChart";
import PRList from "@/components/PRList";

export default async function AnalyticsPage() {
  const userId = await requireAuth();

  const [workouts, prs, exercises] = await Promise.all([
    prisma.workout.findMany({
      where: { userId },
      include: {
        exercises: {
          include: { sets: true, exercise: true },
        },
      },
      orderBy: { date: "asc" },
    }),
    prisma.personalRecord.findMany({
      where: { userId },
      include: { exercise: true },
      orderBy: { date: "desc" },
    }),
    prisma.exercise.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Volume by day (last 30 days)
  const last30 = workouts.filter(
    (w) => new Date(w.date) >= subDays(new Date(), 30)
  );

  const volumeData = last30.map((w) => ({
    date: format(new Date(w.date), "MMM d"),
    volume: w.exercises
      .flatMap((e) => e.sets.filter((s) => s.type === "WORKING"))
      .reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0), 0),
    sets: w.exercises.flatMap((e) =>
      e.sets.filter((s) => s.type === "WORKING")
    ).length,
  }));

  // Workout type distribution
  const typeDistribution = WORKOUT_TYPES.map((t) => ({
    type: t.label,
    count: workouts.filter((w) => w.type === t.value).length,
    color: t.color,
  })).filter((t) => t.count > 0);

  // Muscle group frequency
  const muscleGroupCounts: Record<string, number> = {};
  for (const w of workouts) {
    for (const ex of w.exercises) {
      const mg = ex.exercise.muscleGroup ?? "Other";
      muscleGroupCounts[mg] = (muscleGroupCounts[mg] ?? 0) + 1;
    }
  }

  // Top exercises by frequency
  const exerciseCounts: Record<string, { name: string; count: number }> = {};
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (!exerciseCounts[ex.exerciseId]) {
        exerciseCounts[ex.exerciseId] = { name: ex.exercise.name, count: 0 };
      }
      exerciseCounts[ex.exerciseId].count++;
    }
  }
  const topExercises = Object.values(exerciseCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Best PRs per exercise (weight)
  const weightPRs = prs
    .filter((pr) => pr.type === "WEIGHT")
    .reduce((acc, pr) => {
      if (!acc[pr.exerciseId] || pr.value > acc[pr.exerciseId].value) {
        acc[pr.exerciseId] = pr;
      }
      return acc;
    }, {} as Record<string, typeof prs[0]>);

  const topPRs = Object.values(weightPRs)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
      <h1 className="text-2xl font-bold text-white mb-6">Analytics</h1>

      {workouts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-zinc-500">Log some workouts to see your analytics.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Volume chart */}
          {volumeData.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <h2 className="text-white font-semibold mb-4">Volume (Last 30 Days)</h2>
              <VolumeChart data={volumeData} />
            </div>
          )}

          {/* Workout split */}
          {typeDistribution.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <h2 className="text-white font-semibold mb-4">Workout Split</h2>
              <div className="space-y-2">
                {typeDistribution.map((t) => (
                  <div key={t.type} className="flex items-center gap-3">
                    <span className="text-zinc-400 text-sm w-16">{t.type}</span>
                    <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-orange-500 rounded-full transition-all"
                        style={{
                          width: `${(t.count / workouts.length) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-zinc-500 text-sm w-6 text-right">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top exercises */}
          {topExercises.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <h2 className="text-white font-semibold mb-4">Most Frequent Exercises</h2>
              <div className="space-y-2">
                {topExercises.map((ex, i) => (
                  <div key={ex.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-zinc-600 text-sm w-4">{i + 1}</span>
                      <span className="text-white text-sm">{ex.name}</span>
                    </div>
                    <span className="text-zinc-500 text-sm">{ex.count}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PRs */}
          {topPRs.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <h2 className="text-white font-semibold mb-4">🏆 Top Lifts (PRs)</h2>
              <PRList prs={topPRs} />
            </div>
          )}

          {/* Muscle group distribution */}
          {Object.keys(muscleGroupCounts).length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <h2 className="text-white font-semibold mb-4">Muscle Group Frequency</h2>
              <div className="space-y-2">
                {Object.entries(muscleGroupCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([mg, count]) => (
                    <div key={mg} className="flex items-center gap-3">
                      <span className="text-zinc-400 text-sm w-20 truncate">{mg}</span>
                      <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{
                            width: `${(count / Math.max(...Object.values(muscleGroupCounts))) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-zinc-500 text-sm w-6 text-right">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
