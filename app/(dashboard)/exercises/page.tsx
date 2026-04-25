import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import ExerciseManager from "@/components/ExerciseManager";
import { syncDefaultExercises } from "@/lib/actions/exercises";

export default async function ExercisesPage() {
  const userId = await requireAuth();

  // On visit, quietly sync any new default exercises
  await syncDefaultExercises();

  // Built-ins (ownerId NULL) plus the caller's own custom exercises.
  const exercises = await prisma.exercise.findMany({
    where: { OR: [{ ownerId: null }, { ownerId: userId }] },
    orderBy: [{ muscleGroup: "asc" }, { name: "asc" }],
  });

  return <ExerciseManager initial={exercises} />;
}
