import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest } from "next/server";
import { findExistingExerciseByName } from "@/lib/exerciseIdentity";

export async function GET() {
  const userId = await requireAuth();
  // Built-ins (ownerId NULL) plus the caller's own custom exercises.
  const exercises = await prisma.exercise.findMany({
    where: { OR: [{ ownerId: null }, { ownerId: userId }] },
    orderBy: { name: "asc" },
  });
  return Response.json(exercises);
}

export async function POST(req: NextRequest) {
  const userId = await requireAuth();
  const { name, muscleGroup, splits } = await req.json();
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) {
    return Response.json({ error: "Name required" }, { status: 400 });
  }

  // Reuse a built-in or this user's existing custom whose name matches by
  // case/punctuation/typo, so we don't end up with parallel duplicates.
  // Other users' customs are intentionally excluded from the dedupe pool.
  const pool = await prisma.exercise.findMany({
    where: { OR: [{ ownerId: null }, { ownerId: userId }] },
    select: { id: true, name: true },
  });
  const existing = findExistingExerciseByName(trimmed, pool);
  if (existing) {
    const full = await prisma.exercise.findUnique({
      where: { id: existing.id },
    });
    return Response.json(full);
  }

  const exercise = await prisma.exercise.create({
    data: {
      name: trimmed,
      muscleGroup,
      splits,
      isCustom: true,
      ownerId: userId,
    },
  });
  return Response.json(exercise);
}
