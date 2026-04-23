import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest } from "next/server";
import { findExistingExerciseByName } from "@/lib/exerciseIdentity";

export async function GET() {
  const exercises = await prisma.exercise.findMany({
    orderBy: { name: "asc" },
  });
  return Response.json(exercises);
}

export async function POST(req: NextRequest) {
  await requireAuth();
  const { name, muscleGroup, splits } = await req.json();
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) {
    return Response.json({ error: "Name required" }, { status: 400 });
  }

  // Reuse an existing exercise whose name matches by case/punctuation/
  // typo so users don't end up with parallel duplicates of the same lift.
  const pool = await prisma.exercise.findMany({
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
    data: { name: trimmed, muscleGroup, splits, isCustom: true },
  });
  return Response.json(exercise);
}
