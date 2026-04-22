import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { redirect, notFound } from "next/navigation";
import WorkoutForm, { WorkoutFormInitial } from "@/components/WorkoutForm";

export default async function EditWorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireAuth();
  const { id } = await params;

  const workout = await prisma.workout.findUnique({
    where: { id },
    include: {
      exercises: {
        include: {
          exercise: true,
          sets: { orderBy: { setNumber: "asc" } },
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!workout) notFound();
  if (workout.userId !== userId) redirect(`/workout/${id}`);

  const initial: WorkoutFormInitial = {
    id: workout.id,
    title: workout.title,
    type: workout.type,
    split: workout.split,
    date: workout.date.toISOString(),
    notes: workout.notes ?? "",
    feeling: workout.feeling ?? "",
    isDeload: workout.isDeload,
    duration: workout.duration,
    distance: workout.distance,
    pace: workout.pace,
    avgHeartRate: workout.avgHeartRate,
    maxHeartRate: workout.maxHeartRate,
    rounds: workout.rounds,
    elevation: workout.elevation,
    rpe: workout.rpe,
    exercises: workout.exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      exerciseName: ex.exercise.name,
      notes: ex.notes ?? "",
      sets: ex.sets.map((s) => ({
        type: s.type as "WARMUP" | "WORKING",
        setNumber: s.setNumber,
        weight: s.weight?.toString() ?? "",
        reps: s.reps?.toString() ?? "",
        rir: s.rir?.toString() ?? "",
        notes: s.notes ?? "",
      })),
    })),
  };

  return (
    <WorkoutForm
      mode="edit"
      initial={initial}
      backHref={`/workout/${id}`}
    />
  );
}
