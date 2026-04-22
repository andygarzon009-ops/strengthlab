import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { NextRequest } from "next/server";

export async function GET() {
  const exercises = await prisma.exercise.findMany({
    orderBy: { name: "asc" },
  });
  return Response.json(exercises);
}

export async function POST(req: NextRequest) {
  await requireAuth();
  const { name, muscleGroup, splits } = await req.json();
  const exercise = await prisma.exercise.upsert({
    where: { name },
    update: {},
    create: { name, muscleGroup, splits, isCustom: true },
  });
  return Response.json(exercise);
}
