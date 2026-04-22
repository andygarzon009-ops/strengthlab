import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import ExerciseManager from "@/components/ExerciseManager";
import { syncDefaultExercises } from "@/lib/actions/exercises";

export default async function ExercisesPage() {
  await requireAuth();

  // On visit, quietly sync any new default exercises
  await syncDefaultExercises();

  const exercises = await prisma.exercise.findMany({
    orderBy: [{ muscleGroup: "asc" }, { name: "asc" }],
  });

  return <ExerciseManager initial={exercises} />;
}
